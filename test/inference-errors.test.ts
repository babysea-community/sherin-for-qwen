import { describe, expect, it } from 'vitest';

import { classifyInferenceError } from '@/lib/inference/errors';

describe('classifyInferenceError', () => {
  it('marks HTTP provider transient errors with retry-after as retryable', () => {
    const error = Object.assign(
      new Error('Provider request failed (429): rate'),
      {
        statusCode: 429,
        retryAfterSeconds: 12,
        isTransient: true,
      },
    );

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.statusCode).toBe(429);
    expect(result.retryAfterSeconds).toBe(12);
    expect(result.code).toBe('HTTP_429');
  });

  it('marks 402 (insufficient credits) as permanent even when provider says retryable', () => {
    const error = Object.assign(new Error('Insufficient credits'), {
      statusCode: 402,
      retryAfterSeconds: 30,
      isTransient: true,
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(false);
    expect(result.statusCode).toBe(402);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('marks HTTP provider 5xx as transient with a default back-off', () => {
    const error = Object.assign(new Error('Provider request failed (503)'), {
      statusCode: 503,
      retryAfterSeconds: null,
      isTransient: true,
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it('classifies BabySeaError by name + duck-typed shape', () => {
    const error = Object.assign(new Error('HTTP 429 Too Many Requests'), {
      name: 'BabySeaError',
      status: 429,
      code: 'BSE1001',
      retryable: true,
      rateLimit: { reset: Math.floor(Date.now() / 1000) + 15 },
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.statusCode).toBe(429);
    expect(result.code).toBe('BSE1001');
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(10);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(20);
  });

  it('classifies BabySeaError 402 as permanent regardless of retryable hint', () => {
    const error = Object.assign(new Error('Insufficient credits'), {
      name: 'BabySeaError',
      status: 402,
      code: 'BSE1004',
      retryable: true,
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(false);
    expect(result.code).toBe('BSE1004');
  });

  it('classifies BabySea in-flight idempotency conflicts as transient', () => {
    const error = Object.assign(
      new Error(
        'A request with this Idempotency-Key is still being processed. Retry once the original request completes.',
      ),
      {
        name: 'BabySeaError',
        status: 409,
        code: 'BSE2016',
        retryable: true,
      },
    );

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.statusCode).toBe(409);
    expect(result.code).toBe('BSE2016');
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(30);
  });

  it('classifies BabySeaNetworkError as transient', () => {
    const error = Object.assign(new Error('socket hang up'), {
      name: 'BabySeaNetworkError',
      retryable: true,
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.code).toBe('network_error');
  });

  it('classifies BabySeaGenerationTimeoutError as transient', () => {
    const error = Object.assign(
      new Error(
        'Timed out after 45000ms waiting for generation gen_123 (last status: processing)',
      ),
      {
        name: 'BabySeaGenerationTimeoutError',
        generation_id: 'gen_123',
        timeoutMs: 45_000,
        lastStatus: 'processing',
      },
    );

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.code).toBe('timeout');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('unwraps BabySeaRetryError to surface the underlying BabySeaError code/status', () => {
    const lastError = Object.assign(
      new Error('HTTP 402 Insufficient credits'),
      {
        name: 'BabySeaError',
        status: 402,
        code: 'BSE1004',
        retryable: true,
      },
    );
    const retryError = Object.assign(
      new Error(
        'All 3 attempts failed. Last error: HTTP 402 Insufficient credits',
      ),
      { name: 'BabySeaRetryError', lastError, attempts: 3 },
    );

    const result = classifyInferenceError(retryError);

    expect(result.isTransient).toBe(false);
    expect(result.statusCode).toBe(402);
    expect(result.code).toBe('BSE1004');
  });

  it('unwraps BabySeaRetryError with BSE2016 as a transient in-flight request', () => {
    const lastError = Object.assign(
      new Error(
        'A request with this Idempotency-Key is still being processed. Retry once the original request completes.',
      ),
      {
        name: 'BabySeaError',
        status: 409,
        code: 'BSE2016',
        retryable: true,
      },
    );
    const retryError = Object.assign(
      new Error(
        'All 3 attempts failed. Last error: A request with this Idempotency-Key is still being processed. Retry once the original request completes.',
      ),
      { name: 'BabySeaRetryError', lastError, attempts: 3 },
    );

    const result = classifyInferenceError(retryError);

    expect(result.isTransient).toBe(true);
    expect(result.statusCode).toBe(409);
    expect(result.code).toBe('BSE2016');
  });

  it('falls back to network_error when BabySeaRetryError has no lastError', () => {
    const error = Object.assign(new Error('All 3 attempts failed.'), {
      name: 'BabySeaRetryError',
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.code).toBe('network_error');
  });

  it('classifies BabySeaGenerationFailedError as permanent', () => {
    const error = Object.assign(new Error('generation failed'), {
      name: 'BabySeaGenerationFailedError',
      generation_error_code: 'GEN_FAILED',
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(false);
    expect(result.code).toBe('GEN_FAILED');
  });

  it('classifies AbortError as transient timeout', () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.code).toBe('timeout');
  });

  it('classifies provider poll-budget timeouts as transient', () => {
    const error = Object.assign(new Error('Provider generation timed out'), {
      name: 'TimeoutError',
    });

    const result = classifyInferenceError(error);

    expect(result.isTransient).toBe(true);
    expect(result.code).toBe('timeout');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('classifies arbitrary errors as permanent unknown', () => {
    const result = classifyInferenceError(new Error('something else'));

    expect(result.isTransient).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.code).toBe('unknown');
  });

  it('handles non-Error inputs without throwing', () => {
    expect(classifyInferenceError(null).code).toBe('unknown');
    expect(classifyInferenceError(undefined).code).toBe('unknown');
    expect(classifyInferenceError('string error').message).toBe('string error');
  });
});
