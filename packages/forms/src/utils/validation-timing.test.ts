import { describe, expect, it } from 'vitest';
import { type ValidationTimingState, shouldValidateOnEvent } from './validation-timing';

/**
 * The single source of truth for "does this change/blur event trigger validation?",
 * mirroring React Hook Form's two-phase model: `mode` governs a field's FIRST
 * validation, `reValidateMode` governs re-validation once it has errored. Submit
 * always validates and never consults this predicate.
 */
function state(over: Partial<ValidationTimingState>): ValidationTimingState {
  return {
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    hasErrored: false,
    touched: false,
    ...over,
  };
}

describe('shouldValidateOnEvent — first-validation phase (mode, hasErrored=false)', () => {
  it("mode 'onSubmit' never validates on change or blur", () => {
    expect(shouldValidateOnEvent('change', state({ mode: 'onSubmit' }))).toBe(false);
    expect(shouldValidateOnEvent('blur', state({ mode: 'onSubmit' }))).toBe(false);
    // touched must not smuggle validation in under onSubmit
    expect(shouldValidateOnEvent('change', state({ mode: 'onSubmit', touched: true }))).toBe(false);
  });

  it("mode 'onChange' validates on change only", () => {
    expect(shouldValidateOnEvent('change', state({ mode: 'onChange' }))).toBe(true);
    expect(shouldValidateOnEvent('blur', state({ mode: 'onChange' }))).toBe(false);
  });

  it("mode 'onBlur' validates on blur only", () => {
    expect(shouldValidateOnEvent('blur', state({ mode: 'onBlur' }))).toBe(true);
    expect(shouldValidateOnEvent('change', state({ mode: 'onBlur' }))).toBe(false);
  });

  it("mode 'onTouched' validates on blur, then on change once touched", () => {
    // first blur validates (and marks touched downstream)
    expect(shouldValidateOnEvent('blur', state({ mode: 'onTouched', touched: false }))).toBe(true);
    // a change before any blur does not
    expect(shouldValidateOnEvent('change', state({ mode: 'onTouched', touched: false }))).toBe(
      false
    );
    // once touched, subsequent changes validate live
    expect(shouldValidateOnEvent('change', state({ mode: 'onTouched', touched: true }))).toBe(true);
  });

  it("mode 'all' validates on both change and blur", () => {
    expect(shouldValidateOnEvent('change', state({ mode: 'all' }))).toBe(true);
    expect(shouldValidateOnEvent('blur', state({ mode: 'all' }))).toBe(true);
  });
});

describe('shouldValidateOnEvent — re-validation phase (reValidateMode, hasErrored=true)', () => {
  it("reValidateMode 'onChange' re-validates on change only — regardless of mode", () => {
    // mode is onSubmit (silent phase-1) but the field has errored → reValidateMode wins
    expect(
      shouldValidateOnEvent('change', state({ hasErrored: true, reValidateMode: 'onChange' }))
    ).toBe(true);
    expect(
      shouldValidateOnEvent('blur', state({ hasErrored: true, reValidateMode: 'onChange' }))
    ).toBe(false);
  });

  it("reValidateMode 'onBlur' re-validates on blur only", () => {
    expect(
      shouldValidateOnEvent('blur', state({ hasErrored: true, reValidateMode: 'onBlur' }))
    ).toBe(true);
    expect(
      shouldValidateOnEvent('change', state({ hasErrored: true, reValidateMode: 'onBlur' }))
    ).toBe(false);
  });

  it("reValidateMode 'onSubmit' suppresses live re-validation entirely", () => {
    expect(
      shouldValidateOnEvent('change', state({ hasErrored: true, reValidateMode: 'onSubmit' }))
    ).toBe(false);
    expect(
      shouldValidateOnEvent('blur', state({ hasErrored: true, reValidateMode: 'onSubmit' }))
    ).toBe(false);
  });

  it("the errored phase overrides an otherwise-live mode (mode 'all' + reValidateMode 'onSubmit' goes silent)", () => {
    expect(
      shouldValidateOnEvent(
        'change',
        state({ mode: 'all', hasErrored: true, reValidateMode: 'onSubmit' })
      )
    ).toBe(false);
  });
});

describe('shouldValidateOnEvent — onSubmit + onChange (RHF-raw baseline, not the lib default) reproduces the hand-fixed submit UX', () => {
  it('silent before an error, live after — a submit-errored field clears as the user types', () => {
    // pristine, untouched, no error → silent
    expect(shouldValidateOnEvent('change', state({}))).toBe(false);
    expect(shouldValidateOnEvent('blur', state({}))).toBe(false);
    // after submit paints an error → live re-validation on change
    expect(shouldValidateOnEvent('change', state({ hasErrored: true }))).toBe(true);
  });
});
