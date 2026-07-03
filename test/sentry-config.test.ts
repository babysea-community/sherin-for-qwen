import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isSentryEnabled,
  resolveBrowserSentryOptions,
  resolveSentryOptions,
  SENTRY_SAMPLE_RATES,
} from '@/lib/monitoring/sentry-config';

const ENV_KEYS = ['NEXT_PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_ENVIRONMENT'];

describe('sentry config', () => {
  let original: Record<string, string | undefined>;

  beforeEach(() => {
    original = {};
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it('isSentryEnabled is false without DSN', () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it('isSentryEnabled is true with DSN set', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/0';
    expect(isSentryEnabled()).toBe(true);
  });

  it('resolveSentryOptions disables Sentry without DSN', () => {
    const opts = resolveSentryOptions('nodejs');
    expect(opts.enabled).toBe(false);
    expect(opts.dsn).toBe('');
    expect(opts.initialScope).toMatchObject({
      tags: { app: 'sherin', runtime: 'nodejs' },
    });
  });

  it('resolveSentryOptions enables Sentry with DSN and uses hardcoded traces rate', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/0';
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = 'staging';
    const opts = resolveSentryOptions('edge');
    expect(opts.enabled).toBe(true);
    expect(opts.environment).toBe('staging');
    expect(opts.tracesSampleRate).toBe(SENTRY_SAMPLE_RATES.traces);
    expect(opts.initialScope).toMatchObject({
      tags: { app: 'sherin', runtime: 'edge' },
    });
  });

  it('resolveBrowserSentryOptions tags browser runtime and uses hardcoded replay rates', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/0';
    const opts = resolveBrowserSentryOptions();
    expect(opts.enabled).toBe(true);
    expect(opts.tracesSampleRate).toBe(SENTRY_SAMPLE_RATES.traces);
    expect(opts.replaysSessionSampleRate).toBe(
      SENTRY_SAMPLE_RATES.replaysSession,
    );
    expect(opts.replaysOnErrorSampleRate).toBe(
      SENTRY_SAMPLE_RATES.replaysOnError,
    );
    expect(opts.initialScope).toMatchObject({
      tags: { app: 'sherin', runtime: 'browser' },
    });
  });
});
