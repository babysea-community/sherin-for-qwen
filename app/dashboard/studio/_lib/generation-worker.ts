import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { BYOK_INFERENCE_PROVIDER_ID } from '@/lib/app-config';
import type { Database, Json } from '@/lib/database.types';
import {
  resolveInferenceProviderById,
  type InferenceProviderId,
} from '@/lib/inference';
import {
  BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE,
  classifyInferenceError,
} from '@/lib/inference/errors';
import { getStorageProviderStatus, persistRemoteAsset } from '@/lib/storage';
import { createSupabaseAdminClient } from '@/lib/database/admin';
import { errorMessage } from '@/lib/utils';

import {
  mergeGenerationMetadata,
  readQueuedGenerationInputFileAssets,
  readQueuedGenerationJob,
  type QueuedGenerationJob,
  type GenerationInput,
} from './generation-job';
import {
  createInputFileAssetUrls,
  createSignedInputFileUrls,
} from './input-file-uploads';
import {
  canResumeBabySeaGenerationPolling,
  canResumeProviderWorkload,
  hasProviderGenerationId,
  isWithinBabySeaResumeWindow,
} from './provider-resume';

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type GenerationRow = Database['public']['Tables']['generations']['Row'];
type GenerationUpdate = Database['public']['Tables']['generations']['Update'];
type GenerationStage = 'inference' | 'storage' | 'database';

type ClaimedGeneration = {
  metadata: Json;
  processingToken: string;
  retry: boolean;
  row: GenerationRow;
};

type ProcessQueueOptions = {
  limit?: number;
  userId?: string;
};

type ProcessQueueResult = {
  claimed: number;
  failed: number;
  processed: number;
  succeeded: number;
  unavailable: number;
};

// Discriminated outcomes from a single `processClaimedGeneration()` call.
// Kept as a named union so call-sites (`processGenerationQueue` accounting,
// tests, future structured logging) can exhaustively switch on it.
type ProcessOutcome =
  'succeeded' | 'failed' | 'unavailable' | 'retry_scheduled' | 'skipped';

const GENERATION_UPDATE_RETRY_DELAYS_MS = [0, 250, 1_000] as const;
// A worker invocation that runs longer than this is assumed to have died
// (function killed by the platform, container recycled, etc.). It must be
// safely above the longest legitimate single-invocation wall time, which is
// the inference provider's poll budget (~45s) plus storage write headroom.
// Keeping it tight allows the next cron tick to reclaim and resume.
const STALE_RUNNING_GENERATION_MS = 90 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;

export async function processGenerationQueue(
  options: ProcessQueueOptions = {},
): Promise<ProcessQueueResult> {
  const admin = createSupabaseAdminClient();
  const limit = clampQueueLimit(options.limit ?? 1);
  const result: ProcessQueueResult = {
    claimed: 0,
    failed: 0,
    processed: 0,
    succeeded: 0,
    unavailable: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const claim = await claimNextGeneration(admin, options.userId);
    result.failed += claim.abandonedFailures;
    result.processed += claim.abandonedFailures;

    if (!claim.claimed) {
      break;
    }

    const claimed = claim.claimed;
    result.claimed += 1;

    const outcome = await processClaimedGeneration(admin, claimed);
    result.processed += 1;

    if (outcome === 'succeeded') {
      result.succeeded += 1;
    }

    if (outcome === 'failed') {
      result.failed += 1;
    }

    if (outcome === 'unavailable') {
      result.unavailable += 1;
    }
  }

  return result;
}

async function claimNextGeneration(
  admin: SupabaseAdminClient,
  userId: string | undefined,
): Promise<{ abandonedFailures: number; claimed: ClaimedGeneration | null }> {
  let abandonedFailures = 0;
  const staleBefore = new Date(
    Date.now() - STALE_RUNNING_GENERATION_MS,
  ).toISOString();

  for (let scan = 0; scan < 4; scan += 1) {
    const queued = await findGenerationCandidate(admin, {
      status: 'queued',
      userId,
    });

    if (queued) {
      const claimed = await claimGeneration(admin, queued);

      if (claimed) {
        return { abandonedFailures, claimed };
      }

      continue;
    }

    const staleRunning = await findGenerationCandidate(admin, {
      staleBefore,
      status: 'running',
      userId,
    });

    if (!staleRunning) {
      return { abandonedFailures, claimed: null };
    }

    if (
      getGenerationAttempt(staleRunning) >= MAX_GENERATION_ATTEMPTS &&
      !canResumeProviderWorkload(staleRunning)
    ) {
      const failed = await failAbandonedGeneration(
        admin,
        staleRunning,
        staleBefore,
      );

      if (failed) {
        abandonedFailures += 1;
      }

      continue;
    }

    const claimed = await claimGeneration(admin, staleRunning, staleBefore);

    if (claimed) {
      return { abandonedFailures, claimed };
    }
  }

  return { abandonedFailures, claimed: null };
}

