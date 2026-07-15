import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // MUST stay false. With `splitting: true` and a `cjs` format, tsup routes the
  // CJS output through sucrase's ESM→CJS transform, whose `_createStarExport`
  // installs every `export *` name as a getter-only property BEFORE the explicit
  // `exports.x = ...` assignments run. That inverts ESM's precedence — where an
  // explicit export shadows a star export — and this barrel depends on exactly
  // that precedence: it re-exports all of `@rilaykit/core` and then deliberately
  // shadows `ril` with the wrapper that adds `.form()`/`.flow()`. The result was
  // a CJS bundle that threw on `require()`:
  //   TypeError: Cannot set property ril of #<Object> which has only a getter
  // With splitting off, esbuild emits the CJS natively — explicit exports first
  // via `__export`, then `__reExport` skips names already defined — which is the
  // correct ESM semantics. Splitting buys nothing here anyway: there is a single
  // entry point. `tests/build/cjs-bundle.test.ts` pins this.
  splitting: false,
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
