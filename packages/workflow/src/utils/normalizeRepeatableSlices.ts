import type { StepConfig } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { flattenRepeatableValues } from '@rilaykit/forms';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

    // Only pay the cost when an authored array is actually present: an
    // already-flat slice must keep its identity so unrelated memoisation and
    // change detection do not churn.
    const hasArrayShape = Object.keys(repeatableConfigs).some((id) =>
      Array.isArray(getOwn(slice, id))
    );
    if (!hasArrayShape) continue;

    normalized.set(step.id, flattenRepeatableValues(slice, repeatableConfigs).values);
    changed = true;
  }

  return changed ? Object.fromEntries(normalized) : data;
}
