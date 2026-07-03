import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Minimal Vitest config for the starter.
//
// Tests cover the pure, server-only helpers that are easy to break and hard
// to debug in production. Component/integration tests belong in the
// apps/e2e Playwright project.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      // `server-only` is injected by Next.js at build time but is not
      // resolvable when running plain Node (vitest). Stub it as a no-op so
      // tests can import server modules directly.
      'server-only': resolve(import.meta.dirname, 'test/stubs/server-only.ts'),
      '@': resolve(import.meta.dirname, '.'),
    },
  },
});
