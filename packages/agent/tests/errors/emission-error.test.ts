import { SchemaValidationError } from '@rilaykit/forms';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toEmissionResult, validateNodeProps } from '../../src/errors/emission-error';

describe('toEmissionResult', () => {
  it("carries a SchemaValidationError's issues verbatim", () => {
    const error = new SchemaValidationError([
      { path: 'fields[0].type', message: 'Unknown component "slect"', severity: 'error' },
    ]);
    expect(toEmissionResult(error, ['id', 'fields'])).toEqual({
      error: 'Invalid form schema: [fields[0].type] Unknown component "slect"',
      issues: [{ path: 'fields[0].type', message: 'Unknown component "slect"' }],
      expectedKeys: ['id', 'fields'],
    });
  });

  it('never leaks a raw throw — an unknown error still yields the structured shape', () => {
    expect(toEmissionResult('boom')).toEqual({ error: 'boom', issues: [], expectedKeys: [] });
  });
});

describe('validateNodeProps', () => {
  const propsSchema = z.object({ label: z.string() });

  it('returns null for valid props', () => {
    expect(validateNodeProps(propsSchema, { label: 'Name' })).toBeNull();
  });

  it('names the offending path and the keys the model should have emitted', () => {
    const result = validateNodeProps(propsSchema, { labl: 'Name' });
    expect(result?.expectedKeys).toEqual(['label']);
    expect(result?.issues[0]?.path).toBe('label');
  });
});
