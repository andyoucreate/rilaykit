import type { FormReValidateMode, FormValidationMode } from '@rilaykit/core';

/** The two user-driven events that can trigger field validation. Submit always
 * validates and does not consult this predicate. */
export type ValidationTriggerEvent = 'change' | 'blur';

export interface ValidationTimingState {
  /** When a field FIRST validates (before it has errored). */
  readonly mode: FormValidationMode;
  /** When a field RE-validates once it has errored at least once. */
  readonly reValidateMode: FormReValidateMode;
  /** Whether the field currently carries an error (the re-validation phase). */
  readonly hasErrored: boolean;
  /** Whether the field has been touched (blurred or submitted). */
  readonly touched: boolean;
}

/**
 * The single source of truth for "does this change/blur event trigger
 * validation?", mirroring React Hook Form's two-phase model. Replaces the
 * scattered `validateOnChange || touched` / `validateOnBlur !== false` gates so
 * one place decides the timing.
 *
 * Phase is per field: once it has errored, `reValidateMode` governs and overrides
 * `mode` entirely (so `mode: 'all'` + `reValidateMode: 'onSubmit'` goes silent
 * after the first error). Before that, `mode` governs, with `onTouched` gating
 * change on the touched flag.
 */
export function shouldValidateOnEvent(
  event: ValidationTriggerEvent,
  { mode, reValidateMode, hasErrored, touched }: ValidationTimingState
): boolean {
  if (hasErrored) {
    switch (reValidateMode) {
      case 'onChange':
        return event === 'change';
      case 'onBlur':
        return event === 'blur';
      case 'onSubmit':
        return false;
    }
  }

  switch (mode) {
    case 'onSubmit':
      return false;
    case 'onBlur':
      return event === 'blur';
    case 'onChange':
      return event === 'change';
    case 'onTouched':
      return event === 'blur' || touched;
    case 'all':
      return true;
  }
}
