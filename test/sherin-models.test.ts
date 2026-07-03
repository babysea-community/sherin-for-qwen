import { describe, expect, it } from 'vitest';

import {
  BYOK_INFERENCE_PROVIDER_ID,
  BYOK_INFERENCE_PROVIDER_LABEL,
  DEFAULT_MODEL_ID,
  MODEL_IDS,
  MODEL_OPTIONS,
  getDefaultModelIdForInferenceProvider,
  getModelIdsForInferenceProvider,
  getModelOptionsForInferenceProvider,
} from '@/lib/app-config';
import {
  resolveAlibabaCloudModelConfig,
  resolveAlibabaCloudProviderModel,
} from '@/lib/inference/alibaba-cloud/models';

const ALIBABACLOUD_MODEL_EXPECTATIONS = [
  { id: 'qwen/image', label: 'Qwen Image', providerModel: 'qwen-image' },
  {
    id: 'qwen/image-2',
    label: 'Qwen Image 2.0',
    providerModel: 'qwen-image-2.0',
  },
  {
    id: 'qwen/image-edit',
    label: 'Qwen Image Edit',
    providerModel: 'qwen-image-edit',
  },
  {
    id: 'wan/2.7-image',
    label: 'Wan 2.7 Image',
    providerModel: 'wan2.7-image',
  },
  {
    id: 'wan/2.7-t2v',
    label: 'Wan 2.7 Text-to-Video',
    providerModel: 'wan2.7-t2v',
  },
  {
    id: 'happyhorse/1.0-t2v',
    label: 'HappyHorse 1.0 Text-to-Video',
    providerModel: 'happyhorse-1.0-t2v',
  },
  {
    id: 'z/image-turbo',
    label: 'Z Image Turbo',
    providerModel: 'z-image-turbo',
  },
] as const;

describe('App model registry', () => {
  it('derives provider model options from the central registry', () => {
    expect(BYOK_INFERENCE_PROVIDER_ID).toBe('alibaba-cloud');
    expect(BYOK_INFERENCE_PROVIDER_LABEL).toBe('Alibaba Cloud');
    expect(getModelOptionsForInferenceProvider('babysea')).toEqual(
      MODEL_OPTIONS,
    );
    expect(getModelIdsForInferenceProvider('babysea')).toEqual(MODEL_IDS);
    expect(getModelIdsForInferenceProvider('alibaba-cloud')).toEqual(MODEL_IDS);
    expect(getDefaultModelIdForInferenceProvider('babysea')).toBe(
      DEFAULT_MODEL_ID,
    );
    expect(getDefaultModelIdForInferenceProvider('alibaba-cloud')).toBe(
      DEFAULT_MODEL_ID,
    );
  });

  it('registers Alibaba Cloud models across the Studio providers', () => {
    for (const model of ALIBABACLOUD_MODEL_EXPECTATIONS) {
      expect(MODEL_OPTIONS.find((option) => option.id === model.id)).toEqual({
        id: model.id,
        label: model.label,
      });
      expect(resolveAlibabaCloudProviderModel(model.id)).toBe(
        model.providerModel,
      );
    }
  });

  it('keeps image models on PNG output and video models on MP4 output', () => {
    expect(resolveAlibabaCloudModelConfig('qwen/image')).toMatchObject({
      kind: 'image',
      outputContentType: 'image/png',
      outputFormats: ['png'],
    });
    expect(resolveAlibabaCloudModelConfig('z/image-turbo')).toMatchObject({
      kind: 'image',
      outputContentType: 'image/png',
      outputFormats: ['png'],
    });
    expect(resolveAlibabaCloudModelConfig('qwen/image-edit')).toMatchObject({
      kind: 'image',
      requiresImageInput: true,
    });
    expect(resolveAlibabaCloudModelConfig('wan/2.7-t2v')).toMatchObject({
      kind: 'video',
      outputContentType: 'video/mp4',
      outputFormats: ['mp4'],
      promptRequired: true,
    });
    expect(resolveAlibabaCloudModelConfig('happyhorse/1.0-t2v')).toMatchObject({
      kind: 'video',
      outputContentType: 'video/mp4',
      outputFormats: ['mp4'],
    });
  });
});
