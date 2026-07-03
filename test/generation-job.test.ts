import { describe, expect, it } from 'vitest';

import {
  createQueuedGenerationJob,
  readQueuedGenerationJob,
  retainedStorageBytesAfterInputCleanup,
} from '@/app/dashboard/studio/_lib/generation-job';
import type { Json } from '@/lib/database.types';
import { DEFAULT_MODEL_ID } from '@/lib/app-config';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('queued generation jobs', () => {
  it('stores a durable BabySea idempotency key with the job payload', () => {
    const job = createQueuedGenerationJob(createGenerationInput(), {}, 's3');

    expect(job.babyseaIdempotencyKey).toEqual(
      expect.stringMatching(UUID_PATTERN),
    );
    expect(readQueuedGenerationJob({ sherin_job: job } as Json)).toMatchObject({
      babyseaIdempotencyKey: job.babyseaIdempotencyKey,
    });
  });

  it('keeps prepared uploaded input URLs in the durable request body', () => {
    const inputUrls = ['https://storage.example.com/input.png?token=stable'];
    const inputFileAssets = [
      {
        byteLength: 1234,
        contentType: 'image/png',
        publicUrl: 'https://storage.example.com/input.png?token=stable',
        source: 'upload' as const,
        storagePath:
          'user-upload/user-1/00000000-0000-4000-8000-000000000000/input-1.png',
        storageProvider: 'supabase-storage' as const,
        url: 'https://storage.example.com/input.png?token=stable',
      },
    ];
    const job = createQueuedGenerationJob(
      createGenerationInput({ generation_input_file: inputUrls }),
      {},
      'supabase-storage',
      inputFileAssets,
    );

    expect(job.values.generation_input_file).toEqual(inputUrls);
    expect(job.inputFileAssets).toEqual(inputFileAssets);
    expect(job.inputFileUploadPaths).toEqual([]);
  });

  it('counts only retained output bytes after input assets are cleaned up', () => {
    expect(retainedStorageBytesAfterInputCleanup(4096)).toBe(4096);
    expect(retainedStorageBytesAfterInputCleanup()).toBe(0);
    expect(retainedStorageBytesAfterInputCleanup(-1)).toBe(0);
  });
});

function createGenerationInput(
  overrides: Partial<Parameters<typeof createQueuedGenerationJob>[0]> = {},
): Parameters<typeof createQueuedGenerationJob>[0] {
  return {
    byok_params: {},
    generation_input_file: [],
    generation_output_number: 1,
    generation_provider_order: 'fastest',
    generation_resolution: '1MP',
    model: DEFAULT_MODEL_ID,
    output_format: 'jpeg',
    prompt: 'A calm editorial image of a glass sculpture',
    ratio: '1:1',
    ...overrides,
  };
}
