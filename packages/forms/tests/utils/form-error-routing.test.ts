import { FORM_LEVEL_ERROR_CODE, FORM_LEVEL_ERROR_KEY, type FieldError } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { routeFormIssuesToKeys } from '../../src/utils/form-error-routing';

/**
 * The pure router that decides, per form-level issue, whether it lands ON a
 * field (its `path` names a known field) or in the reserved `__form__` bucket
 * (whole-form message, or a path no live field can express). Every routed error
 * is re-tagged with FORM_LEVEL_ERROR_CODE so the store can strip form-level
 * errors on each re-eval without touching a field's own errors.
 */
const known: ReadonlySet<string> = new Set(['password', 'confirmPassword']);

describe('routeFormIssuesToKeys', () => {
  it('routes a path that names a known field onto that field bucket', () => {
    const routed = routeFormIssuesToKeys(
      [{ message: 'Passwords do not match', path: 'confirmPassword' }],
      known
    );
    expect([...routed.keys()]).toEqual(['confirmPassword']);
    expect(routed.get('confirmPassword')).toEqual([
      { message: 'Passwords do not match', path: 'confirmPassword', code: FORM_LEVEL_ERROR_CODE },
    ]);
  });

  it('routes a non-empty path that names NO known field to __form__', () => {
    const routed = routeFormIssuesToKeys([{ message: 'stray', path: 'unknownField' }], known);
    expect([...routed.keys()]).toEqual([FORM_LEVEL_ERROR_KEY]);
    expect(routed.get(FORM_LEVEL_ERROR_KEY)?.[0].message).toBe('stray');
  });

  it('routes an empty-string path to __form__', () => {
    const routed = routeFormIssuesToKeys([{ message: 'whole form', path: '' }], known);
    expect(routed.get(FORM_LEVEL_ERROR_KEY)?.[0].message).toBe('whole form');
  });

  it('routes an undefined path to __form__', () => {
    const routed = routeFormIssuesToKeys([{ message: 'no path' }], known);
    expect(routed.get(FORM_LEVEL_ERROR_KEY)?.[0].message).toBe('no path');
  });

  it('tags every routed error with FORM_LEVEL_ERROR_CODE, preserving the message and overwriting the code', () => {
    const input: FieldError[] = [{ message: 'keep me', path: 'password', code: 'ORIGINAL' }];
    const tagged = routeFormIssuesToKeys(input, known).get('password')?.[0];
    expect(tagged?.message).toBe('keep me');
    expect(tagged?.code).toBe(FORM_LEVEL_ERROR_CODE);
  });

  it('groups multiple errors that target the same key', () => {
    const routed = routeFormIssuesToKeys(
      [
        { message: 'a', path: '' },
        { message: 'b', path: '' },
      ],
      known
    );
    expect(routed.get(FORM_LEVEL_ERROR_KEY)).toHaveLength(2);
    expect(routed.get(FORM_LEVEL_ERROR_KEY)?.map((e) => e.message)).toEqual(['a', 'b']);
  });
});
