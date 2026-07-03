/**
 * Best-effort classification of unknown errors thrown by inference providers.
 *
 * The worker uses this to decide whether to re-queue (transient) or fail
 * permanently (non-transient). Classification is deliberately defensive:
 *
 * - Direct BYOK providers may throw plain `Error` objects with `statusCode`,
 *   `retryAfterSeconds`, and `isTransient` properties already attached. We
 *   re-use those verbatim when present.
 * - BabySea SDK throws typed errors (`BabySeaError`, `BabySeaNetworkError`,
 *   `BabySeaTimeoutError`, `BabySeaGenerationTimeoutError`,
 *   `BabySeaRetryError`, `BabySeaGenerationFailedError`)
 *   that we detect by name + duck-typed shape to avoid coupling the starter
 *   to the SDK's type exports at compile time.
 * - Everything else is treated as permanent. Network resets at the runtime
 *   level (TCP, DNS) are surfaced through the SDK and through `fetch` and
 *   handled by their respective branches above.
 *
 * HTTP 402 (insufficient credits) is always permanent, there is no point
 * retrying until the user tops up, even if the underlying provider flags
 * the response as `retryable`.
 */
export type InferenceErrorClassification = {
  /** True when the next worker tick is likely to succeed without operator action. */
  isTransient: boolean;
  /** HTTP status code when the error originated from an HTTP response, otherwise null. */
  statusCode: number | null;
  /** Seconds the caller should wait before retrying. Capped at 600s. Always >= 0. */
  retryAfterSeconds: number;
  /** Human-readable message safe for storage in the `generations.error` column. */
  message: string;
  /** Stable machine-readable code: provider-specific when available, otherwise `'unknown'`. */
  code: string;
};

const PERMANENT_STATUS_CODES = new Set<number>([
  400, // bad request
  401, // unauthorized
  402, // insufficient credits, never retry
  403, // forbidden
  404, // not found
  409, // conflict
  410, // gone
  413, // payload too large
  415, // unsupported media type
  422, // unprocessable entity
  451, // unavailable for legal reasons
]);

const MAX_RETRY_AFTER_SECONDS = 600;
const DEFAULT_RETRY_AFTER_SECONDS = 5;
export const BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE = 'BSE2016';
const BABYSEA_IDEMPOTENCY_RETRY_AFTER_SECONDS = 60;

