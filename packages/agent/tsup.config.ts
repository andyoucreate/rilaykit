import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react/index.ts', 'src/ai-sdk/index.ts', 'src/anthropic/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  // @rilaykit/* workspace deps stay external (mirrors core/forms/workflow's own
  // tsup configs): bundling @rilaykit/forms here pulled its React components —
  // and therefore runtime `react` — into this package's isomorphic main entry.
  external: [
    'react',
    'react-dom',
    'ai',
    '@anthropic-ai/sdk',
    '@rilaykit/core',
    '@rilaykit/forms',
    '@rilaykit/workflow',
  ],
});
