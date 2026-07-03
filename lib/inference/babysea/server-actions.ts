import 'server-only';

import { randomUUID } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import {
  BabySea,
  type Generation,
  type GenerationProviderOrder,
  type ImageGenerationParams,
  type Model,
} from 'babysea';
import {
  getOptionalEnv,
  getOptionalPositiveIntEnv,
  requireEnv,
} from '@/lib/utils/env';

import { getBabySeaProviderOrderOverride } from '@/lib/app-config';
import {
  resolveBabySeaModelIdentifier,
  resolveBabySeaOutputFormat,
} from './models';
import type {
  InferenceCancelResult,
  InferenceGenerateOptions,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
} from '../types';

const DEFAULT_BABYSEA_BASE_URL = 'https://api.us.babysea.ai';
const BABYSEA_MODEL_LIBRARY_CACHE_SECONDS = 60 * 60;
const ALLOWED_BABYSEA_API_HOSTS = new Set([
  'api.us.babysea.ai',
  'api.eu.babysea.ai',
  'api.jp.babysea.ai',
]);
const REQUEST_TIMEOUT_MS = 20_000;
// Polling budget per worker invocation. Must stay safely below the worker
// route's `maxDuration` (60s on Vercel Pro). If the underlying BabySea
// generation runs longer, the worker exits cleanly and the next cron tick
// resumes via the idempotency key. Override with `INFERENCE_POLL_TIMEOUT_MS`
// when raising the worker `maxDuration`.
const DEFAULT_WAIT_TIMEOUT_MS = 45_000;
const WAIT_TIMEOUT_MS =
  getOptionalPositiveIntEnv('INFERENCE_POLL_TIMEOUT_MS') ??
  DEFAULT_WAIT_TIMEOUT_MS;
const POLL_INTERVAL_MS = 2_000;
const CORE_BABYSEA_IMAGE_FIELDS = new Set([
  'generation_prompt',
  'generation_ratio',
  'generation_resolution',
  'generation_output_format',
  'generation_output_number',
  'generation_input_file',
  'generation_provider_order',
]);

export function isBabySeaConfigured() {
  return Boolean(getOptionalEnv('BABYSEA_API_KEY'));
}

export type BabySeaStudioModelSchema = {
  modelIdentifier: string;
  ratios: string[];
  outputFormats: string[];
  outputNumber: number;
  resolutions: string[];
  defaultResolution?: string;
  inputFile: boolean;
  providerOrderOptions: string[];
  specificSchema: string[];
  supportedProviders: string[];
};

export async function getBabySeaStudioModelSchema(
  model: InferenceRequest['model'],
) {
  const modelIdentifier = resolveBabySeaModelIdentifier(model);
  const sdkModel = findBabySeaModel(
    await getBabySeaLibraryModels(),
    modelIdentifier,
  );

  return toBabySeaStudioModelSchema(sdkModel);
}

export async function getBabySeaStudioModelSchemas<
  TModel extends InferenceRequest['model'],
>(models: readonly TModel[]) {
  const libraryModels = await getBabySeaLibraryModels();
  const entries = models.flatMap((model) => {
    const modelIdentifier = resolveBabySeaModelIdentifier(model);
    const sdkModel = findOptionalBabySeaModel(libraryModels, modelIdentifier);

    if (!sdkModel) {
      return [];
    }

    return [[model, toBabySeaStudioModelSchema(sdkModel)] as const];
  });

  return Object.fromEntries(entries) as Partial<
    Record<TModel, BabySeaStudioModelSchema>
  >;
}

