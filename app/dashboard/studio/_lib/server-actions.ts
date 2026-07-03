'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';

import {
  DEFAULT_GENERATION_OUTPUT_NUMBER,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_RATIO,
  getDefaultModelIdForInferenceProvider,
  getBabySeaInputFileLimit,
  type SherinModelId,
} from '@/lib/app-config';
import type { Database, Json } from '@/lib/database.types';
import {
  resolveInferenceProvider,
  resolveInferenceProviderById,
  type InferenceCancelResult,
  type InferenceProvider,
  type InferenceProviderId,
  type InferenceRequest,
} from '@/lib/inference';
import { getBabySeaStudioModelSchema } from '@/lib/inference/babysea/server-actions';
import { isOwnerEmail } from '@/lib/auth/owner';
import { getStorageProviderStatus, removeStoredAssets } from '@/lib/storage';
import { createSupabaseAdminClient } from '@/lib/database/admin';
import { getUser } from '@/lib/database/server-actions';

import {
  createQueuedGenerationJob,
  GenerateFormSchema,
  type GenerationInput,
  mergeGenerationMetadata,
  parseBabySeaSpecificParams,
  readQueuedGenerationInputFileAssets,
  readQueuedGenerationInputFileUploadPaths,
  readQueuedGenerationJob,
  retainedStorageBytesAfterInputCleanup,
} from './generation-job';
import { processGenerationQueue } from './generation-worker';
import {
  InvalidInputFileUploadError,
  type StoredInputFileAsset,
  cleanupInputFileUploads,
  persistUploadedInputFile,
  persistUploadedInputVideoFile,
  persistUrlInputFile,
  persistUrlInputVideoFile,
} from './input-file-uploads';
import { canResumeProviderWorkload } from './provider-resume';

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type GenerationRow = Database['public']['Tables']['generations']['Row'];
type InputFileSource = 'url' | 'upload';

const STALE_QUEUED_GENERATION_MS = 5 * 60 * 1000;
const STALE_RUNNING_GENERATION_MS = 20 * 60 * 1000;
const INPUT_FILE_SOURCE_FIELD = 'generation_input_file_source';
const INPUT_FILE_UPLOAD_FIELD = 'generation_input_file_upload';
const INPUT_VIDEO_FILE_SOURCE_FIELD = 'generation_input_video_file_source';
const INPUT_VIDEO_FILE_UPLOAD_FIELD = 'generation_input_video_file_upload';
const STUDIO_ERROR_LOG_PREFIX = '[sherin:studio:error]';

