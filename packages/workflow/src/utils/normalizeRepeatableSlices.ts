import type { RepeatableFieldConfig, StepConfig } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { buildCompositeKey } from '@rilaykit/forms';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rewrites one step slice from the AUTHORED shape (a repeatable's rows as an
 * array under its bare id) into the store's internal flat composite keys.
 * Everything else is carried through untouched, and a slice with no authored
 * array keeps its identity.
 *
 * `liveOrder` is the step's mirrored row order and exists to keep the row KEYS
 * stable. Re-keying the rows `k0..kn` would be silently wrong whenever the user
 * has reordered or deleted: the order mirror still names the old keys, so on
 * re-entry it would either resolve to nothing or — worse — re-sequence the rows
 * against values that no longer belong to them. When no order is mirrored the
 * rows can only ever be in insertion order, and `k0..kn` is exactly right; a
 * length mismatch means the mirror is not describing these rows, so it is not
 * trusted.
 *
 * The accumulator is a Map: both a field id and a repeatable id are author
 * data, and a plain `flat['__proto__'] = value` reassigns the prototype instead
 * of recording the key.
 */
export function flattenAuthoredSlice(
  slice: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig> | undefined,
  liveOrder?: Record<string, string[]>
): Record<string, unknown> {
  if (!repeatableConfigs) return slice;

  const authoredIds = Object.keys(repeatableConfigs).filter((id) => Array.isArray(getOwn(slice, id)));
  if (authoredIds.length === 0) return slice;

  const flat = new Map<string, unknown>();

  for (const [key, value] of Object.entries(slice)) {
    if (!authoredIds.includes(key)) {
      flat.set(key, value);
      continue;
    }

    const items = value as unknown[];
    const captured = liveOrder ? getOwn(liveOrder, key) : undefined;
    const itemKeys =
      captured && captured.length === items.length ? captured : items.map((_, index) => `k${index}`);

    items.forEach((rawItem, index) => {
      // Degrade gracefully: a null / non-object row (e.g. a null entry from
      // backend JSON) contributes no field values but still holds its slot.
      if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) return;
      for (const [fieldId, fieldValue] of Object.entries(rawItem as Record<string, unknown>)) {
        flat.set(buildCompositeKey(key, itemKeys[index], fieldId), fieldValue);
      }
    });
  }

  return Object.fromEntries(flat);
}

/**
 * Normalises every step slice of a workflow `allData` to the store's ONE
 * internal representation: flat composite keys (`lines[k0].label`).
 *
 * A repeatable's default arrives in its AUTHORED shape — `lines: [{label:'a'}]`
 * under the bare repeatable id — while the form mirrors every live change as
 * flat composite keys. Letting both shapes live in `allData` is what made the
 * append-only mirror re-enter: `_removeFieldValues` deletes flat keys, so a row
 * that exists only inside the raw array is unreachable — it survives the user's
 * delete, is submitted to the backend, and is restored on step re-entry. The
 * persistence layer inherits the same split, with `mergeStepSlices` layering
 * flat persisted keys over an intact default array.
 *
 * Collapsing to one shape at every point where data ENTERS the store closes the
 * mismatch at the root rather than teaching each consumer to speak both shapes.
 * The authored/structured shape remains the public contract of the submitted
 * form payload (`structureFormValues`); flat is internal only.
 *
 * The accumulator is a Map: a step id is untrusted data, and
 * `normalized['__proto__'] = slice` on a plain object reassigns the prototype
 * instead of recording a key, silently dropping that step.
 */
export function normalizeRepeatableSlices(
  data: Record<string, unknown>,
  steps: ReadonlyArray<StepConfig>
): Record<string, unknown> {
  const normalized = new Map<string, unknown>(Object.entries(data));
  let changed = false;

  for (const step of steps) {
    const repeatableConfigs = step.formConfig?.repeatableFields;
    if (!repeatableConfigs) continue;

    const slice = normalized.get(step.id);
    if (!isSlice(slice)) continue;

    // `flattenAuthoredSlice` returns the slice itself when there is no authored
    // array, so an already-flat slice keeps its identity and unrelated
    // memoisation and change detection do not churn.
    const flat = flattenAuthoredSlice(slice, repeatableConfigs);
    if (flat === slice) continue;

    normalized.set(step.id, flat);
    changed = true;
  }

  return changed ? Object.fromEntries(normalized) : data;
}
