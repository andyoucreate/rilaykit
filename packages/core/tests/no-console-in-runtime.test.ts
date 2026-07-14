/**
 * @fileoverview Guard test enforcing the no-console boundary.
 *
 * The library must never write directly to `console.*` from runtime code. All
 * logging must route through the internal logger (`getLogger` from
 * `@rilaykit/core`), whose default sink is the ONLY sanctioned place `console.*`
 * is called. This test recursively scans every non-test source file under
 * `packages/{core,forms,workflow}/src` (excluding the two sanctioned console
 * locations) and fails if any raw `console.*` call survives comment stripping.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(import.meta.url);
// packages/core/tests/no-console-in-runtime.test.ts -> repo root
const repoRoot = resolve(here, '../../../..');

const SCANNED_PACKAGES = ['core', 'forms', 'workflow'] as const;

/**
 * Sanctioned console locations, resolved to absolute paths. These are the ONLY
 * two places `console.*` is permitted in runtime code.
 */
const EXCLUDED_PATHS = [
  resolve(repoRoot, 'packages/core/src/monitoring'),
  resolve(repoRoot, 'packages/core/src/runtime/logger.ts'),
];

const CONSOLE_PATTERN = /console\.(log|warn|error|info|debug|group)/;

function isExcluded(absPath: string): boolean {
  return EXCLUDED_PATHS.some(
    (excluded) => absPath === excluded || absPath.startsWith(`${excluded}/`)
  );
}

function isScannableSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) return false;
  if (fileName.endsWith('.d.ts')) return false;
  if (fileName.includes('.test.') || fileName.includes('.spec.')) return false;
  return true;
}

function collectSourceFiles(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (isExcluded(abs)) continue;

    const stats = statSync(abs);
    if (stats.isDirectory()) {
      collectSourceFiles(abs, acc);
    } else if (isScannableSource(entry)) {
      acc.push(abs);
    }
  }
}

/**
 * Strip block comments (`/* ... *\/`, including JSDoc) and line comments
 * (`//...`) while preserving line numbers, so reported offsets stay accurate.
 */
function stripComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' ')
  );
  return withoutBlockComments.replace(/\/\/[^\n]*/g, '');
}

function findConsoleOffenders(): string[] {
  const files: string[] = [];
  for (const pkg of SCANNED_PACKAGES) {
    collectSourceFiles(resolve(repoRoot, 'packages', pkg, 'src'), files);
  }

  const offenders: string[] = [];
  for (const file of files) {
    const stripped = stripComments(readFileSync(file, 'utf8'));
    const lines = stripped.split('\n');
    lines.forEach((line, index) => {
      if (CONSOLE_PATTERN.test(line)) {
        offenders.push(`${relative(repoRoot, file)}:${index + 1}`);
      }
    });
  }

  return offenders;
}

describe('no-console-in-runtime boundary', () => {
  it('should scan a non-empty set of runtime source files', () => {
    const files: string[] = [];
    for (const pkg of SCANNED_PACKAGES) {
      collectSourceFiles(resolve(repoRoot, 'packages', pkg, 'src'), files);
    }
    // Guards against the walk silently finding nothing (wrong path, etc.).
    expect(files.length).toBeGreaterThan(0);
  });

  it('should have zero raw console.* calls in runtime code', () => {
    const offenders = findConsoleOffenders();
    expect(
      offenders,
      `Runtime console.* calls must route through getLogger(). Offenders:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
