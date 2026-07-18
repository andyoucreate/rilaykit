import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react/index.ts', 'src/ai-sdk/index.ts', 'src/anthropic/index.ts'],
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
  // correct ESM semantics. Splitting buys nothing here anyway: each entry below
  // is a self-contained barrel, none importing another. `tests/published-bundle.test.ts`
  // pins this (the all-in-one's `ril` shadow, plus CJS/ESM parity for every entry).
  splitting: false,
  clean: true,
  minify: true,
  target: 'es2020',
  external: [
    'react',
    'react-dom',
    'typescript',
    'ai',
    '@anthropic-ai/sdk',
    '@rilaykit/core',
    '@rilaykit/forms',
    '@rilaykit/workflow',
    '@rilaykit/agent',
  ],
  bundle: true,
  drop: ['console'],
  // NO rollup `treeShaking` pass: it strips the leading `'use client'` directive
  // from the client entries (`src/index.ts`, `src/react/index.ts`) that Next.js
  // App Router needs as RSC boundaries. esbuild still tree-shakes via `bundle`.
  sourcemap: false,
  outDir: 'dist',
  skipNodeModulesBundle: true,
});