export function createBabySeaProvider(): InferenceProvider {
  return {
    id: 'babysea',
    label: 'BabySea',
    extractProviderGenerationId(metadata) {
      const value = metadata.babysea_generation_id;

      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async cancel(providerGenerationId: string): Promise<InferenceCancelResult> {
      return cancelBabySeaGeneration(providerGenerationId);
    },
    async generate(
      request: InferenceRequest,
      options,
    ): Promise<InferenceResult> {
      const client = createBabySeaClient();
      const modelIdentifier = resolveBabySeaModelIdentifier(request.model);
      const outputFormat = resolveBabySeaOutputFormat(
        request.model,
        request.outputFormat,
      );
      assertNoCoreFieldOverrides(request.babyseaSpecificParams);

      const params: ImageGenerationParams = {
        generation_prompt: request.prompt,
        generation_ratio: request.ratio,
        ...(request.resolution
          ? { generation_resolution: request.resolution }
          : {}),
        generation_output_format: outputFormat,
        generation_output_number: request.outputNumber,
        generation_provider_order:
          request.providerOrder as GenerationProviderOrder,
        ...request.babyseaSpecificParams,
        ...(request.inputFiles.length > 0
          ? { generation_input_file: request.inputFiles }
          : {}),
      } satisfies ImageGenerationParams;
      const resumedGenerationId = options?.providerGenerationId ?? null;

      if (!resumedGenerationId) {
        await assertBabySeaRequestMatchesModelSchema(modelIdentifier, params);
      }

      const generationId = resumedGenerationId
        ? resumedGenerationId
        : await startBabySeaGeneration({
            client,
            idempotencyKey: options?.idempotencyKey ?? randomUUID(),
            modelIdentifier,
            onStarted: options?.onStarted,
            outputFormat,
            params,
            request,
          });

      const completed = await client.waitForGeneration(generationId, {
        timeout: WAIT_TIMEOUT_MS,
        interval: POLL_INTERVAL_MS,
      });

      const generation = completed.data;
      const remoteUrl = firstOutputUrl(generation.generation_output_file);

      if (!remoteUrl) {
        throw new Error(
          `BabySea generation ${generation.generation_id} succeeded but did not return a downloadable asset.`,
        );
      }

      return {
        providerId: 'babysea',
        remoteUrl,
        contentType: contentTypeForBabySeaOutputFormat(request.outputFormat),
        metadata: {
          sherin_model_id: request.model,
          babysea_generation_id: generation.generation_id,
          babysea_model_identifier: generation.model_identifier,
          babysea_generation_input_file: request.inputFiles,
          babysea_generation_resolution: generation.generation_resolution,
          babysea_output_format: outputFormat,
          babysea_output_number: request.outputNumber,
          babysea_request_schema: params,
          babysea_provider_used: generation.generation_provider_used,
          babysea_provider_order: generation.generation_provider_order,
          babysea_status: generation.generation_status,
          babysea_generation_prediction_id: generation.generation_prediction_id,
          babysea_generation_output_file: generation.generation_output_file,
          babysea_remote_url: remoteUrl,
          babysea_started_at: generation.generation_started_at,
          babysea_completed_at: generation.generation_completed_at,
        },
      };
    },
  };
}

async function startBabySeaGeneration({
  client,
  idempotencyKey,
  modelIdentifier,
  onStarted,
  outputFormat,
  params,
  request,
}: {
  client: BabySea;
  idempotencyKey: string;
  modelIdentifier: string;
  onStarted: InferenceGenerateOptions['onStarted'];
  outputFormat: string;
  params: ImageGenerationParams;
  request: InferenceRequest;
}) {
  const created = await client.generate(modelIdentifier, params, {
    idempotencyKey,
  });

  if ('generation_status' in created.data) {
    throw new Error('BabySea generation was canceled before it started.');
  }

  await onStarted?.({
    sherin_model_id: request.model,
    babysea_generation_id: created.data.generation_id,
    babysea_model_identifier: created.data.model_identifier,
    babysea_generation_input_file: request.inputFiles,
    babysea_generation_resolution: request.resolution ?? null,
    babysea_output_format: outputFormat,
    babysea_output_number: request.outputNumber,
    babysea_request_schema: params,
    babysea_generation_provider_order: created.data.generation_provider_order,
    babysea_generation_prediction_id: created.data.generation_prediction_id,
    babysea_idempotency_replayed: Boolean(created.idempotency_replayed),
  });

  return created.data.generation_id;
}

async function assertBabySeaRequestMatchesModelSchema(
  modelIdentifier: string,
  params: ImageGenerationParams,
) {
  const model = findBabySeaModel(
    await getBabySeaLibraryModels(),
    modelIdentifier,
  );

  assertSupportedBabySeaModelInput(model, params);
}

const getBabySeaLibraryModels = unstable_cache(
  async () => {
    const client = createBabySeaClient();
    const modelsResponse = await client.library.models();

    return modelsResponse.data.models;
  },
  ['sherin-babysea-library-models-v1'],
  { revalidate: BABYSEA_MODEL_LIBRARY_CACHE_SECONDS },
);

function findBabySeaModel(models: readonly Model[], modelIdentifier: string) {
  const sdkModel = findOptionalBabySeaModel(models, modelIdentifier);

  if (!sdkModel) {
    throw new Error(`BabySea model not found: ${modelIdentifier}.`);
  }

  return sdkModel;
}

function findOptionalBabySeaModel(
  models: readonly Model[],
  modelIdentifier: string,
) {
  return models.find(
    (candidate) => candidate.model_identifier === modelIdentifier,
  );
}

function assertSupportedBabySeaModelInput(
  model: Model,
  params: ImageGenerationParams,
) {
  if (
    params.generation_ratio &&
    !model.schema.generation_ratio.includes(params.generation_ratio)
  ) {
    throw new Error(
      `Unsupported ratio for ${model.model_identifier}: ${params.generation_ratio}.`,
    );
  }

  if (
    params.generation_output_format &&
    !model.schema.generation_output_format.includes(
      params.generation_output_format,
    )
  ) {
    throw new Error(
      `Unsupported output format for ${model.model_identifier}: ${params.generation_output_format}.`,
    );
  }

  if (
    params.generation_resolution &&
    !model.schema.generation_resolution?.includes(
      String(params.generation_resolution),
    )
  ) {
    throw new Error(
      `Unsupported resolution for ${model.model_identifier}: ${params.generation_resolution}.`,
    );
  }

  if (
    params.generation_output_number !== undefined &&
    params.generation_output_number !== model.schema.generation_output_number
  ) {
    throw new Error(
      `Unexpected output count for ${model.model_identifier}: ${params.generation_output_number}.`,
    );
  }

  if (
    Array.isArray(params.generation_input_file) &&
    params.generation_input_file.length > 0 &&
    !model.schema.generation_input_file
  ) {
    throw new Error(
      `Input files are not supported for ${model.model_identifier}.`,
    );
  }

  if (params.generation_provider_order) {
    const allowedProviderOrders = toProviderOrderOptions(model);

    if (!allowedProviderOrders.includes(params.generation_provider_order)) {
      throw new Error(
        `Unsupported provider order for ${model.model_identifier}: ${params.generation_provider_order}.`,
      );
    }
  }

  for (const key of Object.keys(params)) {
    if (CORE_BABYSEA_IMAGE_FIELDS.has(key)) {
      continue;
    }

    if (!model.specific_schema.includes(key)) {
      throw new Error(
        `Unsupported BabySea schema field for ${model.model_identifier}: ${key}.`,
      );
    }
  }
}

function toBabySeaStudioModelSchema(model: Model): BabySeaStudioModelSchema {
  return {
    modelIdentifier: model.model_identifier,
    ratios: model.schema.generation_ratio,
    outputFormats: model.schema.generation_output_format,
    outputNumber: model.schema.generation_output_number,
    resolutions: model.schema.generation_resolution ?? [],
    defaultResolution: model.schema.generation_resolution?.[0],
    inputFile: model.schema.generation_input_file,
    providerOrderOptions: toProviderOrderOptions(model),
    specificSchema: model.specific_schema,
    supportedProviders: model.model_supported_provider,
  };
}

function contentTypeForBabySeaOutputFormat(outputFormat: string) {
  if (outputFormat === 'png') return 'image/png';
  if (outputFormat === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function assertNoCoreFieldOverrides(
  params: Record<string, string | number | boolean>,
) {
  for (const key of Object.keys(params)) {
    if (CORE_BABYSEA_IMAGE_FIELDS.has(key)) {
      throw new Error(`BabySea specific params cannot override ${key}.`);
    }
  }
}

function toProviderOrderOptions(model: Model) {
  const configuredOptions = getBabySeaProviderOrderOverride(
    model.model_identifier,
  );

  if (configuredOptions) {
    return [...configuredOptions];
  }

  const concreteOrder = model.model_supported_provider
    .map((provider) => provider.trim())
    .filter(Boolean)
    .join(', ');

  if (!concreteOrder) {
    return ['fastest'];
  }

  return model.model_supported_provider.length > 1
    ? ['fastest', concreteOrder]
    : [concreteOrder];
}

function firstOutputUrl(outputs: Generation['generation_output_file']) {
  return (
    outputs?.find(
      (value) => typeof value === 'string' && value.startsWith('https://'),
    ) ?? null
  );
}

async function cancelBabySeaGeneration(
  generationId: string,
): Promise<InferenceCancelResult> {
  if (!generationId) {
    return {
      attempted: false,
      acknowledged: false,
      error: 'Missing BabySea generation id.',
    };
  }

  try {
    await createBabySeaClient().cancelGeneration(generationId);

    return { attempted: true, acknowledged: true };
  } catch (error) {
    // BabySea returns a non-cancelable error once the generation has finished;
    // treat every failure as a best-effort no-op so the local cancel proceeds.
    return {
      attempted: true,
      acknowledged: false,
      error: error instanceof Error ? error.message : 'BabySea cancel failed.',
    };
  }
}

function createBabySeaClient() {
  const apiKey = requireEnv('BABYSEA_API_KEY').trim();
  const baseUrl = resolveBabySeaBaseUrl();

  return new BabySea({
    apiKey,
    ...(baseUrl ? { baseUrl } : { region: 'us' as const }),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });
}

function resolveBabySeaBaseUrl() {
  const configured = getOptionalEnv('BABYSEA_API_BASE_URL');

  if (!configured || configured === DEFAULT_BABYSEA_BASE_URL) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('BABYSEA_API_BASE_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('BABYSEA_API_BASE_URL must use HTTPS.');
  }

  if (!ALLOWED_BABYSEA_API_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('BABYSEA_API_BASE_URL must be a BabySea API host.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}
