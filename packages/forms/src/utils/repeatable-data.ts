import type { RepeatableFieldConfig } from '@rilaykit/core';

// =================================================================
// COMPOSITE KEY HELPERS
// =================================================================

/**
 * Regex to parse composite keys: `repeatableId[key].fieldId`
 */
const COMPOSITE_KEY_REGEX = /^([^[\]]+)\[([^\]]+)\]\.(.+)$/;

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
    const keys = repeatableOrder[repeatableId] ?? [];
    const items: Record<string, unknown>[] = [];

    const itemByKey = new Map<string, Record<string, unknown>>();

    for (const itemKey of keys) {
      const item: Record<string, unknown> = {};

      // Template fields first (preserve declaration order)
      for (const templateField of config.allFields) {
        const compositeKey = buildCompositeKey(repeatableId, itemKey, templateField.id);
        if (compositeKey in values) {
          item[templateField.id] = values[compositeKey];
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
      if (!(parsed.fieldId in item)) {
        item[parsed.fieldId] = value;
      }
      processedKeys.add(key);
    }

    result[repeatableId] = items;
  }

  // Copy non-composite values directly
  for (const [key, value] of Object.entries(values)) {
    if (!processedKeys.has(key) && !parseCompositeKey(key)) {
      result[key] = value;
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
    if (repeatableConfigs[key] && Array.isArray(value)) {
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
          values[buildCompositeKey(key, itemKey, fieldId)] = fieldValue;
        }

        keyCounter++;
      }

      order[key] = keys;
      nextKeys[key] = keyCounter;
    } else {
      // Regular field — pass through
      values[key] = value;
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
 */
export function initializeRepeatableState(
  rawValues: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig>
): {
  values: Record<string, unknown>;
  order: Record<string, string[]>;
  nextKeys: Record<string, number>;
} {
  // Step 1 — flatten any nested repeatable arrays.
  const hasArrayDefaults = Object.keys(repeatableConfigs).some((id) =>
    Array.isArray(rawValues[id])
  );

  let values: Record<string, unknown>;
  const order: Record<string, string[]> = {};
  const nextKeys: Record<string, number> = {};

  if (hasArrayDefaults) {
    const flattened = flattenRepeatableValues(rawValues, repeatableConfigs);
    values = flattened.values;
    Object.assign(order, flattened.order);
    Object.assign(nextKeys, flattened.nextKeys);
  } else {
    values = { ...rawValues };
  }

  // Step 2 — resolve each repeatable's rows, then pad to `min` only when the
  // caller supplied no explicit items.
  for (const [id, config] of Object.entries(repeatableConfigs)) {
    // A flattened array default (even an empty `[]`) counts as an explicit
    // source: the key is present on `order` after Step 1.
    const fromArray = Object.prototype.hasOwnProperty.call(order, id);

    let keys: string[];
    let nextKey: number;
    if (fromArray) {
      keys = order[id];
      nextKey = nextKeys[id] ?? keys.length;
    } else {
      const reconstructed = collectItemKeysFromFlat(values, id);
      keys = reconstructed.keys;
      nextKey = reconstructed.nextKey;
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
      order[id] = keys;
      nextKeys[id] = nextKey;
    } else {
      delete order[id];
      delete nextKeys[id];
    }
  }

  return { values, order, nextKeys };
}
