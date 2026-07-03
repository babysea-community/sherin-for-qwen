import { beforeEach, describe, expect, it, vi } from 'vitest';

const babySeaMock = vi.hoisted(() => {
  const generate = vi.fn();
  const waitForGeneration = vi.fn();

  class MockBabySea {
    generate = generate;
    waitForGeneration = waitForGeneration;
  }

  return { BabySea: MockBabySea, generate, waitForGeneration };
});

vi.mock('babysea', () => ({
  BabySea: babySeaMock.BabySea,
}));

import { createBabySeaProvider } from '@/lib/inference/babysea/server-actions';
import type { InferenceRequest } from '@/lib/inference/types';
import { DEFAULT_MODEL_ID } from '@/lib/app-config';

describe('BabySea provider resume', () => {
  beforeEach(() => {
    process.env.BABYSEA_API_KEY = 'bye_test_key';
    delete process.env.BABYSEA_API_BASE_URL;
    babySeaMock.generate.mockReset();
    babySeaMock.waitForGeneration.mockReset();
  });

  it('polls a saved provider generation id without submitting generate again', async () => {
    babySeaMock.waitForGeneration.mockResolvedValue({
      data: {
        generation_completed_at: '2026-05-19T00:00:05.000Z',
        generation_id: 'gen_123',
        generation_output_file: ['https://assets.example.com/output.png'],
        generation_prediction_id: 'pred_123',
        generation_provider_order: 'fastest',
        generation_provider_used: 'byok-provider',
        generation_resolution: '1mp',
        generation_started_at: '2026-05-19T00:00:00.000Z',
        generation_status: 'succeeded',
        model_identifier: DEFAULT_MODEL_ID,
      },
    });

    const result = await createBabySeaProvider().generate(createRequest(), {
      providerGenerationId: 'gen_123',
    });

    expect(babySeaMock.generate).not.toHaveBeenCalled();
    expect(babySeaMock.waitForGeneration).toHaveBeenCalledWith('gen_123', {
      interval: 2000,
      timeout: 45_000,
    });
    expect(result.remoteUrl).toBe('https://assets.example.com/output.png');
  });
});

function createRequest(): InferenceRequest {
  return {
    babyseaSpecificParams: {},
    byokParams: {},
    inputFiles: [],
    model: DEFAULT_MODEL_ID,
    outputFormat: 'jpeg',
    outputNumber: 1,
    prompt: 'A clean idempotency regression image',
    providerOrder: 'fastest',
    ratio: '1:1',
  };
}
