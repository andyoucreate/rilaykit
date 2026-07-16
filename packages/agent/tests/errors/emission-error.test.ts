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
      validateNodeProps(propsSchema, { label: 'Name', dangerouslySetInnerHTML: { __html: '<img onerror=x>' } })
    ).toEqual({ ok: true, value: { label: 'Name' } });
  });

  it('names the offending path and the keys the model should have emitted', () => {
    const validation = validateNodeProps(propsSchema, { labl: 'Name' });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.result.expectedKeys).toEqual(['label']);
    expect(validation.result.issues[0]?.path).toBe('label');
  });
});
