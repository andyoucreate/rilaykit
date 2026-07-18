/**
 * @fileoverview Reserved keys and codes for the unified, path-keyed error map.
 *
 * The form store keeps ONE error map keyed by field id. Form-level cross-field
 * validation issues are routed into that same map: an issue whose `path` names a
 * known field is attached to that field's bucket, and everything else — a
 * whole-form message with no path, or a path that matches no live field — lands
 * in the reserved {@link FORM_LEVEL_ERROR_KEY} bucket. Routed issues are tagged
 * with {@link FORM_LEVEL_ERROR_CODE} so they can be stripped and re-appended on
 * every form-level (re)evaluation without disturbing a field's OWN errors.
 */

/**
 * Reserved bucket key holding form-level (cross-field) errors that target no
 * specific field — a whole-form message, or a path matching no live field id.
 * Never a real field id: `__form__` is not a legal field name in any form the
 * builder can produce. Read via `useFormErrors()`.
 */
export const FORM_LEVEL_ERROR_KEY = '__form__';

/**
 * Reserved code stamped on every form-level error routed into the shared map,
 * whether it landed on a matched field's bucket or in {@link FORM_LEVEL_ERROR_KEY}.
 * It marks the error as owned by the form-level evaluation so that evaluation can
 * strip its own prior errors from a field before re-appending, leaving the
 * field's own (field-level) errors untouched.
 */
export const FORM_LEVEL_ERROR_CODE = 'FORM_LEVEL';
