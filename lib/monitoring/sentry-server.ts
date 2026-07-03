import 'server-only';

/**
 * Lazy, no-throw error capture for server code. When Sentry is not configured,
 * this just logs to stderr so the starter remains useful without a DSN.
 *
 * Importing @sentry/nextjs lazily keeps cold starts cheap for the no-DSN path.
 */
export async function captureServerError(
  error: unknown,
  context: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {},
) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  if (!dsn) {
    console.error('[sherin:error]', error, context);
    return;
  }

  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.withScope((scope) => {
      if (context.tags) {
        for (const [key, value] of Object.entries(context.tags)) {
          scope.setTag(key, value);
        }
      }

      if (context.extra) {
        for (const [key, value] of Object.entries(context.extra)) {
          scope.setExtra(key, value);
        }
      }

      Sentry.captureException(error);
    });
  } catch (sentryError) {
    console.error('[sherin:error]', error, context);
    console.error('[sherin:sentry-failed]', sentryError);
  }
}
