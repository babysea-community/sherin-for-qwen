import {
  getModel as getSemanticLadyModel,
  type SemanticLadyField,
  type SemanticLadyModel,
} from 'semantic-lady';

const MODEL_LABEL_COLLATOR = new Intl.Collator('en', {
  ignorePunctuation: true,
  numeric: true,
  sensitivity: 'base',
});

export const ALIBABACLOUD_PROVIDER_ID = 'alibaba-cloud' as const;
export const ALIBABACLOUD_PROVIDER_LABEL = 'Alibaba Cloud';
export const ALIBABACLOUD_PROVIDER_KEYWORD = 'alibaba-cloud';

const ALIBABACLOUD_MODEL_OPTION_VALUES = [
  { id: 'qwen/image', label: 'Qwen Image' },
  { id: 'qwen/image-plus', label: 'Qwen Image Plus' },
  { id: 'qwen/image-2', label: 'Qwen Image 2.0' },
  { id: 'qwen/image-2-pro', label: 'Qwen Image 2.0 Pro' },
  { id: 'qwen/image-max', label: 'Qwen Image Max' },
  { id: 'qwen/image-edit', label: 'Qwen Image Edit' },
  { id: 'qwen/image-edit-max', label: 'Qwen Image Edit Max' },
  { id: 'qwen/image-edit-plus', label: 'Qwen Image Edit Plus' },
  { id: 'wan/2.1-imageedit', label: 'Wan 2.1 Image Edit' },
  { id: 'wan/2.5-i2i-preview', label: 'Wan 2.5 Image-to-Image Preview' },
  { id: 'wan/2.6-image', label: 'Wan 2.6 Image' },
  { id: 'wan/2.6-t2i', label: 'Wan 2.6 Text-to-Image' },
  { id: 'wan/2.7-image', label: 'Wan 2.7 Image' },
  { id: 'wan/2.7-image-pro', label: 'Wan 2.7 Image Pro' },
  { id: 'wan/2.2-animate-mix', label: 'Wan 2.2 Animate Mix' },
  { id: 'wan/2.2-animate-move', label: 'Wan 2.2 Animate Move' },
  { id: 'wan/2.7-i2v-2026-04-25', label: 'Wan 2.7 Image-to-Video' },
  { id: 'wan/2.7-r2v', label: 'Wan 2.7 Reference-to-Video' },
  { id: 'wan/2.7-t2v', label: 'Wan 2.7 Text-to-Video' },
  { id: 'wan/2.7-videoedit', label: 'Wan 2.7 Video Edit' },
  { id: 'happyhorse/1.0-i2v', label: 'HappyHorse 1.0 Image-to-Video' },
  { id: 'happyhorse/1.0-r2v', label: 'HappyHorse 1.0 Reference-to-Video' },
  { id: 'happyhorse/1.0-t2v', label: 'HappyHorse 1.0 Text-to-Video' },
  { id: 'happyhorse/1.0-video-edit', label: 'HappyHorse 1.0 Video Edit' },
  { id: 'z/image-turbo', label: 'Z Image Turbo' },
] as const;

export type AlibabaCloudModelId =
  (typeof ALIBABACLOUD_MODEL_OPTION_VALUES)[number]['id'];

type AlibabaCloudModelOption = {
  readonly id: AlibabaCloudModelId;
  readonly label: string;
};

export const ALIBABACLOUD_MODEL_OPTIONS = [
  ...ALIBABACLOUD_MODEL_OPTION_VALUES,
].sort(compareAlibabaCloudModelOptions) as AlibabaCloudModelOption[];

export const ALIBABACLOUD_MODEL_IDS = ALIBABACLOUD_MODEL_OPTIONS.map(
  (model) => model.id,
) as [AlibabaCloudModelId, ...AlibabaCloudModelId[]];

export const ALIBABACLOUD_DEFAULT_MODEL_ID: AlibabaCloudModelId = 'qwen/image';
export const ALIBABACLOUD_MODEL_ID_PREFIX = '';

export type AlibabaCloudOutputFormat = 'mp4' | 'png';

export const ALIBABACLOUD_OUTPUT_FORMATS = ['png', 'mp4'] as const;
export const ALIBABACLOUD_DEFAULT_OUTPUT_FORMAT: AlibabaCloudOutputFormat =
  'png';