export async function generateImage(formData: FormData) {
  const { user } = await getUser();

  if (!user) {
    redirect('/access');
  }

  if (!isOwnerEmail(user.email)) {
    redirect('/access?error=not_owner');
  }

  const inputFileSource = readInputFileSource(formData);
  const inputFileUploads = readInputFileUploads(formData);
  const inputVideoFileSource = readInputVideoFileSource(formData);
  const inputVideoFileUploads = readInputVideoFileUploads(formData);

  let provider;
  try {
    provider = resolveInferenceProvider();
  } catch (error) {
    logStudioError('SHERIN_INFERENCE_PROVIDER_RESOLVE_FAILED', error);
    redirectStudioError(
      'inference_unconfigured',
      'SHERIN_INFERENCE_PROVIDER_RESOLVE_FAILED',
    );
  }

  const parsed = GenerateFormSchema.safeParse({
    model:
      formData.get('model') ??
      getDefaultModelIdForInferenceProvider(provider.id),
    prompt: formData.get('prompt') ?? '',
    ratio: formData.get('ratio') ?? DEFAULT_RATIO,
    generation_resolution: formData.get('generation_resolution'),
    output_format: formData.get('output_format') ?? DEFAULT_OUTPUT_FORMAT,
    generation_output_number:
      formData.get('generation_output_number') ??
      String(DEFAULT_GENERATION_OUTPUT_NUMBER),
    generation_provider_order:
      formData.get('generation_provider_order') ?? 'fastest',
    generation_input_file:
      inputFileSource === 'url' ? formData.get('generation_input_file') : null,
  });

  if (!parsed.success) {
    logStudioError('SHERIN_FORM_PARSE_FAILED', parsed.error, {
      imageUploadCount: inputFileUploads.length,
      inputFileSource,
      inputVideoFileSource,
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      })),
      providerId: provider.id,
      videoUploadCount: inputVideoFileUploads.length,
    });
    redirectStudioError('invalid_input', 'SHERIN_FORM_PARSE_FAILED');
  }

  const admin = createSupabaseAdminClient();
  await recoverStaleActiveGenerations(admin, user.id);

  const activeGeneration = await getActiveGeneration(admin, user.id);

  if (activeGeneration) {
    scheduleGenerationQueue(user.id);
    revalidateStudioPaths();
    redirect(`/dashboard/studio?created=${activeGeneration.id}`);
  }

  let generationInput = parsed.data;

  const generationId = randomUUID();
  let babyseaSpecificParams: Record<string, string | number | boolean> = {};
  let inputFileAssets: StoredInputFileAsset[] = [];
  let inputVideoFileAssets: StoredInputFileAsset[] = [];

  if (provider.id === 'babysea') {
    const schema = await loadBabySeaSchemaOrRedirect(parsed.data.model);

    generationInput = {
      ...parsed.data,
      generation_input_file: inputFilesForPreflight(
        inputFileSource,
        parsed.data.generation_input_file,
        inputFileUploads,
      ),
      generation_resolution:
        parsed.data.generation_resolution ?? schema.defaultResolution,
    };

    if (!schema.ratios.includes(generationInput.ratio)) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (!schema.outputFormats.includes(generationInput.output_format)) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (
      schema.resolutions.length > 0 &&
      (!generationInput.generation_resolution ||
        !schema.resolutions.includes(generationInput.generation_resolution))
    ) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (generationInput.generation_output_number !== schema.outputNumber) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (
      !schema.providerOrderOptions.includes(
        generationInput.generation_provider_order,
      )
    ) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (generationInput.generation_input_file.length > 0 && !schema.inputFile) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (!generationInput.generation_input_file.every(isHttpsUrl)) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    if (
      schema.inputFile &&
      generationInput.generation_input_file.length >
        getBabySeaInputFileLimit(parsed.data.model)
    ) {
      redirect('/dashboard/studio?error=invalid_input');
    }

    try {
      babyseaSpecificParams = parseBabySeaSpecificParams(
        formData,
        schema.specificSchema,
      );
    } catch (error) {
      logStudioError('SHERIN_BABYSEA_SPECIFIC_PARAMS_PARSE_FAILED', error, {
        model: parsed.data.model,
        providerId: provider.id,
      });
      redirectStudioError(
        'invalid_input',
        'SHERIN_BABYSEA_SPECIFIC_PARAMS_PARSE_FAILED',
      );
    }

    const resolvedInputFiles = await resolveGenerationInputFilesOrRedirect({
      admin,
      generationId,
      maxFiles: schema.inputFile
        ? getBabySeaInputFileLimit(parsed.data.model)
        : 0,
      model: parsed.data.model,
      providerId: provider.id,
      source: inputFileSource,
      uploadFiles: inputFileUploads,
      urls: parsed.data.generation_input_file,
      userId: user.id,
    });
    inputFileAssets = resolvedInputFiles.assets;

    generationInput = {
      ...generationInput,
      generation_input_file: resolvedInputFiles.urls,
    };
  }

  if (provider.id !== 'babysea') {
    const preflightRequest = toInferenceRequest({
      babyseaSpecificParams: {},
      values: {
        ...parsed.data,
        generation_input_file: inputFilesForPreflight(
          inputFileSource,
          parsed.data.generation_input_file,
          inputFileUploads,
        ),
      },
    });
    const preflightInputVideoFiles = inputFilesForPreflight(
      inputVideoFileSource,
      readInputVideoFileUrls(formData),
      inputVideoFileUploads,
    );
    const byokPreflightRequest = {
      ...preflightRequest,
      byokParams: {
        ...preflightRequest.byokParams,
        ...(preflightInputVideoFiles.length > 0
          ? { generation_input_video_file: preflightInputVideoFiles }
          : {}),
      },
    };
    const prepared = await prepareByokRequestOrRedirect(
      provider,
      formData,
      byokPreflightRequest,
    );
    let resolvedInputFiles: Awaited<
      ReturnType<typeof resolveGenerationInputFilesOrRedirect>
    >;
    let resolvedInputVideoFiles: Awaited<
      ReturnType<typeof resolveGenerationInputVideoFilesOrRedirect>
    >;

    try {
      resolvedInputFiles = await resolveGenerationInputFilesOrRedirect({
        admin,
        generationId,
        maxFiles: prepared.inputImageLimit,
        model: parsed.data.model,
        providerId: provider.id,
        source: inputFileSource,
        uploadFiles: inputFileUploads,
        urls: parsed.data.generation_input_file,
        userId: user.id,
      });
      inputFileAssets = resolvedInputFiles.assets;
      resolvedInputVideoFiles =
        await resolveGenerationInputVideoFilesOrRedirect({
          admin,
          generationId,
          maxFiles: prepared.inputVideoLimit ?? 0,
          model: parsed.data.model,
          providerId: provider.id,
          source: inputVideoFileSource,
          uploadFiles: inputVideoFileUploads,
          urls: readInputVideoFileUrls(formData),
          userId: user.id,
        });
      inputVideoFileAssets = resolvedInputVideoFiles.assets;
    } catch (error) {
      await cleanupStoredInputFileAssets([
        ...inputFileAssets,
        ...inputVideoFileAssets,
      ]);

      throw error;
    }

    generationInput = fromInferenceRequest({
      ...prepared.request,
      byokParams: {
        ...prepared.request.byokParams,
        ...(resolvedInputVideoFiles.urls.length > 0
          ? { generation_input_video_file: resolvedInputVideoFiles.urls }
          : {}),
      },
      inputFiles: resolvedInputFiles.urls,
    });
  }

  const storageStatus = getStorageProviderStatus();
  const initialStorageProvider =
    storageStatus.active ?? storageStatus.preferred ?? 'supabase-storage';
  const allInputFileAssets = [...inputFileAssets, ...inputVideoFileAssets];
  const generationJob = createQueuedGenerationJob(
    generationInput,
    babyseaSpecificParams,
    initialStorageProvider,
    allInputFileAssets,
    supabaseInputFileUploadPaths(allInputFileAssets),
  );
  const inputFileBytes = allInputFileAssets.reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
  const generationMetadata = mergeGenerationMetadata({
    sherin_job: generationJob,
    ...(allInputFileAssets.length > 0
      ? {
          sherin_input_file_count: allInputFileAssets.length,
          sherin_input_file_storage_paths: allInputFileAssets.map(
            (asset) => asset.storagePath,
          ),
        }
      : {}),
    sherin_model_id: generationInput.model,
    sherin_output_format: generationInput.output_format,
    sherin_prompt: generationInput.prompt,
    ...(generationInput.generation_resolution
      ? { sherin_resolution: generationInput.generation_resolution }
      : {}),
    sherin_ratio: generationInput.ratio,
    sherin_stage: 'queued',
    sherin_started_at: new Date().toISOString(),
    sherin_storage_provider: initialStorageProvider,
  });

  const { data: generation, error: insertError } = await admin
    .from('generations')
    .insert({
      id: generationId,
      user_id: user.id,
      status: 'queued',
      inference_provider: provider.id,
      storage_provider: initialStorageProvider,
      storage_bytes: inputFileBytes,
      metadata: generationMetadata,
    })
    .select('id')
    .single();

  if (insertError) {
    await cleanupStoredInputFileAssets(allInputFileAssets);

    if (isActiveGenerationConflict(insertError)) {
      const conflictingGeneration = await getActiveGeneration(admin, user.id);

      if (conflictingGeneration) {
        scheduleGenerationQueue(user.id);
        revalidateStudioPaths();
        redirect(`/dashboard/studio?created=${conflictingGeneration.id}`);
      }

      const latestGeneration = await getLatestGeneration(admin, user.id);

      revalidateStudioPaths();

      if (latestGeneration) {
        redirect(`/dashboard/studio?created=${latestGeneration.id}`);
      }

      redirect('/dashboard/studio');
    }

    throw insertError;
  }

  if (!generation) {
    await cleanupStoredInputFileAssets(allInputFileAssets);

    throw insertError ?? new Error('Could not create generation row.');
  }

  scheduleGenerationQueue(user.id);
  revalidateStudioPaths();
  redirect(`/dashboard/studio?created=${generationId}`);
}

