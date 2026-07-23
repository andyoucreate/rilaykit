/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Each `/react` subpath alias MUST precede its base alias: a plain-string
      // alias matches on the `pattern + '/'` prefix, so a lone `@rilaykit/forms`
      // would otherwise capture `@rilaykit/forms/react` and rewrite it to
      // `<src/index.ts>/react` (a non-existent path). Every package that ships a
      // React entry needs the pair, or its `/react` tests fail to resolve.
      '@rilaykit/core/react': path.resolve(__dirname, '../core/src/react/index.ts'),
      '@rilaykit/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@rilaykit/forms/react': path.resolve(__dirname, '../forms/src/react/index.ts'),
      '@rilaykit/forms': path.resolve(__dirname, '../forms/src/index.ts'),
      '@rilaykit/workflow/react': path.resolve(__dirname, '../workflow/src/react/index.ts'),
      '@rilaykit/workflow': path.resolve(__dirname, '../workflow/src/index.ts'),
      '@rilaykit/agent/react': path.resolve(__dirname, './src/react/index.ts'),
      '@rilaykit/agent/ai-sdk': path.resolve(__dirname, './src/ai-sdk/index.ts'),
      '@rilaykit/agent/anthropic': path.resolve(__dirname, './src/anthropic/index.ts'),
      '@rilaykit/agent': path.resolve(__dirname, './src/index.ts'),
      // The all-in-one `rilaykit` package (subpaths before the base alias, same
      // prefix-match reason as above).
      'rilaykit/react': path.resolve(__dirname, '../rilaykit/src/react/index.ts'),
      'rilaykit/ai-sdk': path.resolve(__dirname, '../rilaykit/src/ai-sdk/index.ts'),
      'rilaykit/anthropic': path.resolve(__dirname, '../rilaykit/src/anthropic/index.ts'),
      rilaykit: path.resolve(__dirname, '../rilaykit/src/index.ts'),
      react: path.resolve(__dirname, '../forms/node_modules/react'),
      'react-dom': path.resolve(__dirname, '../forms/node_modules/react-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
