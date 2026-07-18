import type {
  FormFieldConfig,
  FormFieldRow,
  RepeatableFieldConfig,
  RepeatableFieldItem,
} from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { useCallback, useMemo, useRef } from 'react';
import { useForm } from '../components/FormProvider';
import { useFormStore, useRepeatableKeys } from '../stores';
import { buildCompositeKey } from '../utils/repeatable-data';
import { scopeConditions } from '../utils/scope-conditions';

// =================================================================
// TYPES
// =================================================================

export interface UseRepeatableFieldReturn {
  /** The resolved repeatable config, or undefined when the id is unknown */
  config: RepeatableFieldConfig | undefined;
  items: RepeatableFieldItem[];
  append: (defaultValue?: Record<string, unknown>) => void;
  remove: (key: string) => void;
  move: (fromIndex: number, toIndex: number) => void;
  canAdd: boolean;
  canRemove: boolean;
  count: number;
}

// =================================================================
// HOOK
// =================================================================

/**
 * Hook to manage a repeatable field group
 *
 * Provides the list of items and actions to add, remove, and reorder them.
 * Each item contains scoped field configs ready for rendering.
 *
 * @param repeatableId - The ID of the repeatable group (as defined in addRepeatable)
 * @returns Items, actions, and constraints
 *
 * @example
 * ```tsx
 * const { items, append, remove, canAdd, canRemove } = useRepeatableField("items");
 *
 * return (
 *   <div>
 *     {items.map(item => (
 *       <div key={item.key}>
 *         {item.allFields.map(field => (
 *           <FormField key={field.id} id={field.id} config={field} />
 *         ))}
 *         {canRemove && <button onClick={() => remove(item.key)}>Remove</button>}
 *       </div>
 *     ))}
 *     {canAdd && <button onClick={append}>Add</button>}
 *   </div>
 * );
 * ```
 */
export function useRepeatableField(repeatableId: string): UseRepeatableFieldReturn {
  const store = useFormStore();
  const { formConfig, validateFormLevel } = useForm();
  const orderedKeys = useRepeatableKeys(repeatableId);

  // Get the repeatable config from the form config
  const repeatableConfig = getOwn(formConfig.repeatableFields, repeatableId);

  // Build set of template field IDs (for condition scoping)
  const templateFieldIds = useMemo(() => {
    if (!repeatableConfig) return new Set<string>();
    return new Set(repeatableConfig.allFields.map((f) => f.id));
  }, [repeatableConfig]);

  // Per-row identity cache: `orderedKeys` is a fresh array on any add/remove/
  // move, so rebuilding every item would give each row's scoped config new
  // identity and break FormListItem/FormField memoization — re-rendering all N
  // rows for a single-row edit. A row whose (key, index) is unchanged (e.g.
  // every surviving row on an APPEND) reuses its cached item, so only the
  // genuinely-changed rows re-render. The cache is tied to the TEMPLATE
  // (`repeatableConfig`): when the template itself changes — a field added or
  // retyped mid-stream — every row's scoped columns change, so the cache is
  // discarded and all rows rebuild. Removed keys drop out of the cache below.
  const itemCacheRef = useRef<{
    template: RepeatableFieldConfig | undefined;
    repeatableId: string;
    items: Map<string, RepeatableFieldItem>;
  }>({ template: undefined, repeatableId, items: new Map() });

  // Derive items from ordered keys + template
  const items = useMemo((): RepeatableFieldItem[] => {
    if (!repeatableConfig) {
      itemCacheRef.current = { template: undefined, repeatableId, items: new Map() };
      return [];
    }

    // Only reuse cached items when the TEMPLATE and the repeatable id are both
    // identical — a changed template invalidates every row's scoped columns, and
    // a changed id changes every scoped composite key.
    const previousCache =
      itemCacheRef.current.template === repeatableConfig &&
      itemCacheRef.current.repeatableId === repeatableId
        ? itemCacheRef.current.items
        : new Map<string, RepeatableFieldItem>();
    const nextCache = new Map<string, RepeatableFieldItem>();

    const result = orderedKeys.map((key, index) => {
      // Reuse a survivor's item verbatim when its position is unchanged — its
      // scoped fields/rows/conditions depend only on (key, index, template).
      const cached = previousCache.get(key);
      if (cached && cached.index === index) {
        nextCache.set(key, cached);
        return cached;
      }
      // Scope fields: prefix IDs with composite key
      const scopedFields: FormFieldConfig[] = repeatableConfig.allFields.map((templateField) => {
        const scopedId = buildCompositeKey(repeatableId, key, templateField.id);
        const scopedConditions = templateField.conditions
          ? scopeConditions(templateField.conditions, repeatableId, key, templateFieldIds)
          : undefined;

        return {
          ...templateField,
          id: scopedId,
          conditions: scopedConditions,
        };
      });

      // Scope rows: update field IDs within rows
      const scopedRows: FormFieldRow[] = repeatableConfig.rows.map((templateRow) => ({
        ...templateRow,
        fields: templateRow.fields.map((templateField) => {
          const scopedId = buildCompositeKey(repeatableId, key, templateField.id);
          const scopedConditions = templateField.conditions
            ? scopeConditions(templateField.conditions, repeatableId, key, templateFieldIds)
            : undefined;

          return {
            ...templateField,
            id: scopedId,
            conditions: scopedConditions,
          };
        }),
      }));

      const item: RepeatableFieldItem = {
        key,
        index,
        rows: scopedRows,
        allFields: scopedFields,
      };
      nextCache.set(key, item);
      return item;
    });

    itemCacheRef.current = { template: repeatableConfig, repeatableId, items: nextCache }; // drops removed keys
    return result;
  }, [repeatableId, orderedKeys, repeatableConfig, templateFieldIds]);

  // Constraints
  const canAdd = useMemo(() => {
    if (!repeatableConfig) return false;
    if (repeatableConfig.max === undefined) return true;
    return orderedKeys.length < repeatableConfig.max;
  }, [repeatableConfig, orderedKeys.length]);

  const canRemove = useMemo(() => {
    if (!repeatableConfig) return false;
    const min = repeatableConfig.min ?? 0;
    return orderedKeys.length > min;
  }, [repeatableConfig, orderedKeys.length]);

  // Stable actions. A structural edit (add / remove / reorder rows) changes the
  // data a cross-field rule sums over, so it re-runs form-level validation — a
  // "totals must equal 100%" banner clears the instant the user fixes it by
  // DELETING a row, not only on the next field event. `validateFormLevel`
  // early-returns when the form declares no form-level rule, so this is a no-op
  // for the common case.
  const append = useCallback(
    (defaultValue?: Record<string, unknown>) => {
      store.getState()._appendRepeatableItem(repeatableId, defaultValue);
      void validateFormLevel();
    },
    [store, repeatableId, validateFormLevel]
  );

  const remove = useCallback(
    (key: string) => {
      store.getState()._removeRepeatableItem(repeatableId, key);
      void validateFormLevel();
    },
    [store, repeatableId, validateFormLevel]
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      store.getState()._moveRepeatableItem(repeatableId, fromIndex, toIndex);
      void validateFormLevel();
    },
    [store, repeatableId, validateFormLevel]
  );

  return {
    config: repeatableConfig,
    items,
    append,
    remove,
    move,
    canAdd,
    canRemove,
    count: orderedKeys.length,
  };
}
