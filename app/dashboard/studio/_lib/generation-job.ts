import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import { getModel } from 'semantic-lady';

import {
  DEFAULT_GENERATION_OUTPUT_NUMBER,
  hasByokModelConfig,
  MODEL_IDS,
  SHERIN_INPUT_FILE_LIMIT,
  type SherinModelId,
} from '@/lib/app-config';
import type { Json } from '@/lib/database.types';
import type { StoredInputFileAsset } from './input-file-uploads';

const MAX_INPUT_FILES = SHERIN_INPUT_FILE_LIMIT;
const BABYSEA_SPECIFIC_FIELD_PREFIX = 'babysea:';
const BABYSEA_CORE_FIELD_NAMES = new Set([
  'generation_prompt',
  'generation_ratio',
  'generation_resolution',
  'generation_output_format',
  'generation_output_number',
  'generation_input_file',
  'generation_provider_order',
]);

const BabySeaSpecificValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);
const ByokParamValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

const InputFilesSchema = z.array(z.string().trim().min(1)).max(MAX_INPUT_FILES);
const InputFileUploadPathsSchema = z
  .array(z.string().trim().min(1))
  .max(MAX_INPUT_FILES);
const StorageProviderIdSchema = z.enum([
  'aws-s3',
  'backblaze-b2',
  'cloudflare-r2',
  'supabase-storage',
  'vercel-blob',
]);
const StoredInputFileAssetSchema = z.object({
  byteLength: z.number().int().nonnegative(),
  contentType: z.string().trim().min(1),
  fallbackFromProviderId: StorageProviderIdSchema.optional(),
  fallbackReason: z.string().optional(),
  originalUrl: z.url().optional(),
  publicUrl: z.url().nullable(),
  source: z.enum(['upload', 'url']),
  storagePath: z.string().trim().min(1),
  storageProvider: StorageProviderIdSchema,
  url: z.url(),
});
const StoredInputFileAssetsSchema = z
  .array(StoredInputFileAssetSchema)
  .max(MAX_INPUT_FILES);

const GenerationInputShape = {
  model: z.enum(MODEL_IDS),
  prompt: z.string().trim().max(2000),
  ratio: z.string().trim().min(1).max(16),
  generation_resolution: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).max(32).optional(),
  ),
  output_format: z.string().trim().min(1).max(16),
  generation_output_number: z.coerce
    .number()
    .int()
    .min(DEFAULT_GENERATION_OUTPUT_NUMBER)
    .max(16),
  generation_provider_order: z.string().trim().min(1).max(160),
  generation_input_file: InputFilesSchema,
  byok_params: z.record(z.string(), ByokParamValueSchema).default({}),
};

export const GenerationInputSchema = z.object(GenerationInputShape);

export const GenerateFormSchema = z
  .object({
    ...GenerationInputShape,
    generation_input_file: z.preprocess(parseInputFiles, InputFilesSchema),
  })
  .superRefine(validatePromptForModel);

export const QueuedGenerationJobSchema = z.object({
  version: z.literal(1),
  babyseaIdempotencyKey: z.uuid().optional(),
  values: GenerationInputSchema,
  babyseaSpecificParams: z.record(z.string(), BabySeaSpecificValueSchema),
  initialStorageProvider: z.string().min(1),
  inputFileAssets: StoredInputFileAssetsSchema.default([]),
  inputFileUploadPaths: InputFileUploadPathsSchema.default([]),
});

export type GenerationInput = z.infer<typeof GenerationInputSchema>;
export type QueuedGenerationJob = z.infer<typeof QueuedGenerationJobSchema>;

export function createQueuedGenerationJob(
  values: GenerationInput,
  babyseaSpecificParams: Record<string, string | number | boolean>,
  initialStorageProvider: string,
  inputFileAssets: StoredInputFileAsset[] = [],
  inputFileUploadPaths: string[] = [],
) {
  return toJsonParsedJob({
    version: 1,
    babyseaIdempotencyKey: randomUUID(),
    values,
    babyseaSpecificParams,
    initialStorageProvider,
    inputFileAssets,
    inputFileUploadPaths,
  });
}

export function retainedStorageBytesAfterInputCleanup(
  retainedAssetBytes?: number | null,
) {
  return typeof retainedAssetBytes === 'number' &&
    Number.isFinite(retainedAssetBytes) &&
    retainedAssetBytes > 0
    ? Math.trunc(retainedAssetBytes)
    : 0;
}

export function readQueuedGenerationInputFileAssets(metadata: Json | null) {
  try {
    return readQueuedGenerationJob(metadata).inputFileAssets;
  } catch {
    return [];
  }
}

export function readQueuedGenerationInputFileUploadPaths(
  metadata: Json | null,
) {
  try {
    return readQueuedGenerationJob(metadata).inputFileUploadPaths;
  } catch {
    return [];
  }
}

export function readQueuedGenerationJob(metadata: Json | null) {
  const record = toMetadataRecord(metadata);
  const job = record?.sherin_job;

  if (!job) {
    throw new Error('Generation row does not include a durable job payload.');
  }

  return QueuedGenerationJobSchema.parse(job);
}

export function parseBabySeaSpecificParams(
  formData: FormData,
  specificSchema: string[],
) {
  const params: Record<string, string | number | boolean> = {};
  const allowedSpecificFields = new Set(specificSchema);

  for (const [name, rawValue] of formData.entries()) {
    if (!name.startsWith(BABYSEA_SPECIFIC_FIELD_PREFIX)) {
      continue;
    }

    if (typeof rawValue !== 'string') {
      continue;
    }

    const key = name.slice(BABYSEA_SPECIFIC_FIELD_PREFIX.length);
    const value = rawValue.trim();

    if (!key || !value) {
      continue;
    }

    if (BABYSEA_CORE_FIELD_NAMES.has(key) || !allowedSpecificFields.has(key)) {
      throw new Error(`Unsupported BabySea field: ${key}`);
    }

    params[key] = coerceBabySeaSpecificValue(value);
  }

  return params;
}

export function mergeGenerationMetadata(...values: Array<unknown>): Json {
  const metadata: Record<string, unknown> = {};

  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(metadata, value);
    }
  }

  return metadata as Json;
}

function emptyStringToUndefined(value: unknown) {
  return value === '' || value === null ? undefined : value;
}

function parseInputFiles(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function validatePromptForModel(
  value: { model: SherinModelId; prompt: string },
  context: z.RefinementCtx,
) {
  const prompt = value.prompt.trim();

  if (hasByokModelConfig(value.model)) {
    const promptField = getModel(value.model)?.schema.find(
      (field) => field.name === 'generation_prompt',
    );

    if (!promptField) {
      return;
    }

    if (!promptField.required && prompt.length === 0) {
      return;
    }
  }

  if (prompt.length >= 3) {
    return;
  }

  context.addIssue({
    code: 'custom',
    message: 'Prompt must be at least 3 characters.',
    path: ['prompt'],
  });
}

function coerceBabySeaSpecificValue(value: string) {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function toMetadataRecord(metadata: Json | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function toJsonParsedJob(value: unknown) {
  return QueuedGenerationJobSchema.parse(JSON.parse(JSON.stringify(value)));
}
