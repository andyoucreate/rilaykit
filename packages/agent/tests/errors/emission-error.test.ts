import { SchemaValidationError } from '@rilaykit/forms';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toEmissionResult, validateNodeProps } from '../../src/errors/emission-error';

describe('toEmissionResult', () => {
  it('carries a single error-severity issue through, with no expectedKeys when the source omits them', () => {
    const error = new SchemaValidationError([
      { path: 'fields[0].type', message: 'Unknown component "slect"', severity: 'error' },
    ]);
    expect(toEmissionResult(error, ['id', 'fields'])).toEqual({
      error: 'Invalid form schema: [fields[0].type] Unknown component "slect"',
      issues: [{ path: 'fields[0].type', message: 'Unknown component "slect"', severity: 'error' }],
      expectedKeys: ['id', 'fields'],
    });
  });

  it('carries severity and per-issue expectedKeys through from a mixed SchemaValidationError', () => {
    const error = new SchemaValidationError([
      {
        path: 'fields[0].props.label',
        message: 'Unknown key "labl"',
        severity: 'error',
        expectedKeys: ['label', 'placeholder'],
      },
      {
        path: 'rows[1].conditions[0].field',
        message: 'Leaf condition must have a non-empty "field"',
        severity: 'warning',
      },
    ]);
    expect(toEmissionResult(error, ['id', 'fields'])).toEqual({
      error: 'Invalid form schema: [fields[0].props.label] Unknown key "labl"',
      issues: [
        {
          path: 'fields[0].props.label',
          message: 'Unknown key "labl"',
          severity: 'error',
          expectedKeys: ['label', 'placeholder'],
        },
        {
          path: 'rows[1].conditions[0].field',
          message: 'Leaf condition must have a non-empty "field"',
          severity: 'warning',
        },
      ],
      expectedKeys: ['id', 'fields'],
    });
  });

  it('never leaks a raw throw — an unknown error still yields the structured shape', () => {
    expect(toEmissionResult('boom')).toEqual({ error: 'boom', issues: [], expectedKeys: [] });
  });

  it("never throws when the error's own message getter throws", () => {
    class RogueMessage extends Error {
      override get message(): string {
        throw new Error('message getter blew up');
      }
    }
    expect(() => toEmissionResult(new RogueMessage())).not.toThrow();
    expect(toEmissionResult(new RogueMessage())).toEqual({
      error: 'Unrenderable error',
      issues: [],
      expectedKeys: [],
    });
  });

  it('never throws when a non-Error value throws from toString()', () => {
    const rogue = {
      toString(): string {
        throw new Error('toString blew up');
      },
    };
    expect(() => toEmissionResult(rogue)).not.toThrow();
    expect(toEmissionResult(rogue)).toEqual({
      error: 'Unrenderable error',
      issues: [],
      expectedKeys: [],
    });
  });
});

describe('the structural SchemaValidationError discriminant', () => {
  // `isSchemaValidationError` narrows structurally (own `code` + `issues` shape),
  // not via `instanceof SchemaValidationError` — see the docstring on
  // `isSchemaValidationError` in emission-error.ts. These pin that exact
  // boundary so a revert to `instanceof`, or a weakening of the structural
  // check, fails here even though it would not fail against a real
  // `SchemaValidationError`.

  it('PIN: treats a hand-forged Error carrying the schema-validation code AND a well-formed issues array as a schema error, mapping its issues through', () => {
    const forged = new Error('forged schema error') as Error & {
      code: string;
      issues: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
    };
    forged.code = 'SCHEMA_VALIDATION_ERROR';
    forged.issues = [
      { path: 'fields[0].type', message: 'Unknown component "slect"', severity: 'error' },
    ];

    // This already passes on the current structural check — it pins the dual-package
    // motivation (a `SchemaValidationError` thrown by one installed copy of
    // `@rilaykit/forms` must still be recognized here even when it fails
    // `instanceof` against a different copy) rather than driving new behavior.
    expect(toEmissionResult(forged, ['id', 'fields'])).toEqual({
      error: 'forged schema error',
      issues: [{ path: 'fields[0].type', message: 'Unknown component "slect"', severity: 'error' }],
      expectedKeys: ['id', 'fields'],
    });
  });

  it('PIN: falls to the generic branch when an Error carries the schema-validation code but no issues array', () => {
    const forged = new Error('has the code, no issues') as Error & { code: string };
    forged.code = 'SCHEMA_VALIDATION_ERROR';

    // Also already passes — pins that the `code` alone does not qualify: both
    // halves of the structural check (`code` AND `Array.isArray(issues)`) are
    // required, so this yields the generic message-only shape.
    expect(toEmissionResult(forged, ['id', 'fields'])).toEqual({
      error: 'has the code, no issues',
      issues: [],
      expectedKeys: ['id', 'fields'],
    });
  });
});

