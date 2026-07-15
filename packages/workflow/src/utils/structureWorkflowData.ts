import type { RepeatableFieldConfig, StepConfig } from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { parseCompositeKey, structureFormValues } from '@rilaykit/forms';

/**
 * A step slice is a plain object keyed by field id. An array or a primitive is
 * not a slice and is carried through untouched.
 */
function isSlice(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defineOwn(table: Record<string, unknown>, key: string, value: unknown): void {
  // A repeatable id is author data: a plain `table[key] = value` routes a
  // `__proto__` key through Object.prototype's accessor, swallowing the entry.
  Object.defineProperty(table, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * The row keys present in a flat slice for one repeatable, in insertion order.
 *
 * This is all the values can ever tell us — a user reorder rewrites the order
 * and nothing else — which is why a mirrored order wins over it when there is
 * one.
 */
function reconstructRowOrder(slice: Record<string, unknown>, repeatableId: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const key of Object.keys(slice)) {
    const parsed = parseCompositeKey(key);
    if (!parsed || parsed.repeatableId !== repeatableId) continue;
    if (seen.has(parsed.itemKey)) continue;
    seen.add(parsed.itemKey);
    keys.push(parsed.itemKey);
  }

  return keys;
}

/**
 * Rewrites one step slice from the store's internal flat composite keys back
 * into the AUTHORED shape a host expects (`lines: [{label:'a'}]`).
 *
 * The store speaks flat so that a removal has keys to delete and every writer
 * agrees on one representation; the host contract is structured. This is the
 * boundary between the two, and it is the ONLY place the structured shape is
 * produced for the workflow — so the payload no longer depends on whether the
 * user happened to leave the step through the form's submit button.
 *
 * A repeatable with no rows in the slice is left out entirely rather than
 * emitted as `[]`: the slice is the record of what the step HAS, and inventing
 * a key for a step the user never reached would put it in the payload.
 */
export function structureStepSlice(
  slice: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig> | undefined,
  mirroredOrder?: Record<string, string[]>
): Record<string, unknown> {
  if (!repeatableConfigs) return slice;

  const order: Record<string, string[]> = {};
  const activeConfigs: Record<string, RepeatableFieldConfig> = {};

  for (const [id, config] of Object.entries(repeatableConfigs)) {
    const reconstructed = reconstructRowOrder(slice, id);
    if (reconstructed.length === 0) continue;

    // A captured order may only re-sequence rows that actually resolved: it can
    // never resurrect a row whose values are gone (the user deleted it), and a
    // row it does not mention keeps its reconstructed position at the end.
    const captured = mirroredOrder ? getOwn(mirroredOrder, id) : undefined;
    const resolved = captured
      ? [
          ...captured.filter((key) => reconstructed.includes(key)),
          ...reconstructed.filter((key) => !captured.includes(key)),
        ]
      : reconstructed;

    defineOwn(order, id, resolved);
    defineOwn(activeConfigs, id, config);
  }

  if (Object.keys(activeConfigs).length === 0) return slice;

  return structureFormValues(slice, activeConfigs, order);
}

/**
 * Structures every step slice of a workflow `allData` on its way out to the
 * host — the completion payload and the step data handed to `onAfterValidation`.
 */
export function structureWorkflowData(
  allData: Record<string, unknown>,
  steps: ReadonlyArray<StepConfig>,
  repeatableOrders?: Record<string, Record<string, string[]>>
): Record<string, unknown> {
  const structured = new Map<string, unknown>(Object.entries(allData));
  let changed = false;

  for (const step of steps) {
    const repeatableConfigs = step.formConfig?.repeatableFields;
    if (!repeatableConfigs) continue;

    const slice = structured.get(step.id);
    if (!isSlice(slice)) continue;

    const out = structureStepSlice(
      slice,
      repeatableConfigs,
      repeatableOrders ? getOwn(repeatableOrders, step.id) : undefined
    );
    if (out === slice) continue;

    structured.set(step.id, out);
    changed = true;
  }

  // The accumulator is a Map: a step id is data, and a plain
  // `structured['__proto__'] = slice` would reassign the prototype instead of
  // recording the key, silently dropping that step from the payload.
  return changed ? Object.fromEntries(structured) : allData;
}