export type AlibabaCloudModelConfig = {
  providerModel: string;
  schema: readonly SemanticLadyField[];
  kind: 'image' | 'video';
  workflows: readonly string[];
  inputImageLimit: number;
  requiresImageInput: boolean;
  supportsImageInput: boolean;
  inputVideoLimit: number;
  requiresVideoInput: boolean;
  supportsVideoInput: boolean;
  outputFormats: readonly AlibabaCloudOutputFormat[];
  outputContentType: 'image/png' | 'video/mp4';
  ratios: readonly string[];
  defaultRatio: string;
  resolutions: readonly string[];
  defaultResolution?: string;
  duration?: {
    defaultValue: number;
    max: number;
    min: number;
    required: boolean;
  };
  promptSupported: boolean;
  promptRequired: boolean;
  supportsModeration: boolean;
  seed?: {
    max: number;
    min: number;
  };
};

export type AlibabaCloudBabySeaModelConfig = {
  identifier: AlibabaCloudModelId;
  inputMediaLimit: number;
  outputFormatMap: Partial<Record<string, string>>;
  providerOrderOptions?: readonly string[];
};

export const ALIBABACLOUD_MODEL_CONFIGS = Object.fromEntries(
  ALIBABACLOUD_MODEL_IDS.map((model) => [
    model,
    createAlibabaCloudModelConfig(model),
  ]),
) as Record<AlibabaCloudModelId, AlibabaCloudModelConfig>;

export const ALIBABACLOUD_BABYSEA_MODEL_CONFIGS = Object.fromEntries(
  ALIBABACLOUD_MODEL_IDS.map((model) => [
    model,
    createAlibabaCloudBabySeaModelConfig(model),
  ]),
) as Record<AlibabaCloudModelId, AlibabaCloudBabySeaModelConfig>;

export const ALIBABACLOUD_RATIO_OPTIONS = uniqueStrings(
  ALIBABACLOUD_MODEL_IDS.flatMap((model) => [
    ...ALIBABACLOUD_MODEL_CONFIGS[model].ratios,
  ]),
);

export const ALIBABACLOUD_RESOLUTION_OPTIONS = uniqueStrings(
  ALIBABACLOUD_MODEL_IDS.flatMap((model) => [
    ...ALIBABACLOUD_MODEL_CONFIGS[model].resolutions,
  ]),
);

export const ALIBABACLOUD_DEFAULT_RATIO =
  ALIBABACLOUD_MODEL_CONFIGS[ALIBABACLOUD_DEFAULT_MODEL_ID].defaultRatio;
export const ALIBABACLOUD_DEFAULT_RESOLUTION =
  ALIBABACLOUD_MODEL_CONFIGS[ALIBABACLOUD_DEFAULT_MODEL_ID].defaultResolution;

export const SHERIN_BYOK_FAMILY = {
  babySeaModelConfigs: ALIBABACLOUD_BABYSEA_MODEL_CONFIGS,
  defaultGenerationGuidance: 5,
  defaultGenerationSteps: 50,
  defaultModelId: ALIBABACLOUD_DEFAULT_MODEL_ID,
  defaultOutputFormat: ALIBABACLOUD_DEFAULT_OUTPUT_FORMAT,
  defaultRatio: ALIBABACLOUD_DEFAULT_RATIO,
  defaultResolution: ALIBABACLOUD_DEFAULT_RESOLUTION,
  defaultSafetyTolerance: 2,
  modelConfigs: ALIBABACLOUD_MODEL_CONFIGS,
  modelIdPrefix: ALIBABACLOUD_MODEL_ID_PREFIX,
  modelIds: ALIBABACLOUD_MODEL_IDS,
  modelOptions: ALIBABACLOUD_MODEL_OPTIONS,
  outputFormats: ALIBABACLOUD_OUTPUT_FORMATS,
  providerId: ALIBABACLOUD_PROVIDER_ID,
  providerKeyword: ALIBABACLOUD_PROVIDER_KEYWORD,
  providerLabel: ALIBABACLOUD_PROVIDER_LABEL,
  ratioOptions: ALIBABACLOUD_RATIO_OPTIONS,
  resolutionOptions: ALIBABACLOUD_RESOLUTION_OPTIONS,
} as const;

export function hasAlibabaCloudModelConfig(
  model: string,
): model is AlibabaCloudModelId {
  return model in ALIBABACLOUD_MODEL_CONFIGS;
}

export const hasProviderModelConfig = hasAlibabaCloudModelConfig;

export function getAlibabaCloudSemanticModel(
  modelIdentifier: AlibabaCloudModelId,
): SemanticLadyModel {
  const model = getSemanticLadyModel(modelIdentifier);

  if (!model || model.provider !== ALIBABACLOUD_PROVIDER_ID) {
    throw new Error(
      `Semantic Lady does not define Alibaba Cloud model ${modelIdentifier}.`,
    );
  }

  return model;
}

