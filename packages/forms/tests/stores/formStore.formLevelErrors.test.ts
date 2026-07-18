import { FORM_LEVEL_ERROR_CODE, FORM_LEVEL_ERROR_KEY } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { createFormStore } from '../../src/stores/formStore';

/**
 * `_setFormLevelErrors` is the store action refactor #1 added to reconcile routed
 * cross-field errors into the ONE path-keyed error map. Its load-bearing
 * invariant (Karl's pinned "routage par path + code taggué" choice): a routed
 * form-level error COEXISTS with a field's own errors, and stripping it on the
 * next evaluation must leave the field's own errors untouched.
 */
describe('_setFormLevelErrors — coexistence and clear', () => {
  it("appends a routed form-level error onto a field WITHOUT wiping the field's own errors", () => {
    const store = createFormStore();
    store.getState()._setErrors('email', [{ message: 'Invalid email', code: 'INVALID' }]);

    store.getState()._setFormLevelErrors(
      new Map([
        ['email', [{ message: 'cross-field', code: FORM_LEVEL_ERROR_CODE }]],
        [FORM_LEVEL_ERROR_KEY, [{ message: 'whole form', code: FORM_LEVEL_ERROR_CODE }]],
      ])
    );

    const { errors, isValid } = store.getState();
    expect(errors.email).toEqual([
      { message: 'Invalid email', code: 'INVALID' },
      { message: 'cross-field', code: FORM_LEVEL_ERROR_CODE },
    ]);
    expect(errors[FORM_LEVEL_ERROR_KEY]).toEqual([
      { message: 'whole form', code: FORM_LEVEL_ERROR_CODE },
    ]);
    expect(isValid).toBe(false);
  });

  it("strips a field's form-level error on re-eval while keeping its own error", () => {
    const store = createFormStore();
    store.getState()._setErrors('email', [{ message: 'Invalid email', code: 'INVALID' }]);
    store
      .getState()
      ._setFormLevelErrors(new Map([['email', [{ message: 'x', code: FORM_LEVEL_ERROR_CODE }]]]));

    // Re-evaluate with NO form-level errors: the tagged one is stripped, the
    // field's own INVALID error survives.
    store.getState()._setFormLevelErrors(new Map());

    expect(store.getState().errors.email).toEqual([{ message: 'Invalid email', code: 'INVALID' }]);
    expect(store.getState().errors[FORM_LEVEL_ERROR_KEY]).toEqual([]);
  });

  it('clears the __form__ bucket and flips isValid back true when the only errors were form-level', () => {
    const store = createFormStore();
    store
      .getState()
      ._setFormLevelErrors(
        new Map([[FORM_LEVEL_ERROR_KEY, [{ message: 'nope', code: FORM_LEVEL_ERROR_CODE }]]])
      );
    expect(store.getState().isValid).toBe(false);

    store.getState()._setFormLevelErrors(new Map());
    expect(store.getState().errors[FORM_LEVEL_ERROR_KEY]).toEqual([]);
    expect(store.getState().isValid).toBe(true);
  });
});
