import { BABYSEA_MODEL_CONFIGS, type SherinModelId } from '@/lib/app-config';

export { BABYSEA_MODEL_CONFIGS as BABYSEA_MODELS } from '@/lib/app-config';

export function resolveBabySeaModel(model: SherinModelId) {
  const config = BABYSEA_MODEL_CONFIGS[model];

  if (!config) {
    throw new Error(`BabySea does not support model ${model}.`);
  }

  return config;
}

export function resolveBabySeaModelIdentifier(model: SherinModelId) {
  return resolveBabySeaModel(model).identifier;
}

export function resolveBabySeaOutputFormat(
  model: SherinModelId,
  outputFormat: string,
) {
  return (
    resolveBabySeaModel(model).outputFormatMap[outputFormat] ?? outputFormat
  );
}