function compareAlibabaCloudModelOptions(
  left: AlibabaCloudModelOption,
  right: AlibabaCloudModelOption,
) {
  return (
    modelKindRank(getAlibabaCloudSemanticModel(left.id).kind) -
      modelKindRank(getAlibabaCloudSemanticModel(right.id).kind) ||
    MODEL_LABEL_COLLATOR.compare(left.label, right.label) ||
    MODEL_LABEL_COLLATOR.compare(left.id, right.id)
  );
}

function modelKindRank(kind: SemanticLadyModel['kind']) {
  return kind === 'image' ? 0 : 1;
}

function createAlibabaCloudBabySeaModelConfig(
  model: AlibabaCloudModelId,
): AlibabaCloudBabySeaModelConfig {
  const config = ALIBABACLOUD_MODEL_CONFIGS[model];

  return {
    identifier: model,
    inputMediaLimit: Math.max(config.inputImageLimit, config.inputVideoLimit),
    outputFormatMap: {},
  };
}

function createAlibabaCloudModelConfig(
  model: AlibabaCloudModelId,
): AlibabaCloudModelConfig {
  const semanticModel = getAlibabaCloudSemanticModel(model);
  const size = getField(semanticModel, 'generation_size');
  const aspectRatio = getField(semanticModel, 'generation_aspect_ratio');
  const resolution = getField(semanticModel, 'generation_resolution');
  const duration = getField(semanticModel, 'generation_duration');
  const seed = getField(semanticModel, 'generation_seed');
  const imageInput = getField(semanticModel, 'generation_input_image_file');
  const videoInput = getField(semanticModel, 'generation_input_video_file');
  const isVideo = semanticModel.kind === 'video';
  const inputImageLimit = imageInput ? (isVideo ? 2 : 4) : 0;
  const inputVideoLimit = videoInput ? 1 : 0;

  const ratios = isVideo ? enumStrings(aspectRatio) : sizeOptions(size);
  const resolutions = enumStrings(resolution);

  return {
    providerModel: semanticModel.providerModel,
    schema: semanticModel.schema,
    kind: semanticModel.kind,
    workflows: semanticModel.workflows,
    inputImageLimit,
    requiresImageInput: Boolean(imageInput?.required),
    supportsImageInput: Boolean(imageInput),
    inputVideoLimit,
    requiresVideoInput: Boolean(videoInput?.required),
    supportsVideoInput: Boolean(videoInput),
    outputFormats: [isVideo ? 'mp4' : 'png'],
    outputContentType: isVideo ? 'video/mp4' : 'image/png',
    ratios,
    defaultRatio: isVideo
      ? (stringDefault(aspectRatio) ?? ratios[0] ?? '')
      : (stringDefault(size) ?? ratios[0] ?? ''),
    resolutions,
    defaultResolution: stringDefault(resolution) ?? resolutions[0],
    duration: duration
      ? {
          defaultValue:
            numberDefault(duration) ?? clampDurationDefault(duration),
          max: numberBound(duration.max, 15),
          min: numberBound(duration.min, 2),
          required: Boolean(duration.required),
        }
      : undefined,
    promptSupported: Boolean(getField(semanticModel, 'generation_prompt')),
    promptRequired: Boolean(
      getField(semanticModel, 'generation_prompt')?.required,
    ),
    supportsModeration: Boolean(
      getField(semanticModel, 'generation_moderation'),
    ),
    seed: seed
      ? {
          max: numberBound(seed.max, 2_147_483_647),
          min: numberBound(seed.min, 0),
        }
      : undefined,
  };
}

function getField(model: SemanticLadyModel, name: string) {
  return model.schema.find((field) => field.name === name);
}

function enumStrings(field: SemanticLadyField | undefined) {
  return (field?.enum ?? []).filter(
    (value): value is string => typeof value === 'string',
  );
}

function sizeOptions(field: SemanticLadyField | undefined) {
  const enums = enumStrings(field);

  if (enums.length > 0) {
    return enums;
  }

  const fallback = stringDefault(field);

  return fallback ? [fallback] : [];
}

function stringDefault(field: SemanticLadyField | undefined) {
  return typeof field?.default === 'string' ? field.default : undefined;
}

function numberDefault(field: SemanticLadyField | undefined) {
  return typeof field?.default === 'number' ? field.default : undefined;
}

function numberBound(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function clampDurationDefault(field: SemanticLadyField) {
  const min = numberBound(field.min, 2);
  const max = numberBound(field.max, 15);

  return Math.min(Math.max(5, min), max);
}
