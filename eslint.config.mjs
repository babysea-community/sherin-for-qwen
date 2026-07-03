// Flat ESLint config for the starter.
//
// Goals:
// - Catch obvious bugs (`@eslint/js` recommended + typescript-eslint recommended)
// - Apply Next.js Core Web Vitals rules
// - Block client-side imports of server-only modules (defense-in-depth on top
//   of `import 'server-only'`, which already throws at build time)
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const SERVER_ONLY_PATTERNS = [
  {
    group: ['@/lib/database/admin', '@/lib/database/admin.*'],
    message:
      'lib/database/admin is server-only. Import from @/lib/database/server or use a server action.',
    allowTypeImports: true,
  },
  {
    // Block direct imports of inference provider server entry points and
    // related modules. Pure config (e.g. `@/lib/inference/<inference>/models`) and
    // the public re-export entry (`@/lib/inference`) remain accessible
    // because the underlying server modules already guard themselves with
    // `import 'server-only'`, which throws when bundled into client code.
    group: [
      '@/lib/inference/*/server',
      '@/lib/inference/*/server.*',
      '@/lib/inference/errors',
      '@/lib/inference/errors.*',
    ],
    message:
      'Inference provider server modules must be called from a server action or route handler. Type-only imports are allowed.',
    allowTypeImports: true,
  },
  {
    group: ['@/lib/storage', '@/lib/storage/*'],
    message:
      'Storage adapters are server-only. Call them from a server action or route handler. Type-only imports are allowed.',
    allowTypeImports: true,
  },
  {
    group: ['@/lib/monitoring/sentry-server', '@/lib/security/rate-limit'],
    message: 'This module is server-only. Type-only imports are allowed.',
    allowTypeImports: true,
  },
];

export default [
  {
    ignores: [
      '.next/**',
      '.pnpm-store/**',
      'node_modules/**',
      'next-env.d.ts',
      'lib/database.types.ts',
      'public/**',
      'netlify/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // The starter intentionally renders provider-signed URLs directly so
      // owners can swap storage providers without re-deploying. `next/image`
      // would require allowlisting every storage host in next.config.ts.
      '@next/next/no-img-element': 'off',
      // ESLint 10 recommended rules surface stylistic preferences that the
      // starter does not enforce: error-cause wrapping (verbose, hides root
      // cause in logs), useless-assignments in defensive declarations, and
      // ts-nocheck for scripts that intentionally relax type checking.
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Restrict server-only imports from any file that opts into the client
    // runtime via the `'use client'` directive. Files that need these modules
    // should remain server components/server actions/route handlers.
    // Type-only imports are allowed because they are erased at compile time.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: SERVER_ONLY_PATTERNS,
        },
      ],
    },
  },
  {
    // Server code is allowed to import the above modules freely.
    files: [
      'app/**/route.ts',
      'app/**/_lib/**',
      'app/**/_actions/**',
      'app/**/actions.ts',
      'app/**/server-actions.ts',
      'app/**/page.tsx',
      'app/**/layout.tsx',
      'app/**/loading.tsx',
      'app/**/error.tsx',
      'app/**/global-error.tsx',
      'app/**/not-found.tsx',
      'app/**/template.tsx',
      'lib/**',
      'instrumentation.ts',
      'next.config.ts',
      'proxy.ts',
      'scripts/**',
      'vitest.config.ts',
      '**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
