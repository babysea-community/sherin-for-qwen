// Client-side Sentry init. Loaded by Next.js (App Router) at module bootstrap.
// No-ops cleanly when NEXT_PUBLIC_SENTRY_DSN is unset so the starter works
// out-of-the-box without a Sentry account.
//
// Sample rates are hardcoded so operators only need to provide the DSN and
// environment. Tune in `lib/monitoring/sentry-config.ts`.
//
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

const SAMPLE_RATES = {
  traces: 0.2,
  replaysSession: 0.1,
  replaysOnError: 1.0,
} as const;

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: true,
      environment:
        process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
        process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() ||
        process.env.NODE_ENV ||
        'development',
      tracesSampleRate: SAMPLE_RATES.traces,
      replaysSessionSampleRate: SAMPLE_RATES.replaysSession,
      replaysOnErrorSampleRate: SAMPLE_RATES.replaysOnError,
      sendDefaultPii: false,
      initialScope: {
        tags: { app: 'sherin', runtime: 'browser' },
      },
    });
  });
}

export const onRouterTransitionStart = (() => {
  if (!dsn) {
    return undefined;
  }

  return (...args: unknown[]) => {
    void import('@sentry/nextjs').then((Sentry) => {
      const handler = (
        Sentry as unknown as {
          captureRouterTransitionStart?: (...rest: unknown[]) => void;
        }
      ).captureRouterTransitionStart;
      handler?.(...args);
    });
  };
})();
