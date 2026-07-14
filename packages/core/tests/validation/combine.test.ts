import { describe, expect, it } from 'vitest';
import { combine, minLength, number, required } from '../../src/validation';
import { combineSchemas } from '../../src/validation/unified-utils';

describe('combine() synchronicity (Bug 3)', () => {
  it('returns a non-Promise result when all sub-schemas are synchronous', () => {
    const schema = combine(required(), minLength(3));
    const result = schema['~standard'].validate('hello');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ value: 'hello' });
  });

  it('reports failure synchronously for invalid input', () => {
    const schema = combine(required(), minLength(3));
    const result = schema['~standard'].validate('');
    expect(result).not.toBeInstanceOf(Promise);
    expect('issues' in (result as object)).toBe(true);
  });

  it('combineSchemas() is also synchronous when sub-schemas are sync', () => {
    const schema = combineSchemas(required(), minLength(3));
    const result = schema['~standard'].validate('hello');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('stays async when a sub-schema returns a Promise', async () => {
    const asyncSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => Promise.resolve({ value: 'x' }),
      },
    };
    const schema = combine(required(), asyncSchema as never);
    const result = schema['~standard'].validate('x');
    expect(result).toBeInstanceOf(Promise);
    await expect(result as Promise<unknown>).resolves.toEqual({ value: 'x' });
  });
});

describe('combine() value threading (Bug 4)', () => {
  it('threads the transformed value through subsequent sub-schemas', () => {
    const schema = combine(number(), required());
    const result = schema['~standard'].validate('42');
    expect(result).toEqual({ value: 42 });
  });
});