export function classifyInferenceError(
  error: unknown,
): InferenceErrorClassification {
  if (!error || typeof error !== 'object') {
    return {
      isTransient: false,
      statusCode: null,
      retryAfterSeconds: 0,
      message: typeof error === 'string' ? error : 'Unknown error',
      code: 'unknown',
    };
  }

  const message = errorMessageOf(error);
  const name = errorName(error);

  const httpLike = readHttpLikeShape(error);
  if (httpLike) {
    const status = httpLike.statusCode;
    const permanent = status !== null && PERMANENT_STATUS_CODES.has(status);
    const isTransient = !permanent && httpLike.isTransient;
    return {
      isTransient,
      statusCode: status,
      retryAfterSeconds: isTransient
        ? clampRetryAfter(
            httpLike.retryAfterSeconds ?? defaultRetryAfterFor(status, true),
          )
        : 0,
      message,
      code: status !== null ? `HTTP_${status}` : 'http_error',
    };
  }

  // BabySea SDK: BabySeaError carries `status`, `retryable`, `code`,
  // `rateLimit`. Detect by name to avoid a hard import.
  if (name === 'BabySeaError') {
    const status = readNumber(error, 'status');
    const retryable = readBoolean(error, 'retryable');
    const rateLimitReset = readRateLimitReset(error);
    const code = readString(error, 'code') ?? 'babysea_error';

    if (code === BABYSEA_IDEMPOTENCY_IN_PROGRESS_CODE) {
      return {
        isTransient: true,
        statusCode: status,
        retryAfterSeconds: clampRetryAfter(
          rateLimitReset ?? BABYSEA_IDEMPOTENCY_RETRY_AFTER_SECONDS,
        ),
        message,
        code,
      };
    }

    const permanent = status !== null && PERMANENT_STATUS_CODES.has(status);
    const isTransient = !permanent && retryable === true;
    return {
      isTransient,
      statusCode: status,
      retryAfterSeconds: isTransient
        ? clampRetryAfter(rateLimitReset ?? defaultRetryAfterFor(status, true))
        : 0,
      message,
      code,
    };
  }

  // BabySeaNetworkError, BabySeaRetryError, BabySeaTimeoutError, wrap
  // transport-layer failures. The SDK marks them `retryable=true` for true
  // network blips. Treat unknown retryable values as transient with a
  // conservative back-off.
  if (name === 'BabySeaRetryError') {
    // `BabySeaRetryError.lastError` is the underlying `BabySeaError` (or
    // network/timeout error) that triggered the SDK's own retry exhaustion.
    // Unwrapping it lets us surface the real HTTP status, provider error
    // code, and rate-limit reset on the row instead of the generic
    // "All N attempts failed" wrapper message.
    const lastError = (error as { lastError?: unknown }).lastError;
    if (lastError && typeof lastError === 'object') {
      return classifyInferenceError(lastError);
    }
    return {
      isTransient: readBoolean(error, 'retryable') !== false,
      statusCode: null,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      message,
      code: 'network_error',
    };
  }

  if (
    name === 'BabySeaNetworkError' ||
    name === 'BabySeaTimeoutError' ||
    name === 'BabySeaGenerationTimeoutError'
  ) {
    const retryable = readBoolean(error, 'retryable');
    return {
      isTransient: retryable !== false,
      statusCode: null,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      message,
      code: name === 'BabySeaNetworkError' ? 'network_error' : 'timeout',
    };
  }

  // BabySeaGenerationFailedError, the provider explicitly reports the
  // generation as failed/canceled. No retry will help.
  if (name === 'BabySeaGenerationFailedError') {
    return {
      isTransient: false,
      statusCode: null,
      retryAfterSeconds: 0,
      message,
      code: readString(error, 'generation_error_code') ?? 'generation_failed',
    };
  }

  // Native AbortError (request timeout), transient.
  if (name === 'AbortError' || name === 'TimeoutError') {
    return {
      isTransient: true,
      statusCode: null,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      message,
      code: 'timeout',
    };
  }

  return {
    isTransient: false,
    statusCode: null,
    retryAfterSeconds: 0,
    message,
    code: 'unknown',
  };
}

function readHttpLikeShape(error: object): {
  statusCode: number | null;
  retryAfterSeconds: number | null;
  isTransient: boolean;
} | null {
  const status = readNumber(error, 'statusCode');
  const hasIsTransient = 'isTransient' in error;

  if (status === null && !hasIsTransient) {
    return null;
  }

  return {
    statusCode: status,
    retryAfterSeconds: readNumber(error, 'retryAfterSeconds'),
    isTransient: readBoolean(error, 'isTransient') === true,
  };
}

function readRateLimitReset(error: object): number | null {
  const rateLimit = (error as Record<string, unknown>).rateLimit;
  if (!rateLimit || typeof rateLimit !== 'object') {
    return null;
  }

  const reset = (rateLimit as Record<string, unknown>).reset;
  if (typeof reset === 'number' && Number.isFinite(reset) && reset > 0) {
    // RateLimitInfo `reset` is a unix-seconds timestamp; convert to delta.
    const nowSeconds = Math.floor(Date.now() / 1000);
    return Math.max(0, reset - nowSeconds);
  }

  return null;
}

function defaultRetryAfterFor(
  status: number | null,
  isTransient: boolean,
): number {
  if (!isTransient) {
    return 0;
  }
  if (status === 429) {
    return 30;
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
}

function clampRetryAfter(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(Math.floor(value), MAX_RETRY_AFTER_SECONDS);
}

function errorName(error: object): string {
  const value = (error as { name?: unknown }).name;
  return typeof value === 'string' ? value : '';
}

function errorMessageOf(error: object): string {
  const value = (error as { message?: unknown }).message;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return String(error);
}

function readNumber(error: object, key: string): number | null {
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function readBoolean(error: object, key: string): boolean | null {
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function readString(error: object, key: string): string | null {
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}
