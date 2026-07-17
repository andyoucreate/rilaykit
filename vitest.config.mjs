/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@rilaykit/core/react': path.resolve(__dirname, 'packages/core/src/react/index.ts'),
      '@rilaykit/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@rilaykit/forms/react': path.resolve(__dirname, 'packages/forms/src/react/index.ts'),
      '@rilaykit/forms': path.resolve(__dirname, 'packages/forms/src/index.ts'),
      '@rilaykit/workflow/react': path.resolve(__dirname, 'packages/workflow/src/react/index.ts'),
      '@rilaykit/workflow': path.resolve(__dirname, 'packages/workflow/src/index.ts'),
      '@rilaykit/agent/react': path.resolve(__dirname, 'packages/agent/src/react/index.ts'),
      '@rilaykit/agent/ai-sdk': path.resolve(__dirname, 'packages/agent/src/ai-sdk/index.ts'),
      '@rilaykit/agent/anthropic': path.resolve(__dirname, 'packages/agent/src/anthropic/index.ts'),
      '@rilaykit/agent': path.resolve(__dirname, 'packages/agent/src/index.ts'),
      'rilaykit/react': path.resolve(__dirname, 'packages/rilaykit/src/react/index.ts'),
      'rilaykit/ai-sdk': path.resolve(__dirname, 'packages/rilaykit/src/ai-sdk/index.ts'),
      'rilaykit/anthropic': path.resolve(__dirname, 'packages/rilaykit/src/anthropic/index.ts'),
      rilaykit: path.resolve(__dirname, 'packages/rilaykit/src/index.ts'),
      // Playground `@/` path alias, so a playground page render test resolves its
      // own `@/components|lib` imports. Only playground tests use `@/`.
      '@/': `${path.resolve(__dirname, 'apps/playground/src')}/`,
      react: path.resolve(__dirname, 'packages/forms/node_modules/react'),
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
      // Playground demo pages carry a little testable logic (the simulated-agent
      // transcript reducer); its unit tests run in the same `vitest run` as the rest.
      'apps/playground/src/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    typecheck: {
      enabled: true,
      include: ['packages/**/*.test-d.{ts,tsx}'],
      tsconfig: './tsconfig.vitest.json',
    },
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
