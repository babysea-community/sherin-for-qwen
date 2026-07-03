import { describe, expect, it } from 'vitest';

import {
  createUsageMetrics,
  type UsageGenerationRow,
} from '@/app/dashboard/usage/_lib/usage-metrics';
import { BYOK_INFERENCE_PROVIDER_ID, DEFAULT_MODEL_ID } from '@/lib/app-config';

function row(overrides: Partial<UsageGenerationRow> = {}): UsageGenerationRow {
  return {
    created_at: '2026-05-17T00:00:00.000Z',
    hasAsset: true,
    inference_provider: BYOK_INFERENCE_PROVIDER_ID,
    metadata: {},
    model: DEFAULT_MODEL_ID,
    output_format: 'jpeg',
    ratio: '1:1',
    status: 'succeeded',
    storage_provider: 'aws-s3',
    ...overrides,
  };
}

describe('createUsageMetrics storage health', () => {
  it('uses Supabase Storage as the fallback target for AWS S3 primary storage', () => {
    const metrics = createUsageMetrics([row()], 'aws-s3');

    expect(metrics.storage.primaryProvider).toBe('AWS S3');
    expect(metrics.storage.fallbackTargets).toEqual(['Supabase Storage']);
  });

  it('formats Backblaze B2 as a primary storage provider', () => {
    const metrics = createUsageMetrics(
      [row({ storage_provider: 'backblaze-b2' })],
      'backblaze-b2',
    );

    expect(metrics.storage.primaryProvider).toBe('Backblaze B2');
    expect(metrics.storage.fallbackTargets).toEqual(['Supabase Storage']);
  });

  it('uses Supabase Storage for both primary and fallback when it is the active provider', () => {
    const metrics = createUsageMetrics(
      [row({ storage_provider: 'supabase-storage' })],
      'supabase-storage',
    );

    expect(metrics.storage.primaryProvider).toBe('Supabase Storage');
    expect(metrics.storage.fallbackTargets).toEqual(['Supabase Storage']);
  });

  it('penalizes fallback saves and unavailable outputs in the health score', () => {
    const metrics = createUsageMetrics(
      [
        row(),
        row({
          metadata: {
            sherin_storage_fallback_from: 'aws-s3',
            sherin_storage_fallback_reason: 'AccessDenied',
          },
          storage_provider: 'supabase-storage',
        }),
        row({ hasAsset: false, status: 'unavailable' }),
      ],
      'aws-s3',
    );

    expect(metrics.storage.fallbackCount).toBe(1);
    expect(metrics.storage.unavailable).toBe(1);
    expect(metrics.storage.healthScore).toBeCloseTo(58.33, 1);
  });

  it('does not report storage as healthy before any generation has storage evidence', () => {
    const metrics = createUsageMetrics([], 'aws-s3');

    expect(metrics.storage.healthScore).toBeNull();
  });
});
