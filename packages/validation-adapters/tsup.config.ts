import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'zod/index': 'src/zod/index.ts'
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@rilaykit/core', 'zod', 'yup', 'joi'],
  treeshake: true,
  splitting: false,
  minify: false, // Keep readable for debugging
  target: 'es2020'
});