export async function cancelActiveGeneration() {
  const { user } = await getUser();

  if (!user) {
    redirect('/access');
  }

  if (!isOwnerEmail(user.email)) {
    redirect('/access?error=not_owner');
  }

  const admin = createSupabaseAdminClient();
  await recoverStaleActiveGenerations(admin, user.id);

  const activeGeneration = await getActiveGeneration(admin, user.id);

  if (!activeGeneration) {
    revalidateStudioPaths();
    redirect('/dashboard/studio');
  }

  const canceledAt = new Date().toISOString();
  const message =
    'Canceled by owner. Provider-side jobs already running may still complete.';
  const providerCancel = await cancelProviderGeneration(activeGeneration);
  const inputFileBytes = inputFileAssetsByteLengthFromMetadata(
    activeGeneration.metadata,
  );
  const metadata = mergeGenerationMetadata(activeGeneration.metadata, {
    sherin_error: message,
    sherin_failed_at: canceledAt,
    sherin_failed_stage: 'owner_cancelled',
    sherin_stage: 'failed',
    ...(providerCancel
      ? {
          sherin_provider_cancel_attempted: providerCancel.attempted,
          sherin_provider_cancel_acknowledged: providerCancel.acknowledged,
          ...(providerCancel.error
            ? { sherin_provider_cancel_error: providerCancel.error }
            : {}),
        }
      : {}),
  });

  const { data, error } = await admin
    .from('generations')
    .update({
      error: message,
      metadata,
      storage_bytes: inputFileBytes,
      status: 'failed',
    })
    .eq('id', activeGeneration.id)
    .eq('user_id', user.id)
    .in('status', ['queued', 'running'])
    .select('id');

  if (error) {
    throw error;
  }

  if ((data?.length ?? 0) === 0) {
    revalidateStudioPaths();
    redirect(`/dashboard/studio?created=${activeGeneration.id}`);
  }

  if (
    await cleanupQueuedGenerationInputFiles(
      admin,
      user.id,
      activeGeneration.metadata,
    )
  ) {
    await updateGenerationAfterInputCleanup(
      admin,
      activeGeneration.id,
      retainedStorageBytesAfterInputCleanup(),
      metadata,
    );
  }

  revalidateStudioPaths();
  redirect('/dashboard/studio?error=generation_cancelled');
}

