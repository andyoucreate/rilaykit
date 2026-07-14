/**
 * PROOF — typed error hierarchy.
 * Matrix row: every public throw is a RilayError subclass with a stable code.
 * This test IS the "grep packages src for throw-new-<X>Error is a RilayError
 * subclass" proof, so the guarantee fails loudly if a bare `throw new Error(`
 * or a wrong-hierarchy `throw new FooError(` sneaks back in.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  InvalidSchemaError,
  NotFoundError,
  ValidationError,
  ril,
} from '@rilaykit/core';
import { form, resolveValidationDescriptor } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';

// Vitest runs from the repo root (where vitest.config.ts lives).
const PACKAGES_DIR = path.resolve(process.cwd(), 'packages');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * Error class names that satisfy the "public throw is a RilayError subclass"
 * contract. `Error` (bare) is intentionally absent.
 */
const ALLOWED_RILAY_SUBCLASSES = new Set([
  'RilayError',
  'ValidationError',
  'DuplicateError',
  'NotFoundError',
  'InvalidSchemaError',
  'ConfigurationError',
]);

/**
 * Pre-P1 domain errors documented in the P1 proof matrix as intentional
 * exceptions: they predate the hierarchy and carry their own stable `code`.
 */
const DOCUMENTED_PRE_P1_ERRORS = new Set(['SchemaValidationError', 'WorkflowPersistenceError']);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function collectPackageSourceFiles(): string[] {
  const srcDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PACKAGES_DIR, entry.name, 'src'));

  return srcDirs.flatMap((srcDir) => {
    try {
      return collectSourceFiles(srcDir);
    } catch {
      return []; // package without a src directory
    }
  });
}

/** Captures the error a thrower produces, or undefined if it does not throw. */
function capture(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('PROOF typed errors', () => {
  it('every `throw new <X>Error(` in packages/*/src is a RilayError subclass or a documented pre-P1 error', () => {
    // Matches `throw new Error(`, `throw new Error (`, `throw Error(`, and
    // `throw new FooError(` — capturing the thrown class name in group 2.
    const throwPattern = /throw\s+(?:new\s+)?(\w*Error)\s*\(/g;

    const offenders = collectPackageSourceFiles().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const found: string[] = [];
      for (const match of source.matchAll(throwPattern)) {
        const className = match[1];
        if (
          !ALLOWED_RILAY_SUBCLASSES.has(className) &&
          !DOCUMENTED_PRE_P1_ERRORS.has(className)
        ) {
          found.push(`${path.relative(PACKAGES_DIR, file)}: throw new ${className}(`);
        }
      }
      return found;
    });

    expect(offenders).toEqual([]);
  });
});

describe('PROOF typed error codes', () => {
  // Minimal one-component catalog for the throw fixtures.
  const r = ril.create().component('text', { renderer: () => null as never });

  it('ConfigurationError with code CONFIGURATION on a repeatable id containing a bracket', () => {
    const caught = capture(() =>
      form
        .create(r, 'x')
        .addRepeatable('bad[id', (b) => b.add({ id: 'a', type: 'text', props: {} }))
    );
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect((caught as ConfigurationError).code).toBe('CONFIGURATION');
  });

  it('ValidationError with code VALIDATION on a flow with duplicate step ids', () => {
    const dupStep = {
      id: 'dup',
      title: 'dup',
      formConfig: form.create(r, 'dup').add({ id: 'a', type: 'text', props: {} }).build(),
    };
    const caught = capture(() =>
      flow.create(r, 'w', 'W').addStep(dupStep).addStep(dupStep).build()
    );
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).code).toBe('VALIDATION');
  });

  it('NotFoundError with code NOT_FOUND when updating a field that does not exist', () => {
    const caught = capture(() =>
      form.create(r, 'x').add({ id: 'a', type: 'text', props: {} }).updateField('ghost', {})
    );
    expect(caught).toBeInstanceOf(NotFoundError);
    expect((caught as NotFoundError).code).toBe('NOT_FOUND');
  });

  it('InvalidSchemaError with code INVALID_SCHEMA on an unknown validator descriptor', () => {
    const caught = capture(() => resolveValidationDescriptor({ type: 'no-such-validator' }));
    expect(caught).toBeInstanceOf(InvalidSchemaError);
    expect((caught as InvalidSchemaError).code).toBe('INVALID_SCHEMA');
  });
});
