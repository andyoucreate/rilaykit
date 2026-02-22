/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@rilaykit/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@rilaykit/forms': path.resolve(__dirname, 'packages/forms/src/index.ts'),
      '@rilaykit/workflow': path.resolve(__dirname, 'packages/workflow/src/index.ts'),
      'react': path.resolve(__dirname, 'packages/forms/node_modules/react'),
      'react-dom': path.resolve(__dirname, 'packages/forms/node_modules/react-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/e2e/**/*.e2e.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'json-summary'],
      all: true,
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
