import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { processGenerationQueue } from '@/app/dashboard/studio/_lib/generation-worker';
import { getOptionalEnv } from '@/lib/utils/env';
import { isOwnerEmail } from '@/lib/auth/owner';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { captureServerError } from '@/lib/monitoring/sentry-server';
import { getUser } from '@/lib/database/server-actions';

export const dynamic = 'force-dynamic';
// 60s is the maximum that works on every Vercel tier (Hobby caps at 60s,
// Pro at 300s, Enterprise at 900s). App's inference providers are tuned
// to a ~45s polling budget so a single invocation completes within this
// window; longer generations resume via the worker's stale-running reclaim
// path on the next cron tick. Operators on Pro+ can raise this safely.
export const maxDuration = 60;
export const runtime = 'nodejs';

// GET vs POST semantics:
//   GET  - idempotent cron poke. Requires `Authorization: Bearer <secret>`
//          matching CRON_SECRET. Owner session is NOT accepted here so a
//          stray browser request cannot trigger work.
//   POST - owner-triggered queue flush. Accepts the bearer token OR the
//          signed-in owner session, but only when the request `Origin`
//          matches the request host (Next.js Server-Action style CSRF guard).
// Both paths process the same queue with the same per-caller rate limit
// applied. Cron schedulers should always use GET + bearer.

const BEARER_RATE_LIMIT = { limit: 12, windowMs: 60_000 };
const OWNER_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const PRE_AUTH_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: Request) {
  return handleRequest(request, { allowOwnerSession: false });
}

export async function POST(request: Request) {
  return handleRequest(request, { allowOwnerSession: true });
}

async function handleRequest(
  request: Request,
  { allowOwnerSession }: { allowOwnerSession: boolean },
) {
  const requestId = resolveRequestId(request);
  const preAuthLimitDecision = consumeRateLimit(
    `preauth:${clientFingerprint(request)}`,
    PRE_AUTH_RATE_LIMIT,
  );

  if (!preAuthLimitDecision.allowed) {
    return rateLimitedResponse(requestId, preAuthLimitDecision);
  }

  const auth = await authorizeGenerationWorker(request, { allowOwnerSession });

  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized', requestId }, 401, {
      'x-request-id': requestId,
    });
  }

  const limitDecision = consumeRateLimit(auth.rateLimitKey, auth.rateLimit);

  if (!limitDecision.allowed) {
    return rateLimitedResponse(requestId, limitDecision);
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 1);

  try {
    const result = await processGenerationQueue({
      limit,
      userId: auth.userId,
    });

    return jsonResponse({ ...result, requestId }, 200, {
      'x-ratelimit-limit': String(limitDecision.limit),
      'x-ratelimit-remaining': String(limitDecision.remaining),
      'x-request-id': requestId,
    });
  } catch (error) {
    await captureServerError(error, {
      tags: { route: 'api/generations/process', requestId },
    });
    return jsonResponse({ error: 'Worker invocation failed', requestId }, 500, {
      'x-request-id': requestId,
    });
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...extraHeaders },
  });
}

function rateLimitedResponse(
  requestId: string,
  limitDecision: ReturnType<typeof consumeRateLimit>,
) {
  return jsonResponse(
    {
      error: 'Too many requests',
      requestId,
      retryAfterSeconds: limitDecision.retryAfterSeconds,
    },
    429,
    {
      'retry-after': String(limitDecision.retryAfterSeconds),
      'x-ratelimit-limit': String(limitDecision.limit),
      'x-ratelimit-remaining': '0',
      'x-request-id': requestId,
    },
  );
}

/**
 * Reuse an upstream request id when the caller supplies one (e.g. a cron
 * runner or Vercel routes that propagate `x-request-id`). Otherwise mint a
 * fresh UUID so every response - success, 401, 429, 500 - carries a stable
 * correlation handle in the `x-request-id` header and JSON body.
 */
function resolveRequestId(request: Request) {
  const inbound =
    request.headers.get('x-request-id') ??
    request.headers.get('x-vercel-id') ??
    null;

  if (inbound && /^[A-Za-z0-9._:-]{1,128}$/.test(inbound)) {
    return inbound;
  }

  return randomUUID();
}

async function authorizeGenerationWorker(
  request: Request,
  { allowOwnerSession }: { allowOwnerSession: boolean },
) {
  const bearerToken = getBearerToken(request.headers.get('authorization'));

  if (bearerToken && isAuthorizedBearerToken(bearerToken)) {
    return {
      authorized: true as const,
      userId: undefined,
      rateLimit: BEARER_RATE_LIMIT,
      rateLimitKey: `bearer:${fingerprint(bearerToken)}`,
    };
  }

  if (!allowOwnerSession || !isTrustedOwnerPost(request)) {
    return {
      authorized: false as const,
      userId: undefined,
      rateLimit: BEARER_RATE_LIMIT,
      rateLimitKey: `anon:${clientFingerprint(request)}`,
    };
  }

  const { user } = await getUser();

  if (user && isOwnerEmail(user.email)) {
    return {
      authorized: true as const,
      userId: user.id,
      rateLimit: OWNER_RATE_LIMIT,
      rateLimitKey: `owner:${user.id}`,
    };
  }

  return {
    authorized: false as const,
    userId: undefined,
    rateLimit: BEARER_RATE_LIMIT,
    rateLimitKey: `anon:${clientFingerprint(request)}`,
  };
}

function isAuthorizedBearerToken(token: string) {
  const secrets = [getOptionalEnv('CRON_SECRET')].filter(
    (value): value is string => Boolean(value),
  );

  return secrets.some((secret) => timingSafeStringEqual(token, secret));
}

function isTrustedOwnerPost(request: Request) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  return origin === new URL(request.url).origin;
}

function getBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim();
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Rate-limit key fingerprint. We never expose the raw bearer token or IP to
 * caller-visible headers, so a short opaque hash is sufficient. Using the
 * first 16 chars of the token/IP keeps memory bounded.
 */
function fingerprint(value: string) {
  return value.slice(0, 16);
}

function clientFingerprint(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim();
  return fingerprint(first || request.headers.get('x-real-ip') || 'unknown');
}
