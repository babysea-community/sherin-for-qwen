import {
  ALIBABACLOUD_MODEL_CONFIGS,
  hasAlibabaCloudModelConfig,
  type AlibabaCloudModelId,
} from './family';

export {
  ALIBABACLOUD_MODEL_CONFIGS,
  type AlibabaCloudModelConfig,
} from './family';

export function resolveAlibabaCloudModelConfig(model: string) {
  if (!hasAlibabaCloudModelConfig(model)) {
    throw new Error(`Alibaba Cloud does not support model ${model}.`);
  }

  return ALIBABACLOUD_MODEL_CONFIGS[model];
}

export function resolveAlibabaCloudProviderModel(model: AlibabaCloudModelId) {
  return resolveAlibabaCloudModelConfig(model).providerModel;
}
