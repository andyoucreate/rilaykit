import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points - will be overridden by individual packages
  entry: ['src/index.ts'],
  
  // Output formats
  format: ['esm', 'cjs'],
  
  // Generate TypeScript declarations
  dts: true,
  
  // Code splitting for better tree-shaking
  splitting: true,
  
  // Clean dist folder before build
  clean: true,
  
  // Minify output for smaller bundles
  minify: true,
  
  // Target modern environments for smaller output
  target: 'es2020',
  
  // External dependencies (peer dependencies should be external)
  external: ['react', 'react-dom', 'typescript'],
  
  // Bundle dependencies for self-contained packages
  bundle: true,
  
  // Remove console logs in production
  drop: ['console'],
  
  // Optimize for size
  treeShaking: true,
  
  // No source maps in production (saves significant space)
  sourcemap: false,
  
  // Optimize output structure
  outDir: 'dist',
  
  // Skip type checking (faster builds, rely on type-check script)
  skipNodeModulesBundle: true,
}); 