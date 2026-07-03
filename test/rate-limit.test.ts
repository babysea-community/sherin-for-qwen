import { describe, expect, it } from 'vitest';

import { consumeRateLimit } from '@/lib/security/rate-limit';

describe('consumeRateLimit', () => {
  it('allows requests up to the configured limit', () => {
    const key = `bucket-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      const decision = consumeRateLimit(key, { limit: 3, windowMs: 60_000 });
      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(3);
    }
  });

  it('rejects requests once the bucket is empty and reports retryAfterSeconds', () => {
    const key = `bucket-${Math.random()}`;
    for (let i = 0; i < 2; i += 1) {
      consumeRateLimit(key, { limit: 2, windowMs: 60_000 });
    }
    const decision = consumeRateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(decision.remaining).toBe(0);
  });

  it('isolates buckets per key', () => {
    const a = `bucket-a-${Math.random()}`;
    const b = `bucket-b-${Math.random()}`;
    consumeRateLimit(a, { limit: 1, windowMs: 60_000 });
    const denied = consumeRateLimit(a, { limit: 1, windowMs: 60_000 });
    const allowed = consumeRateLimit(b, { limit: 1, windowMs: 60_000 });
    expect(denied.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it('treats invalid limit as unlimited (allowed=true)', () => {
    const decision = consumeRateLimit('any', { limit: 0, windowMs: 1_000 });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBe(0);
  });
});
