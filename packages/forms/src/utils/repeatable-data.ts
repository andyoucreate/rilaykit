import { getOwn, hasOwn } from '@rilaykit/core';
import type { RepeatableFieldConfig } from '@rilaykit/core';

// =================================================================
// COMPOSITE KEY HELPERS
// =================================================================

/**
 * Regex to parse composite keys: `repeatableId[key].fieldId`
 */
const COMPOSITE_KEY_REGEX = /^([^[\]]+)\[([^\]]+)\]\.(.+)$/;

/**
 * Defines `table[key] = value` as a real own data property.
 *
 * A plain `table[key] = value` routes a `__proto__` key through
 * Object.prototype's accessor: the value is swallowed and the object's
 * prototype is grafted instead, so that entry silently vanishes from the form.
 * (Object-local, never Object.prototype — the verdict is "wrong, not
 * exploitable".) `defineProperty` bypasses the accessor and records the key.
 *
 * EVERY write in this file that is keyed by an author-chosen id — a field id, a
 * template field id, a repeatable id — must go through this helper. Plain `=`
 * and `Object.assign` both use [[Set]] semantics and launder the fix away.
 */
function defineOwn(table: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(table, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Build a composite key from parts: `repeatableId[key].fieldId`
 */
export function buildCompositeKey(repeatableId: string, itemKey: string, fieldId: string): string {
  return `${repeatableId}[${itemKey}].${fieldId}`;
}

/**
 * Parse a composite key into its parts.
 * Returns null if the key is not a composite key.
 */
export function parseCompositeKey(
  key: string
): { repeatableId: string; itemKey: string; fieldId: string } | null {
  const match = COMPOSITE_KEY_REGEX.exec(key);
  if (!match) return null;
  return {
    repeatableId: match[1],
    itemKey: match[2],
    fieldId: match[3],
  };
}

// =================================================================
// STRUCTURE: flat store → nested data (for onSubmit)
// =================================================================

/**
 * Converts flat store values with composite keys into structured nested data.
 *
 * Input (store values):
 *   { customerName: "John", "items[k0].name": "Widget", "items[k0].qty": 2, "items[k1].name": "Gadget", "items[k1].qty": 1 }
 *
 * Output (structured):
 *   { customerName: "John", items: [{ name: "Widget", qty: 2 }, { name: "Gadget", qty: 1 }] }
 */
export function structureFormValues(
  values: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig>,
  repeatableOrder: Record<string, string[]>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const processedKeys = new Set<string>();

  // Build structured arrays for every configured repeatable. A repeatable with
  // no active rows (absent from `repeatableOrder`) still submits as an empty
  // array — never `undefined` — so consumers get a stable array shape.
  for (const [repeatableId, config] of Object.entries(repeatableConfigs)) {
    // Own-property only: a repeatable id of `toString` would otherwise resolve
    // an inherited method here and blow up on iteration.
    const keys = getOwn(repeatableOrder, repeatableId) ?? [];
    const items: Record<string, unknown>[] = [];

    const itemByKey = new Map<string, Record<string, unknown>>();

    for (const itemKey of keys) {
      const item: Record<string, unknown> = {};

      // Template fields first (preserve declaration order)
      for (const templateField of config.allFields) {
        const compositeKey = buildCompositeKey(repeatableId, itemKey, templateField.id);
        if (hasOwn(values, compositeKey)) {
          // `defineOwn`: a template field named `__proto__` must land as a real
          // key of the submitted row, not be swallowed by the accessor.
          defineOwn(item, templateField.id, getOwn(values, compositeKey));
          processedKeys.add(compositeKey);
        }
      }

      itemByKey.set(itemKey, item);
      items.push(item);
    }

    // Round-trip fidelity: carry over any non-template stored keys for each active
    // item so backend-provided extra fields are not silently dropped on submit.
    for (const [key, value] of Object.entries(values)) {
      if (processedKeys.has(key)) continue;
      const parsed = parseCompositeKey(key);
      if (!parsed || parsed.repeatableId !== repeatableId) continue;
      const item = itemByKey.get(parsed.itemKey);
      if (!item) continue; // orphan key (not in active order) — skip
      // Own-property only — `in` is prototype-inclusive, so a row field named
      // `toString` would read as "already carried" and be dropped.
      if (!hasOwn(item, parsed.fieldId)) {
        defineOwn(item, parsed.fieldId, value);
      }
      processedKeys.add(key);
    }

    // `defineOwn`: a repeatable named `__proto__` would otherwise have its whole
    // array grafted onto `result`'s prototype — the rows render, the user fills
    // them in, and the submitted payload silently omits the key entirely.
    defineOwn(result, repeatableId, items);
  }

  // Copy non-composite values directly
  for (const [key, value] of Object.entries(values)) {
    if (!processedKeys.has(key) && !parseCompositeKey(key)) {
      defineOwn(result, key, value);
    }
  }

  return result;
}

// =================================================================
// FLATTEN: nested data → flat store (for defaultValues)
// =================================================================

/**
 * Converts structured nested data into flat store values with composite keys.
 *
 * Input (structured):
 *   { customerName: "John", items: [{ name: "Widget", qty: 2 }, { name: "Gadget", qty: 1 }] }
 *
 * Output:
 *   {
 *     values: { customerName: "John", "items[k0].name": "Widget", "items[k0].qty": 2, "items[k1].name": "Gadget", "items[k1].qty": 1 },
 *     order: { items: ["k0", "k1"] },
 *     nextKeys: { items: 2 }
 *   }
 */
export function flattenRepeatableValues(
  data: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig>
): {
  values: Record<string, unknown>;
  order: Record<string, string[]>;
  nextKeys: Record<string, number>;
} {
  const values: Record<string, unknown> = {};
  const order: Record<string, string[]> = {};
  const nextKeys: Record<string, number> = {};

  for (const [key, value] of Object.entries(data)) {
    // Own-property only: a plain field named `toString` holding an array must
    // not be mistaken for a configured repeatable.
    if (getOwn(repeatableConfigs, key) && Array.isArray(value)) {
      // This is a repeatable field — flatten the array
      const keys: string[] = [];
      let keyCounter = 0;

      for (const rawItem of value) {
        const itemKey = `k${keyCounter}`;
        keys.push(itemKey);

        // Degrade gracefully: null / non-object rows (e.g. a null entry from
        // backend JSON) contribute no field values instead of throwing.
        const item =
          rawItem !== null && typeof rawItem === 'object' && !Array.isArray(rawItem)
            ? (rawItem as Record<string, unknown>)
            : {};

        for (const [fieldId, fieldValue] of Object.entries(item)) {
          defineOwn(values, buildCompositeKey(key, itemKey, fieldId), fieldValue);
        }

        keyCounter++;
      }

      defineOwn(order as Record<string, unknown>, key, keys);
      defineOwn(nextKeys as Record<string, unknown>, key, keyCounter);
    } else {
      // Regular field — pass through
      defineOwn(values, key, value);
    }
  }

  return { values, order, nextKeys };
}

// =================================================================
// INITIALIZE / RECONSTRUCT: repeatable order + next-key from values
// =================================================================

/**
 * Collect the ordered item keys already present in flat store values for a
 * given repeatable, plus the next free numeric key.
 */
function collectItemKeysFromFlat(
  values: Record<string, unknown>,
  repeatableId: string
): { keys: string[]; nextKey: number } {
  const seen = new Set<string>();
  const keys: string[] = [];
  let maxIndex = -1;

  for (const key of Object.keys(values)) {
    const parsed = parseCompositeKey(key);
    if (!parsed || parsed.repeatableId !== repeatableId) continue;

    if (!seen.has(parsed.itemKey)) {
      seen.add(parsed.itemKey);
      keys.push(parsed.itemKey);
    }

    const match = /^k(\d+)$/.exec(parsed.itemKey);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  }

  return { keys, nextKey: maxIndex + 1 };
}

/**
 * Build the initial repeatable state (values + order + next-keys) from raw
 * default/reset values. This is the single source of truth used by both the
 * FormProvider (mount / id-change) and the store `_reset` action.
 *
 * Handling, per repeatable:
 *  - If the raw values contain a nested array (e.g. `{ items: [{...}] }`), it is
 *    flattened into composite keys and its order is taken from the array.
 *  - Otherwise the order is reconstructed from any composite keys already
 *    present in the flat values (the reset case, where values are already flat).
 *  - The result is padded up to the repeatable's `min` with default rows.
 *  - When an `explicitOrder` is supplied for a repeatable, it wins over the
 *    reconstruction: the rows resolved above are re-sequenced to match it.
 *    Reconstruction can only ever recover the INSERTION order of the flat keys,
 *    so a user reorder is invisible to it — a host that captured the live order
 *    (e.g. a workflow mirroring a step) must be able to hand it back.
 */
export function initializeRepeatableState(
  rawValues: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig>,
  explicitOrder?: Record<string, string[]>
): {
  values: Record<string, unknown>;
  order: Record<string, string[]>;
  nextKeys: Record<string, number>;
} {
  // Step 1 — flatten any nested repeatable arrays.
  const hasArrayDefaults = Object.keys(repeatableConfigs).some((id) =>
    Array.isArray(getOwn(rawValues, id))
  );

  let values: Record<string, unknown>;
  const order: Record<string, string[]> = {};
  const nextKeys: Record<string, number> = {};

  if (hasArrayDefaults) {
    const flattened = flattenRepeatableValues(rawValues, repeatableConfigs);
    values = flattened.values;
    // `Object.assign` copies with [[Set]] semantics, which would launder the
    // `defineOwn` work `flattenRepeatableValues` just did: a `__proto__`
    // repeatable's order would be grafted as this object's PROTOTYPE and lost.
    // Re-define each entry as a real own property instead.
    for (const [id, keys] of Object.entries(flattened.order)) {
      defineOwn(order as Record<string, unknown>, id, keys);
    }
    for (const [id, nextKey] of Object.entries(flattened.nextKeys)) {
      defineOwn(nextKeys as Record<string, unknown>, id, nextKey);
    }
  } else {
    values = { ...rawValues };
  }

  // Step 2 — resolve each repeatable's rows, then pad to `min` only when the
  // caller supplied no explicit items.
  for (const [id, config] of Object.entries(repeatableConfigs)) {
    // A flattened array default (even an empty `[]`) counts as an explicit
    // source: the key is present on `order` after Step 1.
    const fromArray = hasOwn(order, id);

    let keys: string[];
    let nextKey: number;
    if (fromArray) {
      keys = getOwn(order, id) as string[];
      nextKey = getOwn(nextKeys, id) ?? keys.length;
    } else {
      const reconstructed = collectItemKeysFromFlat(values, id);
      keys = reconstructed.keys;
      nextKey = reconstructed.nextKey;
    }

    // Re-sequence to the caller-supplied order. Only keys that actually resolved
    // above may survive — a captured order naming a row whose values are gone
    // (the user deleted it) must not resurrect it — and any row the order does
    // not mention keeps its resolved position at the end.
    const capturedOrder = explicitOrder ? getOwn(explicitOrder, id) : undefined;
    if (capturedOrder) {
      const resolved = new Set(keys);
      const mentioned = new Set(capturedOrder);
      keys = [
        ...capturedOrder.filter((key) => resolved.has(key)),
        ...keys.filter((key) => !mentioned.has(key)),
      ];
    }

    // Pad up to `min` ONLY when no explicit items were provided. A repeatable
    // given an explicit (possibly shorter) set of rows keeps exactly those rows,
    // so min-count validation can flag the shortfall — we never silently top it
    // up to satisfy `min`.
    const hasExplicitItems = fromArray || keys.length > 0;
    if (!hasExplicitItems) {
      const minItems = config.min ?? 0;
      while (keys.length < minItems) {
        const itemKey = `k${nextKey}`;
        keys = [...keys, itemKey];

        for (const field of config.allFields) {
          values[buildCompositeKey(id, itemKey, field.id)] =
            config.defaultValue?.[field.id] ?? undefined;
        }

        nextKey++;
      }
    }

    // A repeatable that resolves to zero rows produces no order/next-key entry:
    // it must not surface in `_repeatableOrder`, `_repeatableNextKey`, or the
    // structured output.
    if (keys.length > 0) {
      // `defineOwn`, not a plain write: a `__proto__` repeatable's rows would
      // otherwise be swallowed by Object.prototype's accessor and never render.
      defineOwn(order as Record<string, unknown>, id, keys);
      defineOwn(nextKeys as Record<string, unknown>, id, nextKey);
    } else {
      delete order[id];
      delete nextKeys[id];
    }
  }

  return { values, order, nextKeys };
}