function revalidateStudioPaths() {
  revalidatePath('/dashboard/studio');
  revalidatePath('/dashboard/gallery');
  revalidatePath('/dashboard/references');
  revalidatePath('/dashboard/usage');
}

function scheduleGenerationQueue(userId: string) {
  after(async () => {
    try {
      await processGenerationQueue({ limit: 1, userId });
    } catch (error) {
      console.error('Could not process generation queue after submit', error);
    }
  });
}

async function getActiveGeneration(admin: SupabaseAdminClient, userId: string) {
  const { data, error } = await admin
    .from('generations')
    .select('id,created_at,metadata,inference_provider,provider_generation_id')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function cancelProviderGeneration(activeGeneration: {
  inference_provider: string | null;
  provider_generation_id: string | null;
  metadata: Json | null;
}): Promise<InferenceCancelResult | null> {
  const providerName = activeGeneration.inference_provider;
  const providerGenerationId =
    activeGenerationProviderCancelId(activeGeneration);

  if (!providerName || !providerGenerationId) {
    return null;
  }

  let provider: InferenceProvider;

  try {
    provider = resolveInferenceProviderById(
      providerName as InferenceProviderId,
    );
  } catch (resolveError) {
    logStudioError('SHERIN_PROVIDER_CANCEL_RESOLVE_FAILED', resolveError);

    return null;
  }

  if (typeof provider.cancel !== 'function') {
    return null;
  }

  try {
    return await provider.cancel(providerGenerationId);
  } catch (cancelError) {
    logStudioError('SHERIN_PROVIDER_CANCEL_FAILED', cancelError);

    return {
      attempted: true,
      acknowledged: false,
      error:
        cancelError instanceof Error
          ? cancelError.message
          : 'Provider cancel failed.',
    };
  }
}

function activeGenerationProviderCancelId(activeGeneration: {
  provider_generation_id: string | null;
  metadata: Json | null;
}): string | null {
  if (
    typeof activeGeneration.provider_generation_id === 'string' &&
    activeGeneration.provider_generation_id.length > 0
  ) {
    return activeGeneration.provider_generation_id;
  }

  const metadata = activeGeneration.metadata;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;

  for (const key of [
    'sherin_provider_generation_id',
    'alibabacloud_task_id',
    'babysea_generation_id',
  ]) {
    const value = record[key];

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

async function recoverStaleActiveGenerations(
  admin: SupabaseAdminClient,
  userId: string,
) {
  const now = Date.now();
  const queuedBefore = new Date(now - STALE_QUEUED_GENERATION_MS).toISOString();
  const runningBefore = new Date(
    now - STALE_RUNNING_GENERATION_MS,
  ).toISOString();

  const { data, error } = await admin
    .from('generations')
    .select(
      'id,status,inference_provider,provider_generation_id,created_at,updated_at,metadata,error,retry_not_before',
    )
    .eq('user_id', userId)
    .in('status', ['queued', 'running']);

  if (error) {
    throw error;
  }

  for (const generation of data ?? []) {
    if (
      generation.status === 'queued' &&
      isQueuedGenerationStale(generation, queuedBefore) &&
      !canResumeProviderWorkload(generation)
    ) {
      await failStaleGeneration(admin, generation, queuedBefore, userId);
      continue;
    }

    if (
      generation.status === 'running' &&
      generation.updated_at < runningBefore &&
      !canResumeProviderWorkload(generation)
    ) {
      await failStaleGeneration(admin, generation, runningBefore, userId);
    }
  }
}

async function failStaleGeneration(
  admin: SupabaseAdminClient,
  generation: Pick<
    GenerationRow,
    | 'id'
    | 'status'
    | 'inference_provider'
    | 'provider_generation_id'
    | 'metadata'
    | 'error'
    | 'created_at'
    | 'updated_at'
    | 'retry_not_before'
  >,
  staleBefore: string,
  userId: string,
) {
  const failedAt = new Date().toISOString();
  const message = generation.error ?? 'Generation timed out before completion.';
  const inputFileBytes = inputFileAssetsByteLengthFromMetadata(
    generation.metadata,
  );
  const metadata = mergeGenerationMetadata(generation.metadata, {
    sherin_error: message,
    sherin_failed_at: failedAt,
    sherin_failed_stage: 'stale_recovery',
    sherin_stage: 'failed',
  });

  let query = admin
    .from('generations')
    .update({
      error: message,
      metadata,
      storage_bytes: inputFileBytes,
      status: 'failed',
    })
    .eq('id', generation.id)
    .eq('status', generation.status);

  if (generation.status === 'queued') {
    query = query.lt(
      hasRetryNotBefore(generation) ? 'retry_not_before' : 'created_at',
      staleBefore,
    );
  } else {
    query = query.lt('updated_at', staleBefore);
  }

  const { data, error } = await query.select('id');

  if (error) {
    throw error;
  }

  if ((data?.length ?? 0) > 0) {
    if (
      await cleanupQueuedGenerationInputFiles(
        admin,
        userId,
        generation.metadata,
      )
    ) {
      await updateGenerationAfterInputCleanup(
        admin,
        generation.id,
        retainedStorageBytesAfterInputCleanup(),
        metadata,
      );
    }
  }
}

function isQueuedGenerationStale(
  generation: Pick<GenerationRow, 'created_at' | 'retry_not_before'>,
  staleBefore: string,
) {
  const retryNotBeforeMs = generation.retry_not_before
    ? Date.parse(generation.retry_not_before)
    : NaN;

  if (Number.isFinite(retryNotBeforeMs)) {
    const staleBeforeMs = Date.parse(staleBefore);
    return retryNotBeforeMs < staleBeforeMs;
  }

  return generation.created_at < staleBefore;
}

function hasRetryNotBefore(
  generation: Pick<GenerationRow, 'retry_not_before'>,
) {
  return Number.isFinite(
    generation.retry_not_before ? Date.parse(generation.retry_not_before) : NaN,
  );
}

async function getLatestGeneration(admin: SupabaseAdminClient, userId: string) {
  const { data, error } = await admin
    .from('generations')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function isActiveGenerationConflict(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  const message = [record.message, record.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  return (
    record.code === '23505' &&
    message.includes('generations_one_active_per_user_idx')
  );
}

function readInputFileSource(formData: FormData): InputFileSource {
  return formData.get(INPUT_FILE_SOURCE_FIELD) === 'upload' ? 'upload' : 'url';
}

function readInputVideoFileSource(formData: FormData): InputFileSource {
  return formData.get(INPUT_VIDEO_FILE_SOURCE_FIELD) === 'upload'
    ? 'upload'
    : 'url';
}

function readInputFileUploads(formData: FormData) {
  return formData
    .getAll(INPUT_FILE_UPLOAD_FIELD)
    .filter((value): value is File => {
      if (!isUploadedFile(value)) {
        return false;
      }

      return value.name !== '' || value.size > 0;
    });
}

function readInputVideoFileUploads(formData: FormData) {
  return formData
    .getAll(INPUT_VIDEO_FILE_UPLOAD_FIELD)
    .filter((value): value is File => {
      if (!isUploadedFile(value)) {
        return false;
      }

      return value.name !== '' || value.size > 0;
    });
}

function readInputVideoFileUrls(formData: FormData) {
  const value = formData.get('generation_input_video_file');

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<File>;

  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string'
  );
}

async function prepareByokRequestOrRedirect(
  provider: InferenceProvider,
  formData: FormData,
  request: InferenceRequest,
) {
  try {
    return provider.prepareRequest
      ? await provider.prepareRequest({ formData, request })
      : { inputImageLimit: request.inputFiles.length, request };
  } catch (error) {
    logStudioError('SHERIN_BYOK_PREPARE_FAILED', error, {
      byokParamKeys: Object.keys(request.byokParams).sort(),
      inputImageCount: request.inputFiles.length,
      inputVideoCount: countParamValues(
        request.byokParams.generation_input_video_file,
      ),
      model: request.model,
      outputFormat: request.outputFormat,
      providerId: provider.id,
      ratio: request.ratio,
    });
    redirectStudioError('invalid_input', 'SHERIN_BYOK_PREPARE_FAILED');
  }
}

function toInferenceRequest({
  babyseaSpecificParams,
  values,
}: {
  babyseaSpecificParams: Record<string, string | number | boolean>;
  values: GenerationInput;
}): InferenceRequest {
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

function fromInferenceRequest(request: InferenceRequest): GenerationInput {
  return {
    byok_params: request.byokParams,
    generation_input_file: request.inputFiles,
    generation_output_number: request.outputNumber,
    generation_provider_order: request.providerOrder,
    generation_resolution: request.resolution,
    model: request.model,
    output_format: request.outputFormat,
    prompt: request.prompt,
    ratio: request.ratio,
  };
}

function inputFilesForPreflight(
  source: InputFileSource,
  urls: string[],
  uploadFiles: File[],
) {
  if (source === 'url') {
    return urls;
  }

  return uploadFiles.map((_, index) => `https://example.com/input-${index}`);
}

async function resolveGenerationInputFilesOrRedirect(input: {
  admin: SupabaseAdminClient;
  generationId: string;
  maxFiles: number;
  model: SherinModelId;
  providerId: string;
  source: InputFileSource;
  uploadFiles: File[];
  urls: string[];
  userId: string;
}) {
  try {
    return await resolveGenerationInputFiles(input);
  } catch (error) {
    logStudioError('SHERIN_INPUT_IMAGE_RESOLVE_FAILED', error, {
      feedback:
        error instanceof InvalidInputFileUploadError
          ? error.feedback
          : 'input_upload_failed',
      generationId: input.generationId,
      maxFiles: input.maxFiles,
      mediaKind: 'image',
      model: input.model,
      providerId: input.providerId,
      source: input.source,
      uploadCount: input.uploadFiles.length,
      urlCount: input.urls.length,
    });

    if (error instanceof InvalidInputFileUploadError) {
      redirectStudioError(error.feedback, 'SHERIN_INPUT_IMAGE_RESOLVE_FAILED');
    }

    redirectStudioError(
      'input_upload_failed',
      'SHERIN_INPUT_IMAGE_RESOLVE_FAILED',
    );
  }
}

async function resolveGenerationInputFiles(input: {
  admin: SupabaseAdminClient;
  generationId: string;
  maxFiles: number;
  source: InputFileSource;
  uploadFiles: File[];
  urls: string[];
  userId: string;
}) {
  if (input.source === 'url') {
    if (input.urls.length > input.maxFiles) {
      throw new InvalidInputFileUploadError(
        'Too many input image URLs.',
        'invalid_input',
      );
    }

    const assets: StoredInputFileAsset[] = [];

    try {
      let reservedBytes = 0;

      for (const [index, url] of input.urls.entries()) {
        const asset = await persistUrlInputFile({
          generationId: input.generationId,
          index,
          reservedBytes,
          url,
          userId: input.userId,
        });

        assets.push(asset);
        reservedBytes += asset.byteLength;
      }
    } catch (error) {
      await cleanupStoredInputFileAssets(assets);

      throw error;
    }

    return { assets, storagePaths: [], urls: assets.map((asset) => asset.url) };
  }

  if (input.uploadFiles.length === 0) {
    return { assets: [], storagePaths: [], urls: [] };
  }

  if (input.uploadFiles.length > input.maxFiles) {
    throw new InvalidInputFileUploadError('Too many uploaded input images.');
  }

  const assets: StoredInputFileAsset[] = [];

  try {
    let reservedBytes = 0;

    for (const [index, file] of input.uploadFiles.entries()) {
      const asset = await persistUploadedInputFile({
        file,
        generationId: input.generationId,
        index,
        reservedBytes,
        userId: input.userId,
      });

      assets.push(asset);
      reservedBytes += asset.byteLength;
    }
  } catch (error) {
    await cleanupStoredInputFileAssets(assets);

    throw error;
  }

  return {
    assets,
    storagePaths: [],
    urls: assets.map((asset) => asset.url),
  };
}

async function resolveGenerationInputVideoFilesOrRedirect(input: {
  admin: SupabaseAdminClient;
  generationId: string;
  maxFiles: number;
  model: SherinModelId;
  providerId: string;
  source: InputFileSource;
  uploadFiles: File[];
  urls: string[];
  userId: string;
}) {
  try {
    return await resolveGenerationInputVideoFiles(input);
  } catch (error) {
    logStudioError('SHERIN_INPUT_VIDEO_RESOLVE_FAILED', error, {
      feedback:
        error instanceof InvalidInputFileUploadError
          ? error.feedback
          : 'input_upload_failed',
      generationId: input.generationId,
      maxFiles: input.maxFiles,
      mediaKind: 'video',
      model: input.model,
      providerId: input.providerId,
      source: input.source,
      uploadCount: input.uploadFiles.length,
      urlCount: input.urls.length,
    });

    if (error instanceof InvalidInputFileUploadError) {
      redirectStudioError(error.feedback, 'SHERIN_INPUT_VIDEO_RESOLVE_FAILED');
    }

    redirectStudioError(
      'input_upload_failed',
      'SHERIN_INPUT_VIDEO_RESOLVE_FAILED',
    );
  }
}

function logStudioError(
  code: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  console.error(STUDIO_ERROR_LOG_PREFIX, {
    code,
    ...context,
    error: errorDetails(error),
  });
}

function redirectStudioError(error: string, _code: string): never {
  redirect(`/dashboard/studio?error=${error}`);
}

function errorDetails(error: unknown) {
  if (error instanceof InvalidInputFileUploadError) {
    return {
      cause: errorCauseDetails(error.cause),
      feedback: error.feedback,
      message: error.message,
      name: error.name,
    };
  }

  if (error instanceof Error) {
    const details = error as Error & {
      cause?: unknown;
      digest?: unknown;
      isTransient?: unknown;
      statusCode?: unknown;
    };

    return {
      cause: errorCauseDetails(details.cause),
      digest: typeof details.digest === 'string' ? details.digest : undefined,
      isTransient:
        typeof details.isTransient === 'boolean'
          ? details.isTransient
          : undefined,
      message: details.message,
      name: details.name,
      statusCode:
        typeof details.statusCode === 'number' ? details.statusCode : undefined,
    };
  }

  return { message: String(error) };
}

function errorCauseDetails(cause: unknown) {
  if (!cause || typeof cause !== 'object') {
    return undefined;
  }

  const details = cause as Error & {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
  };

  return {
    code: typeof details.code === 'string' ? details.code : undefined,
    errno: typeof details.errno === 'number' ? details.errno : undefined,
    message: typeof details.message === 'string' ? details.message : undefined,
    name: typeof details.name === 'string' ? details.name : undefined,
    syscall: typeof details.syscall === 'string' ? details.syscall : undefined,
  };
}

function countParamValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return 1;
  }

  return 0;
}

async function resolveGenerationInputVideoFiles(input: {
  admin: SupabaseAdminClient;
  generationId: string;
  maxFiles: number;
  source: InputFileSource;
  uploadFiles: File[];
  urls: string[];
  userId: string;
}) {
  if (input.source === 'url') {
    if (input.urls.length > input.maxFiles) {
      throw new InvalidInputFileUploadError(
        'Too many input video URLs.',
        'invalid_input',
      );
    }

    const assets: StoredInputFileAsset[] = [];

    try {
      let reservedBytes = 0;

      for (const [index, url] of input.urls.entries()) {
        const asset = await persistUrlInputVideoFile({
          generationId: input.generationId,
          index,
          reservedBytes,
          url,
          userId: input.userId,
        });

        assets.push(asset);
        reservedBytes += asset.byteLength;
      }
    } catch (error) {
      await cleanupStoredInputFileAssets(assets);

      throw error;
    }

    return { assets, storagePaths: [], urls: assets.map((asset) => asset.url) };
  }

  if (input.uploadFiles.length === 0) {
    return { assets: [], storagePaths: [], urls: [] };
  }

  if (input.uploadFiles.length > input.maxFiles) {
    throw new InvalidInputFileUploadError('Too many uploaded input videos.');
  }

  const assets: StoredInputFileAsset[] = [];

  try {
    let reservedBytes = 0;

    for (const [index, file] of input.uploadFiles.entries()) {
      const asset = await persistUploadedInputVideoFile({
        file,
        generationId: input.generationId,
        index,
        reservedBytes,
        userId: input.userId,
      });

      assets.push(asset);
      reservedBytes += asset.byteLength;
    }
  } catch (error) {
    await cleanupStoredInputFileAssets(assets);

    throw error;
  }

  return {
    assets,
    storagePaths: [],
    urls: assets.map((asset) => asset.url),
  };
}

async function cleanupStoredInputFileAssets(assets: StoredInputFileAsset[]) {
  if (assets.length === 0) {
    return true;
  }

  try {
    await removeStoredAssets(
      assets.map((asset) => ({
        storagePath: asset.storagePath,
        storageProvider: asset.storageProvider,
      })),
    );

    return true;
  } catch (error) {
    console.warn('Could not remove stored input images after failure', error);

    return false;
  }
}

async function cleanupQueuedGenerationInputFiles(
  admin: SupabaseAdminClient,
  userId: string,
  metadata: Json | null,
) {
  const storedAssetsCleaned = await cleanupStoredInputFileAssets(
    readQueuedGenerationInputFileAssets(metadata),
  );
  const legacyPathsCleaned = await cleanupInputFileUploads(
    admin,
    userId,
    readQueuedGenerationInputFileUploadPaths(metadata),
  );

  return storedAssetsCleaned && legacyPathsCleaned;
}

async function updateGenerationAfterInputCleanup(
  admin: SupabaseAdminClient,
  generationId: string,
  storageBytes: number,
  metadata: Json,
) {
  const cleanedMetadata = removeQueuedInputFileAssetsFromMetadata(metadata);
  const { error } = await admin
    .from('generations')
    .update({ metadata: cleanedMetadata, storage_bytes: storageBytes })
    .eq('id', generationId);

  if (error) {
    console.warn('Could not update generation after input cleanup', error);
  }
}

function removeQueuedInputFileAssetsFromMetadata(metadata: Json | null) {
  try {
    const job = readQueuedGenerationJob(metadata);

    return mergeGenerationMetadata(metadata, {
      sherin_input_file_count: 0,
      sherin_input_file_storage_paths: [],
      sherin_input_files_cleaned_at: new Date().toISOString(),
      sherin_job: {
        ...job,
        inputFileAssets: [],
        inputFileUploadPaths: [],
      },
    });
  } catch {
    return mergeGenerationMetadata(metadata, {
      sherin_input_files_cleaned_at: new Date().toISOString(),
    });
  }
}

function inputFileAssetsByteLengthFromMetadata(metadata: Json | null) {
  return readQueuedGenerationInputFileAssets(metadata).reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
}

function supabaseInputFileUploadPaths(assets: StoredInputFileAsset[]) {
  return assets
    .filter((asset) => asset.storageProvider === 'supabase-storage')
    .map((asset) => asset.storagePath);
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadBabySeaSchemaOrRedirect(model: SherinModelId) {
  try {
    return await getBabySeaStudioModelSchema(model);
  } catch (error) {
    console.error('Could not load BabySea model schema', error);
    redirect('/dashboard/studio?error=schema_unavailable');
  }
}
