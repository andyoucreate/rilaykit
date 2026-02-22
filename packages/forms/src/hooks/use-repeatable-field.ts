import type { FormFieldConfig, FormFieldRow, RepeatableFieldItem } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import { useRepeatableKeys, useFormStore } from '../stores';
import { buildCompositeKey } from '../utils/repeatable-data';
import { scopeConditions } from '../utils/scope-conditions';
import { useFormConfigContext } from '../components/FormProvider';

// =================================================================
// TYPES
// =================================================================

export interface UseRepeatableFieldReturn {
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
 *           <FormField key={field.id} fieldId={field.id} fieldConfig={field} />
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
  const { formConfig } = useFormConfigContext();
  const orderedKeys = useRepeatableKeys(repeatableId);

  // Get the repeatable config from the form config
  const repeatableConfig = formConfig.repeatableFields?.[repeatableId];

  // Build set of template field IDs (for condition scoping)
  const templateFieldIds = useMemo(() => {
    if (!repeatableConfig) return new Set<string>();
    return new Set(repeatableConfig.allFields.map((f) => f.id));
  }, [repeatableConfig]);

  // Derive items from ordered keys + template
  const items = useMemo((): RepeatableFieldItem[] => {
    if (!repeatableConfig) return [];

    return orderedKeys.map((key, index) => {
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

      return {
        key,
        index,
        rows: scopedRows,
        allFields: scopedFields,
      };
    });
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

  // Stable actions
  const append = useCallback(
    (defaultValue?: Record<string, unknown>) => {
      store.getState()._appendRepeatableItem(repeatableId, defaultValue);
    },
    [store, repeatableId]
  );

  const remove = useCallback(
    (key: string) => {
      store.getState()._removeRepeatableItem(repeatableId, key);
    },
    [store, repeatableId]
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      store.getState()._moveRepeatableItem(repeatableId, fromIndex, toIndex);
    },
    [store, repeatableId]
  );

  return {
    items,
    append,
    remove,
    move,
    canAdd,
    canRemove,
    count: orderedKeys.length,
  };
}
