import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  minify: true,
  target: 'es2020',
  external: [
    'react',
    'react-dom',
    'typescript',
    '@rilaykit/core',
    '@rilaykit/forms',
    '@rilaykit/workflow',
  ],
  bundle: true,
  drop: ['console'],
  treeShaking: true,
  sourcemap: false,
  outDir: 'dist',
  skipNodeModulesBundle: true,
});
