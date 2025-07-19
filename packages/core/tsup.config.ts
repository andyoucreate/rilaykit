import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],
  
  // Output formats for maximum compatibility
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

  // Target ES2020 for good compatibility and smaller output
  target: 'es2020',
  
  // External peer dependencies - don't bundle these
  external: ['react', 'typescript'],
  
  // Bundle internal modules for proper resolution
  bundle: true,
  
  // Tree-shake unused code
  treeshake: true,
  
  // No source maps for production (smaller files)
  sourcemap: false,
  
  // Output directory
  outDir: 'dist',
}); 