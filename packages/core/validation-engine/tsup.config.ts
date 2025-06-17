import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['zod', '@streamline/form-engine'],
  treeshake: true,
  minify: false,
  splitting: false,
}); 