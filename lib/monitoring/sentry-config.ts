import 'server-only';

import type { NodeOptions } from '@sentry/nextjs';

// Sample rates are hardcoded so operators only need to provide the DSN and
// environment to opt in. Tune here, not via env vars.
export const SENTRY_SAMPLE_RATES = {
  traces: 0.2,
  replaysSession: 0.1,
  replaysOnError: 1.0,
} as const;

export type SentryRuntime = 'nodejs' | 'edge';

export function isSentryEnabled() {
  return Boolean(resolveDsn());
}

export function resolveSentryOptions(runtime: SentryRuntime): NodeOptions {
  const dsn = resolveDsn();
  const environment = resolveEnvironment();

  return {
    dsn,
    environment,
    enabled: Boolean(dsn),
    tracesSampleRate: SENTRY_SAMPLE_RATES.traces,
    sendDefaultPii: false,
    spotlight: false,
    integrations: [],
    initialScope: {
      tags: {
        app: 'sherin',
        runtime,
      },
    },
  };
}

export function resolveBrowserSentryOptions() {
  const dsn = resolveDsn();
  const environment = resolveEnvironment();

  return {
    dsn,
    environment,
    enabled: Boolean(dsn),
    tracesSampleRate: SENTRY_SAMPLE_RATES.traces,
    replaysSessionSampleRate: SENTRY_SAMPLE_RATES.replaysSession,
    replaysOnErrorSampleRate: SENTRY_SAMPLE_RATES.replaysOnError,
    sendDefaultPii: false,
    initialScope: {
      tags: {
        app: 'sherin',
        runtime: 'browser',
      },
    },
  };
}

function resolveDsn() {
  return process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || '';
}

function resolveEnvironment() {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    'development'
  );
}
