import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_SECURITY_HEADERS, SECURITY_HEADERS } from './lib/security/csp';

const appRoot = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nextPackageRoot = dirname(require.resolve('next/package.json'));
const turbopackRoot = findCommonDirectory(appRoot, nextPackageRoot);

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  turbopack: {
    root: turbopackRoot,
  },
  devIndicators: {
    position: 'bottom-right',
  },
  // Avoid printing full external fetch URLs (BabySea/Supabase/Upstash /
  // webhook callback URLs) into production logs. Full URLs are still useful
  // locally for debugging.
  logging: {
    fetches: {
      fullUrl: !isProduction,
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  // Optional storage adapters are declared as optionalDependencies and
  // dynamically imported. Mark them as external so missing packages do not
  // break the build for owners who only use supabase-storage.
  serverExternalPackages: ['@vercel/blob', '@aws-sdk/client-s3'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      {
        source: '/api/:path*',
        headers: API_SECURITY_HEADERS,
      },
    ];
  },
};

function findCommonDirectory(firstPath: string, secondPath: string) {
  const firstParts = firstPath.split(sep).filter(Boolean);
  const secondParts = secondPath.split(sep).filter(Boolean);
  const commonParts: string[] = [];

  for (let index = 0; index < firstParts.length; index += 1) {
    const firstPart = firstParts[index];

    if (!firstPart || firstPart !== secondParts[index]) {
      break;
    }

    commonParts.push(firstPart);
  }

  return commonParts.length > 0 ? `${sep}${commonParts.join(sep)}` : sep;
}

export default withOptionalSentry(nextConfig);

/**
 * Conditionally wrap with `withSentryConfig` so the build keeps working when
 * `@sentry/nextjs` is absent (e.g. on lean forks that strip the dependency).
 */
function withOptionalSentry(config: NextConfig): NextConfig {
  const enableSentry =
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) ||
    Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

  if (!enableSentry) {
    return config;
  }

  try {
    const { withSentryConfig } = require('@sentry/nextjs') as {
      withSentryConfig: (
        cfg: NextConfig,
        options: Record<string, unknown>,
      ) => NextConfig;
    };

    return withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
      // Replacement for the now-deprecated `disableLogger: true`. Strips
      // `Sentry.logger.*` calls from production bundles via webpack tree-shake.
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
      },
      hideSourceMaps: true,
      telemetry: false,
    });
  } catch (error) {
    console.warn(
      'Sentry DSN set but @sentry/nextjs failed to load. Continuing without Sentry build wrapper.',
      error,
    );
    return config;
  }
}
