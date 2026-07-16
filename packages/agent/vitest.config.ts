/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@rilaykit/core/react': path.resolve(__dirname, '../core/src/react/index.ts'),
      '@rilaykit/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@rilaykit/forms': path.resolve(__dirname, '../forms/src/index.ts'),
      '@rilaykit/workflow': path.resolve(__dirname, '../workflow/src/index.ts'),
      '@rilaykit/agent': path.resolve(__dirname, './src/index.ts'),
      react: path.resolve(__dirname, '../forms/node_modules/react'),
      'react-dom': path.resolve(__dirname, '../forms/node_modules/react-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
