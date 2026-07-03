import { describe, expect, it } from 'vitest';

import {
  canResumeBabySeaGenerationPolling,
  canResumeBabySeaIdempotency,
  canResumeByokProviderPolling,
  canResumeProviderWorkload,
} from '@/app/dashboard/studio/_lib/provider-resume';
import { BYOK_INFERENCE_PROVIDER_ID } from '@/lib/app-config';

const now = new Date().toISOString();
const withinExtendedWindow = new Date(
  Date.now() - 31 * 60 * 1000,
).toISOString();
const tooOld = new Date(Date.now() - 121 * 60 * 1000).toISOString();

describe('provider resume helpers', () => {
  it('resumes BabySea polling only from the server-owned provider id column', () => {
    expect(
      canResumeBabySeaGenerationPolling({
        created_at: now,
        inference_provider: 'babysea',
        metadata: { babysea_generation_id: 'forged-metadata-id' },
        provider_generation_id: 'gen_123',
      }),
    ).toBe(true);

    expect(
      canResumeBabySeaGenerationPolling({
        created_at: now,
        inference_provider: 'babysea',
        metadata: { babysea_generation_id: 'forged-metadata-id' },
        provider_generation_id: null,
      }),
    ).toBe(false);
  });

  it('lets BabySea in-flight idempotency waits yield within the resume window', () => {
    expect(
      canResumeBabySeaIdempotency({
        created_at: now,
        inference_provider: 'babysea',
        metadata: { sherin_last_transient_error_code: 'BSE2016' },
        provider_generation_id: null,
      }),
    ).toBe(true);

    expect(
      canResumeBabySeaIdempotency({
        created_at: withinExtendedWindow,
        inference_provider: 'babysea',
        metadata: { sherin_last_transient_error_code: 'BSE2016' },
        provider_generation_id: null,
      }),
    ).toBe(true);

    expect(
      canResumeBabySeaIdempotency({
        created_at: tooOld,
        inference_provider: 'babysea',
        metadata: { sherin_last_transient_error_code: 'BSE2016' },
        provider_generation_id: null,
      }),
    ).toBe(false);
  });

  it('resumes BYOK provider polling only from the server-owned provider id column', () => {
    expect(
      canResumeByokProviderPolling({
        created_at: now,
        inference_provider: BYOK_INFERENCE_PROVIDER_ID,
        metadata: { provider_request_id: 'forged-metadata-id' },
        provider_generation_id: 'provider-123',
      }),
    ).toBe(true);

    expect(
      canResumeProviderWorkload({
        created_at: now,
        inference_provider: BYOK_INFERENCE_PROVIDER_ID,
        metadata: { provider_request_id: 'forged-metadata-id' },
        provider_generation_id: null,
      }),
    ).toBe(false);
  });
});
