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

  // Build structured arrays from repeatable order
  for (const [repeatableId, keys] of Object.entries(repeatableOrder)) {
    if (!repeatableConfigs[repeatableId]) continue;

    const config = repeatableConfigs[repeatableId];
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
