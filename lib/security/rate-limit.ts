import 'server-only';

/**
 * Best-effort in-memory token bucket rate limiter.
 *
 * Notes for operators:
 * - State lives in the current Node.js process. On serverless platforms each
 *   instance maintains its own bucket, so the effective ceiling is
 *   `limit * concurrent_instances`. For stricter global limits, front the
 *   endpoint with a managed limiter (Vercel Firewall, Cloudflare, Upstash
 *   Ratelimit) or run a single worker instance.
 * - Buckets are keyed by an opaque principal string (caller decides whether
 *   that is an IP, a bearer-token fingerprint, or a user id).
 * - Safe to call from multiple async paths concurrently within one process.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds the caller should wait before retrying. Always >= 0. */
  retryAfterSeconds: number;
  /** Remaining tokens in the bucket after this call. */
  remaining: number;
  /** The bucket size (max tokens). */
  limit: number;
};

export type RateLimitOptions = {
  /** Maximum tokens (and burst size). */
  limit: number;
  /** Window in milliseconds over which the bucket refills `limit` tokens. */
  windowMs: number;
};

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

/**
 * Consume one token from the bucket identified by `key`. Returns whether the
 * caller should be allowed through, along with retry hints for 429 responses.
 */
export function consumeRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitDecision {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, retryAfterSeconds: 0, remaining: 0, limit: 0 };
  }

  const safeKey = key.length > 0 ? key : '__anonymous__';
  const now = Date.now();
  const refillPerMs = limit / Math.max(windowMs, 1);

  sweepIfNeeded(now, windowMs);

  const existing = buckets.get(safeKey);
  const bucket: Bucket = existing ?? { tokens: limit, updatedAt: now };

  if (existing) {
    const elapsed = Math.max(0, now - existing.updatedAt);
    bucket.tokens = Math.min(limit, existing.tokens + elapsed * refillPerMs);
    bucket.updatedAt = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(safeKey, bucket);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.floor(bucket.tokens),
      limit,
    };
  }

  const tokensNeeded = 1 - bucket.tokens;
  const waitMs = Math.ceil(tokensNeeded / refillPerMs);
  buckets.set(safeKey, bucket);

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    remaining: 0,
    limit,
  };
}

/** Test helper. Not used at runtime. */
export function resetRateLimitForTests() {
  buckets.clear();
  lastSweepAt = 0;
}

function sweepIfNeeded(now: number, windowMs: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweepAt = now;
  const expireBefore = now - windowMs * 4;

  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < expireBefore) {
      buckets.delete(key);
    }
  }
}