describe('toEmissionResult never throws on a rogue schema-validation issue', () => {
  function forgeSchemaError(issues: unknown[]): Error {
    const forged = new Error('forged schema error') as Error & { code: string; issues: unknown[] };
    forged.code = 'SCHEMA_VALIDATION_ERROR';
    forged.issues = issues;
    return forged;
  }

  it('maps a null issue entry to a safe placeholder instead of crashing on property access', () => {
    const forged = forgeSchemaError([null]);

    expect(() => toEmissionResult(forged)).not.toThrow();
    expect(toEmissionResult(forged)).toEqual({
      error: 'forged schema error',
      issues: [{ path: '', message: 'Unrenderable issue' }],
      expectedKeys: [],
    });
  });

  it('maps an issue whose "path" getter throws to a safe placeholder instead of crashing', () => {
    const rogueIssue = {
      get path(): string {
        throw new Error('path getter blew up');
      },
      message: 'irrelevant',
      severity: 'error' as const,
    };
    const forged = forgeSchemaError([rogueIssue]);

    expect(() => toEmissionResult(forged)).not.toThrow();
    expect(toEmissionResult(forged)).toEqual({
      error: 'forged schema error',
      issues: [{ path: '', message: 'Unrenderable issue' }],
      expectedKeys: [],
    });
  });
});

describe('validateNodeProps', () => {
  const propsSchema = z.object({ label: z.string() });

  it('returns the parsed value for valid props', () => {
    expect(validateNodeProps(propsSchema, { label: 'Name' })).toEqual({
      ok: true,
      value: { label: 'Name' },
    });
  });

  it('returns the PARSED value, not the raw input — zod strip mode drops excess keys', () => {
    expect(
      validateNodeProps(propsSchema, {
        label: 'Name',
        dangerouslySetInnerHTML: { __html: '<img onerror=x>' },
      })
    ).toEqual({ ok: true, value: { label: 'Name' } });
  });

  it('names the offending path and the keys the model should have emitted', () => {
    const validation = validateNodeProps(propsSchema, { labl: 'Name' });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.result.expectedKeys).toEqual(['label']);
    expect(validation.result.issues[0]?.path).toBe('label');
  });

  it('rejects an ASYNC propsSchema with a structured error — an agent emission renders synchronously or not at all', () => {
    const asyncSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => Promise.resolve({ value: {} }),
      },
    } as unknown as Parameters<typeof validateNodeProps>[0];
    const validation = validateNodeProps(asyncSchema, {});
    expect(validation).toEqual({
      ok: false,
      result: {
        error: 'propsSchema must validate synchronously to render an agent emission',
        issues: [],
        expectedKeys: [],
      },
    });
  });

  it('renders vendor-agnostic issue paths: `{ key }` segments, plain segments and a MISSING path all map to strings', () => {
    // A non-zod Standard Schema vendor may report path segments as objects
    // carrying `key` (per the spec), and may omit `path` entirely. Neither may
    // crash or mangle the dotted path the model retries from.
    const vendorSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [
            { message: 'bad leaf', path: [{ key: 'rows' }, 0, 'label'] },
            { message: 'bad root' },
          ],
        }),
      },
    } as unknown as Parameters<typeof validateNodeProps>[0];
    const validation = validateNodeProps(vendorSchema, {});
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.result.issues).toEqual([
      { path: 'rows.0.label', message: 'bad leaf' },
      { path: '', message: 'bad root' },
    ]);
    // A schema with no zod-style `.shape` cannot name expected keys: empty, not a crash.
    expect(validation.result.expectedKeys).toEqual([]);
  });
});
