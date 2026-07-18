import { describe, expect, it } from 'vitest';
import { isStandardSchema, validateWithStandardSchema } from '../../src/validation';

/**
 * Round 31: a Standard Schema carrier may be a CALLABLE (a function), not only a
 * plain object — ArkType schemas are functions you call to validate, and the
 * Standard Schema spec requires only a `~standard` property, not an object
 * carrier. `isStandardSchema` gated on `typeof === 'object'`, so it rejected
 * every ArkType schema and field validation returned "Invalid validation rule:
 * must implement Standard Schema interface" for EVERY value. The guard must
 * accept a callable carrier while still discriminating real schemas.
 */

/** An ArkType-shaped schema: a callable that ALSO carries `~standard`. */
function makeCallableSchema() {
  const validate = (value: unknown) =>
    typeof value === 'string' && value.length >= 3
      ? { value }
      : { issues: [{ message: 'too short' }] };
  return Object.assign((value: unknown) => validate(value), {
    '~standard': { version: 1 as const, vendor: 'arktype-like', validate },
  });
}

/** A zod/valibot-shaped schema: a plain object carrying `~standard`. */
function makeObjectSchema() {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'object-like',
      validate: (value: unknown) =>
        typeof value === 'string' && value.length >= 3
          ? { value }
          : { issues: [{ message: 'too short' }] },
    },
  };
}

describe('Round 31: isStandardSchema accepts a callable (ArkType-shaped) carrier', () => {
  it('recognises a callable Standard Schema', () => {
    expect(isStandardSchema(makeCallableSchema())).toBe(true);
  });

  it('still recognises an object Standard Schema (zod/valibot-shaped)', () => {
    expect(isStandardSchema(makeObjectSchema())).toBe(true);
  });

  it('still rejects a bare function with no ~standard property', () => {
    expect(isStandardSchema((v: unknown) => v)).toBe(false);
  });

  it('rejects a plain object with no ~standard property', () => {
    expect(isStandardSchema({ vendor: 'nope' })).toBe(false);
  });

  it('validates through a callable schema (invalid → issues, valid → value)', async () => {
    const schema = makeCallableSchema();
    const bad = await validateWithStandardSchema(schema, 'ab');
    expect(bad.isValid).toBe(false);
    const good = await validateWithStandardSchema(schema, 'abcd');
    expect(good.isValid).toBe(true);
  });
});
