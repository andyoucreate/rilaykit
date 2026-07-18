import type { FieldError } from '@rilaykit/core';
import { FORM_LEVEL_ERROR_CODE, FORM_LEVEL_ERROR_KEY } from '@rilaykit/core';

/**
 * Routes form-level (cross-field) validation errors into the shared, path-keyed
 * error map. For each error: if its `path` is a non-empty string naming a KNOWN
 * field id, it is attached to that field's bucket; otherwise it falls to the
 * reserved {@link FORM_LEVEL_ERROR_KEY} bucket (a whole-form message, or a path
 * that matches no live field — e.g. a repeatable composite key the form schema's
 * object path cannot express).
 *
 * Every routed error is tagged with {@link FORM_LEVEL_ERROR_CODE} (message
 * preserved, code overwritten) so the store can strip and re-append form-level
 * errors on each (re)evaluation without touching a field's own errors.
 *
 * The single source of truth for routing — used by BOTH the submit path and the
 * live path so the two can never diverge.
 */
export function routeFormIssuesToKeys(
  errors: FieldError[],
  knownFieldIds: ReadonlySet<string>
): Map<string, FieldError[]> {
  const routed = new Map<string, FieldError[]>();

  for (const error of errors) {
    const key =
      typeof error.path === 'string' && error.path.length > 0 && knownFieldIds.has(error.path)
        ? error.path
        : FORM_LEVEL_ERROR_KEY;

    const tagged: FieldError = { ...error, code: FORM_LEVEL_ERROR_CODE };
    const bucket = routed.get(key);
    if (bucket) {
      bucket.push(tagged);
    } else {
      routed.set(key, [tagged]);
    }
  }

  return routed;
}
