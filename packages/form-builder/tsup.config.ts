import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],
  
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
  external: ['react', 'react-dom', '@rilay/core', 'clsx'],
  
  // Bundle internal dependencies
  bundle: true,
  
  // Tree-shake unused code
  treeshake: true,
  
  // No source maps for production
  sourcemap: false,
  
  // Output directory
  outDir: 'dist',
  
  // Skip node_modules bundling for external deps
  skipNodeModulesBundle: true,
}); 