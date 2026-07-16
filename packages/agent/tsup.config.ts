import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react/index.ts', 'src/ai-sdk/index.ts', 'src/anthropic/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  external: ['react', 'react-dom', 'ai', '@anthropic-ai/sdk'],
});
