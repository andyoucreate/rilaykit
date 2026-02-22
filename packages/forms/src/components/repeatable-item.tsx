import type { RepeatableFieldItem } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { FormField } from './FormField';
import { useFormConfigContext } from './FormProvider';
import FormRow from './FormRow';

// =================================================================
// TYPES
// =================================================================

export interface RepeatableItemProps {
  item: RepeatableFieldItem;
  index: number;
  total: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

// =================================================================
// COMPONENT
// =================================================================

export const RepeatableItem = React.memo(function RepeatableItem({
  item,
  index,
  total,
  canRemove,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RepeatableItemProps) {
  const { formConfig } = useFormConfigContext();

  // Build a fieldConfig lookup map for this item (avoids O(n) lookup in FormField)
  const fieldConfigMap = useMemo(
    () => new Map(item.allFields.map((f) => [f.id, f])),
    [item.allFields]
  );

  // Render rows with scoped field configs
  const renderedRows = useMemo(
    () =>
      item.rows.map((row) => (
        <FormRow key={row.id} row={row}>
          {row.fields.map((field) => (
            <FormField
              key={field.id}
              fieldId={field.id}
              fieldConfig={fieldConfigMap.get(field.id)}
            />
          ))}
        </FormRow>
      )),
    [item.rows, fieldConfigMap]
  );

  // Custom renderer from renderConfig
  const itemRenderer = formConfig.renderConfig?.repeatableItemRenderer;

  if (itemRenderer) {
    return itemRenderer({
      item,
      index,
      total,
      canRemove,
      canMoveUp,
      canMoveDown,
      onRemove,
      onMoveUp,
      onMoveDown,
      children: renderedRows,
    });
  }

  // Default rendering
  return (
    <div data-repeatable-item={item.key} data-repeatable-index={index}>
      {renderedRows}
    </div>
  );
});
