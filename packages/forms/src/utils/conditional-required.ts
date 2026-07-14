import type { FieldError } from '@rilaykit/core';

/**
 * Error code for the synthetic "field is required" error produced by the
 * conditional-required check (a field made required via `conditions.required`
 * rather than a base validation schema).
 */
export const CONDITIONAL_REQUIRED_CODE = 'CONDITIONAL_REQUIRED';

/**
 * True when a field currently holds exactly the synthetic CONDITIONAL_REQUIRED
 * error(s) and nothing else — i.e. its committed error came solely from the
 * conditional-required check, with no base-validation error mixed in.
 *
 * Used to decide whether a field that has stopped being conditionally required
 * can have its committed error safely cleared (a base-validation error must be
 * left intact and recomputed on the next validation trigger).
 */
export function holdsOnlyConditionalRequiredError(errors: FieldError[] | undefined): boolean {
  return (
    !!errors && errors.length > 0 && errors.every((error) => error.code === CONDITIONAL_REQUIRED_CODE)
  );
}
