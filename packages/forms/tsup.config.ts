import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points — isomorphic `.` + client-only `./react`
  entry: ['src/index.ts', 'src/react/index.ts'],
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // Generate TypeScript declarations with module resolution
  dts: {
    resolve: true,
  },
  
  // Use custom tsconfig for build
  tsconfig: 'tsconfig.build.json',
  
  // Clean dist folder before build
  clean: true,
  
  // Minify for smaller bundle size
  minify: true,
  
  // Target ES2020
  target: 'es2020',
  
  // External dependencies
  external: ['react', 'react-dom', '@rilaykit/core', 'clsx'],
  
  // Bundle internal dependencies
  bundle: true,
  
  // NO rollup `treeshake` pass: it strips the leading `'use client'` directive
  // from the client entry (`src/react/index.ts`), which Next.js App Router needs
  // as an RSC boundary. esbuild still tree-shakes via `bundle: true`; the main
  // entry (`src/index.ts`) stays isomorphic regardless.

  // No source maps for production
  sourcemap: false,
  
  // Output directory
  outDir: 'dist',
  
  // Skip node_modules bundling for external deps
  skipNodeModulesBundle: true,
}); 