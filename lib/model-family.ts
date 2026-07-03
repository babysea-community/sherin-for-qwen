/**
 * App model-family registry facade.
 *
 * Provider-specific model catalogs live beside their direct provider adapter.
 * When cloning the app for a new provider family, keep this facade stable and
 * swap only the provider family import plus the direct provider shim.
 */
import {
  SHERIN_BYOK_FAMILY as PROVIDER_FAMILY,
  hasProviderModelConfig,
} from './inference/alibaba-cloud/family';

export { SHERIN_BYOK_FAMILY as BYOK_FAMILY } from './inference/alibaba-cloud/family';

export const MODEL_OPTIONS = PROVIDER_FAMILY.modelOptions;
export type SherinModelId = (typeof MODEL_OPTIONS)[number]['id'];

export const MODEL_IDS = PROVIDER_FAMILY.modelIds as [
  SherinModelId,
  ...SherinModelId[],
];

export const DEFAULT_MODEL_ID: SherinModelId = PROVIDER_FAMILY.defaultModelId;
export const BYOK_INFERENCE_PROVIDER_ID = PROVIDER_FAMILY.providerId;
export const BYOK_INFERENCE_PROVIDER_LABEL = PROVIDER_FAMILY.providerLabel;
export const BYOK_INFERENCE_PROVIDER_KEYWORD = PROVIDER_FAMILY.providerKeyword;
export const BYOK_MODEL_ID_PREFIX = PROVIDER_FAMILY.modelIdPrefix;
export type ByokInferenceProviderId = typeof BYOK_INFERENCE_PROVIDER_ID;

export function isSherinModelId(value: unknown): value is SherinModelId {
  return (
    typeof value === 'string' && MODEL_IDS.includes(value as SherinModelId)
  );
}

export const RATIOS = {} as Record<string, { width: number; height: number }>;
export type SherinDimensionRatio = string;
export const RATIO_OPTIONS = PROVIDER_FAMILY.ratioOptions;
export type SherinRatio = (typeof RATIO_OPTIONS)[number];

export const OUTPUT_FORMATS = PROVIDER_FAMILY.outputFormats;
export type SherinOutputFormat = (typeof OUTPUT_FORMATS)[number];

export const DEFAULT_RATIO: SherinDimensionRatio = PROVIDER_FAMILY.defaultRatio;
export const DEFAULT_OUTPUT_FORMAT: SherinOutputFormat =
  PROVIDER_FAMILY.defaultOutputFormat;
export const RESOLUTION_OPTIONS = PROVIDER_FAMILY.resolutionOptions;
export type SherinResolution = (typeof RESOLUTION_OPTIONS)[number];
export const DEFAULT_RESOLUTION: SherinResolution | undefined =
  PROVIDER_FAMILY.defaultResolution as SherinResolution | undefined;
export const GENERATION_PROMPT_PLACEHOLDER =
  'A cinematic editorial portrait with arctic light, soft film grain...';

export const DEFAULT_GENERATION_OUTPUT_NUMBER = 1;
export const DEFAULT_GENERATION_OUTPUT_QUALITY = 80;
export const DEFAULT_GENERATION_GUIDANCE_SCALE = 3.5;
export const DEFAULT_GENERATION_NUM_INFERENCE_STEPS = 28;
export const DEFAULT_BYOK_GUIDANCE = PROVIDER_FAMILY.defaultGenerationGuidance;
export const DEFAULT_BYOK_STEPS = PROVIDER_FAMILY.defaultGenerationSteps;
export const DEFAULT_BYOK_SAFETY_TOLERANCE =
  PROVIDER_FAMILY.defaultSafetyTolerance;

export const BYOK_MODEL_CONFIGS = PROVIDER_FAMILY.modelConfigs;
export const BYOK_MODEL_IDS = PROVIDER_FAMILY.modelIds;

export type BabySeaModelConfig =
  (typeof PROVIDER_FAMILY.babySeaModelConfigs)[SherinModelId];

export const BABYSEA_MODEL_CONFIGS = PROVIDER_FAMILY.babySeaModelConfigs;

export const SHERIN_INPUT_FILE_LIMIT = Math.max(
  ...Object.values(BYOK_MODEL_CONFIGS).map((model) =>
    Math.max(model.inputImageLimit, model.inputVideoLimit),
  ),
  ...Object.values(BABYSEA_MODEL_CONFIGS).map((model) => model.inputMediaLimit),
);

export type InferenceProviderScope = 'babysea' | ByokInferenceProviderId | null;

export function hasByokModelConfig(
  model: SherinModelId,
): model is keyof typeof BYOK_MODEL_CONFIGS & SherinModelId {
  return hasProviderModelConfig(model);
}

export function getModelOptionsForInferenceProvider(
  providerId: InferenceProviderScope,
) {
  if (providerId === BYOK_INFERENCE_PROVIDER_ID) {
    const byokModelIds = new Set<SherinModelId>(BYOK_MODEL_IDS);

    return MODEL_OPTIONS.filter((option) => byokModelIds.has(option.id));
  }

  return MODEL_OPTIONS;
}

export function getModelIdsForInferenceProvider(
  providerId: InferenceProviderScope,
) {
  return getModelOptionsForInferenceProvider(providerId).map(
    (option) => option.id,
  );
}

export function getDefaultModelIdForInferenceProvider(
  providerId: InferenceProviderScope,
) {
  if (
    providerId === BYOK_INFERENCE_PROVIDER_ID &&
    !hasByokModelConfig(DEFAULT_MODEL_ID)
  ) {
    return BYOK_MODEL_IDS[0] ?? DEFAULT_MODEL_ID;
  }

  return DEFAULT_MODEL_ID;
}

export function getBabySeaInputFileLimit(model: SherinModelId) {
  const config = BABYSEA_MODEL_CONFIGS[model];

  if (!config) {
    throw new Error(`BabySea does not support model ${model}.`);
  }

  return config.inputMediaLimit;
}

export function getBabySeaProviderOrderOverride(modelIdentifier: string) {
  return Object.values(BABYSEA_MODEL_CONFIGS).find(
    (model) => model.identifier === modelIdentifier,
  )?.providerOrderOptions;
}

export function isSherinResolution(
  value: string | undefined,
): value is SherinResolution {
  return RESOLUTION_OPTIONS.includes(value as SherinResolution);
}
