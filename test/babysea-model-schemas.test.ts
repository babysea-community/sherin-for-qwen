import { beforeEach, describe, expect, it, vi } from 'vitest';

const babySeaMock = vi.hoisted(() => {
  const models = vi.fn();

  class MockBabySea {
    library = { models };
  }

  return { BabySea: MockBabySea, models };
});

vi.mock('babysea', () => ({
  BabySea: babySeaMock.BabySea,
}));

vi.mock('next/cache', () => ({
  unstable_cache: <TFunction extends (...args: never[]) => unknown>(
    fn: TFunction,
  ) => fn,
}));

import { getBabySeaStudioModelSchemas } from '@/lib/inference/babysea/server-actions';
import {
  BYOK_INFERENCE_PROVIDER_ID,
  DEFAULT_MODEL_ID,
  MODEL_IDS,
} from '@/lib/app-config';

describe('BabySea Studio model schemas', () => {
  beforeEach(() => {
    process.env.BABYSEA_API_KEY = 'bye_test_key';
    delete process.env.BABYSEA_API_BASE_URL;
    babySeaMock.models.mockReset();
  });

  it('omits app models that are absent from the BabySea library', async () => {
    const absentModel = MODEL_IDS.find((model) => model !== DEFAULT_MODEL_ID);

    expect(absentModel).toBeDefined();

    babySeaMock.models.mockResolvedValue({
      data: {
        models: [createBabySeaModel(DEFAULT_MODEL_ID)],
      },
    });

    const schemas = await getBabySeaStudioModelSchemas([
      DEFAULT_MODEL_ID,
      absentModel!,
    ]);

    expect(Object.keys(schemas)).toEqual([DEFAULT_MODEL_ID]);
    expect(schemas[DEFAULT_MODEL_ID]?.modelIdentifier).toBe(DEFAULT_MODEL_ID);
    expect(schemas[absentModel!]).toBeUndefined();
  });
});

function createBabySeaModel(modelIdentifier: string) {
  return {
    model_identifier: modelIdentifier,
    model_supported_provider: [BYOK_INFERENCE_PROVIDER_ID],
    schema: {
      generation_input_file: false,
      generation_output_format: ['jpg', 'png', 'webp'],
      generation_output_number: 1,
      generation_ratio: ['1:1', '16:9'],
      generation_resolution: ['1MP'],
    },
    specific_schema: [],
  };
}
