import type { Instrumentation } from 'next';

// Loaded by Next.js at server startup. Sentry initialization is conditional
// on NEXT_PUBLIC_SENTRY_DSN being set. Without a DSN, Sentry is a no-op so
// the starter still runs on developer machines and free deploys.
//
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    const { resolveSentryOptions } =
      await import('@/lib/monitoring/sentry-config');
    Sentry.init(resolveSentryOptions('nodejs'));
    return;
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    const { resolveSentryOptions } =
      await import('@/lib/monitoring/sentry-config');
    Sentry.init(resolveSentryOptions('edge'));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  errorContext,
) => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    return;
  }

  const Sentry = await import('@sentry/nextjs');

  if (typeof Sentry.captureRequestError === 'function') {
    Sentry.captureRequestError(err, request, errorContext);
    return;
  }

  Sentry.captureException(err);
};
