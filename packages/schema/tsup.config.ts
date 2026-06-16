import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.build.json',
  splitting: true,
  clean: true,
  minify: true,
  target: 'es2020',
  external: ['typescript'],
  bundle: true,
  drop: ['console'],
  treeShaking: true,
  sourcemap: false,
  outDir: 'dist',
  skipNodeModulesBundle: true,
});
