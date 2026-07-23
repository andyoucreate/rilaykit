import { describe, expect, it } from 'vitest';
import { coerceEmittedSchema } from '../../src/streaming/coerce-emitted-schema';

/**
 * Defense-in-depth for issue #23: even with an object-typed emitted schema, a
 * model may occasionally stringify the FormSchema/FlowSchema. This helper parses
 * a stringified emission back to an object at the agent boundary so the built-in
 * renderers stay robust regardless of provider quirks.
 */
describe('coerceEmittedSchema', () => {
  it('parses a stringified JSON object back to the object', () => {
    expect(coerceEmittedSchema('{"id":"contact","fields":[]}')).toEqual({
      id: 'contact',
      fields: [],
    });
  });

  it('returns a real object untouched (referential passthrough — no needless copy)', () => {
    const obj = { id: 'contact', fields: [{ id: 'email', type: 'email', props: {} }] };
    expect(coerceEmittedSchema(obj)).toBe(obj);
  });

  it('returns the original string when it is not valid JSON (compileForm still owns the error)', () => {
    expect(coerceEmittedSchema('not json {')).toBe('not json {');
  });

  it('returns a stringified NON-object (e.g. a bare JSON string/number) untouched, not its parse', () => {
    // `"\"hi\""` parses to the string "hi" and `"42"` to 42 — neither is a schema
    // object, so coercing them would swap one wrong value for another. Only an
    // object (or array) parse is a plausible schema; scalars pass through as-is.
    expect(coerceEmittedSchema('"hi"')).toBe('"hi"');
    expect(coerceEmittedSchema('42')).toBe('42');
  });

  it('leaves null and undefined untouched', () => {
    expect(coerceEmittedSchema(null)).toBeNull();
    expect(coerceEmittedSchema(undefined)).toBeUndefined();
  });
});
