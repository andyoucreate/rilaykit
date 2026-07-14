/**
 * PROOF — typed error hierarchy.
 * Matrix row: every public throw is a RilayError subclass with a stable code.
 * This test IS the "grep packages src for bare throw-new-Error equals zero"
 * proof, so the guarantee fails loudly if a bare throw sneaks back in.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the repo root (where vitest.config.ts lives).
const PACKAGES_DIR = path.resolve(process.cwd(), 'packages');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

describe('PROOF typed errors', () => {
  it('packages/*/src contains zero bare `throw new Error(`', () => {
    const srcDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(PACKAGES_DIR, entry.name, 'src'));

    const offenders = srcDirs.flatMap((srcDir) => {
      let files: string[];
      try {
        files = collectSourceFiles(srcDir);
      } catch {
        return []; // package without a src directory
      }
      return files.filter((file) => readFileSync(file, 'utf8').includes('throw new Error('));
    });

    expect(offenders.map((file) => path.relative(PACKAGES_DIR, file))).toEqual([]);
  });
});