async function findGenerationCandidate(
  admin: SupabaseAdminClient,
  {
    staleBefore,
    status,
    userId,
  }: { staleBefore?: string; status: 'queued' | 'running'; userId?: string },
) {
  let query = admin
    .from('generations')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(1);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (status === 'running' && staleBefore) {
    query = query.lt('updated_at', staleBefore);
  }

  if (status === 'queued') {
    query = query.or(
      `retry_not_before.is.null,retry_not_before.lte.${new Date().toISOString()}`,
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function claimGeneration(
  admin: SupabaseAdminClient,
  generation: GenerationRow,
  staleBefore?: string,
): Promise<ClaimedGeneration | null> {
  const processingToken = randomUUID();
  const attempt = getGenerationAttempt(generation) + 1;
  const claimedAt = new Date().toISOString();
  const metadata = mergeGenerationMetadata(generation.metadata, {
    sherin_claimed_at: claimedAt,
    sherin_processing_attempt: attempt,
    sherin_processing_token: processingToken,
    sherin_stage: 'worker_claimed',
  });

  let query = admin
    .from('generations')
    .update({
      error: null,
      metadata,
      retry_not_before: null,
      status: 'running',
    })
    .eq('id', generation.id)
    .eq('status', generation.status);

  if (generation.status === 'running' && staleBefore) {
    query = query.lt('updated_at', staleBefore);
  }

  const { data, error } = await query.select('*').maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    metadata,
    processingToken,
    retry: generation.status === 'running',
    row: data,
  };
}

async function processClaimedGeneration(
  admin: SupabaseAdminClient,
  claimed: ClaimedGeneration,
): Promise<ProcessOutcome> {
  let generationStage: GenerationStage = 'inference';
  let generationMetadata = claimed.metadata;
  let providerId: InferenceProviderId | null = null;
  let currentProviderGenerationId = claimed.row.provider_generation_id;

  try {
    const job = readQueuedGenerationJob(claimed.row.metadata);
    providerId = toInferenceProviderId(claimed.row.inference_provider);
    const activeProviderId = providerId;
    const provider = resolveInferenceProviderById(activeProviderId);
    const resumeMetadata = toMetadataRecord(claimed.row.metadata);
    const hasAcceptedProviderRequest = hasProviderGenerationId(claimed.row);
    let inferenceJob = job;

    if (!hasAcceptedProviderRequest) {
      const prepared = await prepareInferenceJob({
        admin,
        generationId: claimed.row.id,
        job,
        metadata: generationMetadata,
        processingToken: claimed.processingToken,
        userId: claimed.row.user_id,
      });

      inferenceJob = prepared.job;
      generationMetadata = prepared.metadata;
    }

    if (
      claimed.retry &&
      provider.submitPolicy &&
      !hasProviderGenerationId(claimed.row)
    ) {
      const submitAttempts = getProviderSubmitAttempts(resumeMetadata);

      if (
        submitAttempts >=
        provider.submitPolicy.maxSubmitAttemptsWithoutProviderId
      ) {
        throw new Error(
          'Provider submit state was not persisted after the maximum allowed resubmit. Refusing to resubmit again because this provider is not idempotent and further attempts would risk duplicate charges.',
        );
      }

      console.warn('[sherin:worker] resubmitting after worker crash', {
        generationId: claimed.row.id,
        providerId: activeProviderId,
        submitAttempts,
      });

      generationMetadata = mergeGenerationMetadata(generationMetadata, {
        sherin_provider_duplicate_risk: true,
        sherin_stage: 'provider_resubmit_after_crash',
      });

      await updateGenerationMetadata(
        admin,
        claimed.row.id,
        claimed.processingToken,
        generationMetadata,
      );
    }

    const result = await provider.generate(toInferenceRequest(inferenceJob), {
      idempotencyKey: idempotencyKeyForGeneration(
        activeProviderId,
        inferenceJob,
        claimed.row.id,
      ),
      providerGenerationId: currentProviderGenerationId ?? undefined,
      onPreSubmit: async (metadata) => {
        const submitAttempts = provider.submitPolicy
          ? getProviderSubmitAttempts(toMetadataRecord(generationMetadata)) + 1
          : undefined;

        generationMetadata = mergeGenerationMetadata(
          generationMetadata,
          metadata,
          submitAttempts !== undefined
            ? {
                sherin_provider_submit_attempts: submitAttempts,
                sherin_provider_submit_attempted_at: new Date().toISOString(),
              }
            : {},
        );

        await updateGenerationMetadata(
          admin,
          claimed.row.id,
          claimed.processingToken,
          generationMetadata,
        );
      },
      onStarted: async (metadata) => {
        const providerGenerationId = providerGenerationIdFromMetadata(
          provider,
          metadata,
        );
        currentProviderGenerationId =
          providerGenerationId ?? currentProviderGenerationId;
        generationMetadata = mergeGenerationMetadata(
          generationMetadata,
          metadata,
          providerGenerationMetadata(providerGenerationId),
          {
            sherin_inference_started_at: new Date().toISOString(),
            sherin_stage: 'inference_started',
          },
        );

        await updateGenerationMetadata(
          admin,
          claimed.row.id,
          claimed.processingToken,
          generationMetadata,
          providerGenerationId
            ? { provider_generation_id: providerGenerationId }
            : {},
        );
      },
      resumeMetadata,
    });

    const providerGenerationId =
      currentProviderGenerationId ??
      providerGenerationIdFromMetadata(provider, result.metadata);
    currentProviderGenerationId =
      providerGenerationId ?? currentProviderGenerationId;

    generationMetadata = mergeGenerationMetadata(
      generationMetadata,
      result.metadata,
      providerGenerationMetadata(providerGenerationId),
      {
        sherin_inference_completed_at: new Date().toISOString(),
        sherin_stage: 'inference_completed',
      },
    );

    await updateGenerationMetadata(
      admin,
      claimed.row.id,
      claimed.processingToken,
      generationMetadata,
      providerGenerationId
        ? { provider_generation_id: providerGenerationId }
        : {},
    );

    generationStage = 'storage';

    try {
      const inputFileBytes = inputFileAssetsByteLength(job);
      const storedAsset = await persistRemoteAsset({
        generationId: claimed.row.id,
        outputFormat: inferenceJob.values.output_format,
        remoteUrl: result.remoteUrl,
        userId: claimed.row.user_id,
      });

      generationMetadata = mergeGenerationMetadata(generationMetadata, {
        ...(storedAsset.fallbackFromProviderId
          ? {
              sherin_storage_fallback_from: storedAsset.fallbackFromProviderId,
            }
          : {}),
        ...(storedAsset.fallbackReason
          ? { sherin_storage_fallback_reason: storedAsset.fallbackReason }
          : {}),
        sherin_stage: 'storage_completed',
        sherin_completed_at: new Date().toISOString(),
        sherin_asset_content_type: storedAsset.contentType,
        sherin_asset_file_size_bytes: storedAsset.byteLength,
        sherin_storage_completed_at: new Date().toISOString(),
        sherin_storage_path: storedAsset.storagePath,
        sherin_storage_provider: storedAsset.providerId,
        ...(storedAsset.publicUrl
          ? { sherin_storage_public_url: storedAsset.publicUrl }
          : {}),
      });

      generationStage = 'database';
      const saved = await updateClaimedGenerationWithRetry(
        admin,
        claimed.row.id,
        claimed.processingToken,
        {
          error: null,
          metadata: generationMetadata,
          status: 'succeeded',
          storage_provider: storedAsset.providerId,
          storage_bytes: inputFileBytes + storedAsset.byteLength,
        },
      );

      if (!saved) {
        console.warn('Generation completed after its worker lease was lost', {
          generationId: claimed.row.id,
        });

        revalidateStudioPaths();
        return 'skipped' as const;
      }

      console.info('[sherin:storage] generation_storage_row_saved', {
        fallbackFromProviderId: storedAsset.fallbackFromProviderId ?? null,
        generationId: claimed.row.id,
        hasPublicUrl: Boolean(storedAsset.publicUrl),
        storagePath: storedAsset.storagePath,
        storageProvider: storedAsset.providerId,
      });

      revalidateStudioPaths();
      return 'succeeded' as const;
    } catch (storageError) {
      const initialStorageProvider =
        job.initialStorageProvider ||
        claimed.row.storage_provider ||
        getStorageProviderStatus().active ||
        'supabase-storage';

      console.error('[sherin:storage] generation_storage_failed', {
        error: errorMessage(storageError),
        generationId: claimed.row.id,
        storageProvider: initialStorageProvider,
      });

      generationMetadata = mergeGenerationMetadata(generationMetadata, {
        sherin_stage: 'storage_failed',
        sherin_completed_at: new Date().toISOString(),
        sherin_storage_error: errorMessage(storageError),
        sherin_storage_failed_at: new Date().toISOString(),
        sherin_storage_provider: initialStorageProvider,
      });

      generationStage = 'database';
      const storageErrorMessage = errorMessage(storageError);
      const saved = await updateClaimedGenerationWithRetry(
        admin,
        claimed.row.id,
        claimed.processingToken,
        {
          error: storageErrorMessage,
          metadata: generationMetadata,
          storage_bytes: inputFileAssetsByteLength(job),
          status: 'unavailable',
        },
      );

      if (!saved) {
        console.warn('Generation storage fallback completed after lease loss', {
          generationId: claimed.row.id,
        });

        revalidateStudioPaths();
        return 'skipped' as const;
      }

      revalidateStudioPaths();
      return 'unavailable' as const;
    }
  } catch (error) {
    const message = errorMessage(error);
    const classification = classifyInferenceError(error);
    const attempt = getGenerationAttempt(claimed.row);
    const resumeGeneration = currentProviderGenerationId
      ? {
          ...claimed.row,
          provider_generation_id: currentProviderGenerationId,
        }
      : claimed.row;
    const isByokPollBudgetYield =
      providerId !== null &&
      providerId !== 'babysea' &&
      classification.code === 'timeout' &&
      canResumeProviderWorkload(resumeGeneration);
    const isBabySeaPollBudgetYield =
      providerId === 'babysea' &&
      classification.code === 'timeout' &&
      canResumeBabySeaGenerationPolling(resumeGeneration);
    const isBabySeaIdempotencyYield =
      providerId === 'babysea' &&
      classification.code === BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE &&
      isWithinBabySeaResumeWindow(claimed.row);
    // Only the inference stage is safe to retry. Storage/database failures
    // can leave persisted side effects (uploaded blobs, partial rows) and
    // are surfaced as `unavailable` or terminal failures elsewhere.
    const shouldRetryTransient =
      generationStage === 'inference' &&
      classification.isTransient &&
      (attempt < MAX_GENERATION_ATTEMPTS ||
        isByokPollBudgetYield ||
        isBabySeaPollBudgetYield ||
        isBabySeaIdempotencyYield);

    if (shouldRetryTransient) {
      const retryAt = new Date(
        Date.now() + classification.retryAfterSeconds * 1000,
      ).toISOString();
      generationMetadata = mergeGenerationMetadata(generationMetadata, {
        sherin_stage: 'retry_scheduled',
        sherin_last_transient_error: message,
        sherin_last_transient_error_code: classification.code,
        sherin_last_transient_error_at: new Date().toISOString(),
        sherin_last_retry_after_seconds: classification.retryAfterSeconds,
        sherin_retry_not_before: retryAt,
      });

      try {
        const requeued = await updateClaimedGenerationWithRetry(
          admin,
          claimed.row.id,
          claimed.processingToken,
          {
            // Clear the user-facing error column so the UI does not show a
            // permanent failure between transient retries.
            error: null,
            metadata: generationMetadata,
            retry_not_before: retryAt,
            status: 'queued',
          },
        );

        if (!requeued) {
          console.warn(
            'Transient generation failure detected but worker lease was lost before re-queue',
            { generationId: claimed.row.id },
          );
          revalidateStudioPaths();
          return 'skipped' as const;
        }

        console.info('[sherin:worker] generation_retry_scheduled', {
          generationId: claimed.row.id,
          attempt,
          retryAfterSeconds: classification.retryAfterSeconds,
          statusCode: classification.statusCode,
          code: classification.code,
        });
      } catch (requeueError) {
        console.error(
          'Could not re-queue transient generation failure',
          requeueError,
        );
      }

      revalidateStudioPaths();
      return 'retry_scheduled' as const;
    }

    generationMetadata = mergeGenerationMetadata(generationMetadata, {
      sherin_error: message,
      sherin_error_code: classification.code,
      sherin_error_status_code: classification.statusCode,
      sherin_failed_at: new Date().toISOString(),
      sherin_failed_stage: generationStage,
      sherin_stage: 'failed',
    });

    try {
      const saved = await updateClaimedGenerationWithRetry(
        admin,
        claimed.row.id,
        claimed.processingToken,
        {
          error: message,
          metadata: generationMetadata,
          storage_bytes:
            inputFileAssetsByteLengthFromMetadata(generationMetadata),
          status: 'failed',
        },
      );

      if (!saved) {
        console.warn('Generation failed after its worker lease was lost', {
          generationId: claimed.row.id,
        });

        revalidateStudioPaths();
        return 'skipped' as const;
      }
    } catch (failureUpdateError) {
      console.error(
        'Could not persist failed generation state',
        failureUpdateError,
      );
    }

    revalidateStudioPaths();
    return 'failed' as const;
  }
}

async function prepareInferenceJob({
  admin,
  generationId,
  job,
  metadata,
  processingToken,
  userId,
}: {
  admin: SupabaseAdminClient;
  generationId: string;
  job: QueuedGenerationJob;
  metadata: Json;
  processingToken: string;
  userId: string;
}): Promise<{ job: QueuedGenerationJob; metadata: Json }> {
  if (job.inputFileAssets.length > 0) {
    const imageAssets = job.inputFileAssets.filter((asset) =>
      asset.contentType.startsWith('image/'),
    );
    const videoAssets = job.inputFileAssets.filter((asset) =>
      asset.contentType.startsWith('video/'),
    );
    const imageUrls = await createInputFileAssetUrls(imageAssets);
    const videoUrls = await createInputFileAssetUrls(videoAssets);
    const preparedJob = {
      ...job,
      values: {
        ...job.values,
        generation_input_file: imageUrls,
        byok_params:
          videoUrls.length > 0
            ? {
                ...job.values.byok_params,
                generation_input_video_file: videoUrls,
              }
            : job.values.byok_params,
      },
    };
    const preparedMetadata = mergeGenerationMetadata(metadata, {
      sherin_job: preparedJob,
    });

    await updateGenerationMetadata(
      admin,
      generationId,
      processingToken,
      preparedMetadata,
    );

    return { job: preparedJob, metadata: preparedMetadata };
  }

  if (job.inputFileUploadPaths.length === 0 || hasStableInputFileUrls(job)) {
    return { job, metadata };
  }

  return prepareLegacyInputFileUploadPaths({
    admin,
    generationId,
    job,
    metadata,
    processingToken,
    userId,
  });
}

async function prepareLegacyInputFileUploadPaths({
  admin,
  generationId,
  job,
  metadata,
  processingToken,
  userId,
}: {
  admin: SupabaseAdminClient;
  generationId: string;
  job: QueuedGenerationJob;
  metadata: Json;
  processingToken: string;
  userId: string;
}) {
  const inputFileUrls = await createSignedInputFileUrls(
    admin,
    userId,
    job.inputFileUploadPaths,
  );
  const preparedJob = {
    ...job,
    values: {
      ...job.values,
      generation_input_file: inputFileUrls,
    },
  };
  const preparedMetadata = mergeGenerationMetadata(metadata, {
    sherin_job: preparedJob,
  });

  await updateGenerationMetadata(
    admin,
    generationId,
    processingToken,
    preparedMetadata,
  );

  return { job: preparedJob, metadata: preparedMetadata };
}

function hasStableInputFileUrls(job: QueuedGenerationJob) {
  return (
    job.values.generation_input_file.length ===
      job.inputFileUploadPaths.length &&
    job.values.generation_input_file.every(isHttpsUrl)
  );
}

function inputFileAssetsByteLength(job: QueuedGenerationJob) {
  return job.inputFileAssets.reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
}

function inputFileAssetsByteLengthFromMetadata(metadata: Json | null) {
  return readQueuedGenerationInputFileAssets(metadata).reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
}

function idempotencyKeyForGeneration(
  providerId: InferenceProviderId,
  job: QueuedGenerationJob,
  generationId: string,
) {
  if (providerId === 'babysea') {
    return job.babyseaIdempotencyKey ?? generationId;
  }

  return generationId;
}

async function updateGenerationMetadata(
  admin: SupabaseAdminClient,
  generationId: string,
  processingToken: string,
  metadata: Json,
  values: Omit<GenerationUpdate, 'metadata'> = {},
) {
  const saved = await updateClaimedGenerationWithRetry(
    admin,
    generationId,
    processingToken,
    { ...values, metadata },
  );

  if (!saved) {
    throw new Error('Generation worker lease was lost before metadata saved.');
  }
}

async function updateClaimedGenerationWithRetry(
  admin: SupabaseAdminClient,
  generationId: string,
  processingToken: string,
  values: GenerationUpdate,
): Promise<boolean> {
  let lastError: unknown = null;

  for (const delayMs of GENERATION_UPDATE_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const { data, error } = await admin
      .from('generations')
      .update(values)
      .eq('id', generationId)
      .eq('status', 'running')
      .contains('metadata', { sherin_processing_token: processingToken })
      .select('id');

    if (!error) {
      return (data?.length ?? 0) > 0;
    }

    lastError = error;
  }

  throw new Error(errorMessage(lastError));
}

async function failAbandonedGeneration(
  admin: SupabaseAdminClient,
  generation: GenerationRow,
  staleBefore: string,
): Promise<boolean> {
  const message = `Generation could not be completed after ${MAX_GENERATION_ATTEMPTS} worker attempts.`;
  const inputFileBytes = inputFileAssetsByteLengthFromMetadata(
    generation.metadata,
  );
  const metadata = mergeGenerationMetadata(generation.metadata, {
    sherin_error: message,
    sherin_failed_at: new Date().toISOString(),
    sherin_failed_stage: 'inference',
    sherin_stage: 'failed',
  });

  const { data, error } = await admin
    .from('generations')
    .update({
      error: message,
      metadata,
      storage_bytes: inputFileBytes,
      status: 'failed',
    })
    .eq('id', generation.id)
    .eq('status', 'running')
    .lt('updated_at', staleBefore)
    .select('id');

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}

function toInferenceRequest({
  babyseaSpecificParams,
  values,
}: {
  babyseaSpecificParams: Record<string, string | number | boolean>;
  values: GenerationInput;
}) {
  return {
    babyseaSpecificParams,
    byokParams: values.byok_params,
    inputFiles: values.generation_input_file,
    model: values.model,
    outputFormat: values.output_format,
    outputNumber: values.generation_output_number,
    prompt: values.prompt,
    providerOrder: values.generation_provider_order,
    ratio: values.ratio,
    resolution: values.generation_resolution,
  };
}

function toInferenceProviderId(value: string): InferenceProviderId {
  if (value === 'babysea' || value === BYOK_INFERENCE_PROVIDER_ID) {
    return value;
  }

  throw new Error(`Unsupported queued inference provider: ${value}`);
}

function toMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getProviderSubmitAttempts(metadata: Record<string, unknown> | null) {
  const value = metadata?.sherin_provider_submit_attempts;

  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

function getGenerationAttempt(generation: GenerationRow) {
  return getProcessingAttempt(generation.metadata);
}

function getProcessingAttempt(metadata: Json | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 0;
  }

  const value = (metadata as Record<string, unknown>).sherin_processing_attempt;

  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function providerGenerationIdFromMetadata(
  provider: ReturnType<typeof resolveInferenceProviderById>,
  metadata: unknown,
) {
  const record = toMetadataRecord(metadata);
  const value = record ? provider.extractProviderGenerationId?.(record) : null;

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function providerGenerationMetadata(providerGenerationId: string | null) {
  return providerGenerationId
    ? { sherin_provider_generation_id: providerGenerationId }
    : {};
}

function clampQueueLimit(limit: number) {
  if (!Number.isFinite(limit)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 3);
}

function revalidateStudioPaths() {
  revalidatePath('/dashboard/studio');
  revalidatePath('/dashboard/gallery');
  revalidatePath('/dashboard/references');
  revalidatePath('/dashboard/usage');
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
