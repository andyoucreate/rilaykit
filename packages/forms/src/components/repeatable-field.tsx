import type { RepeatableFieldConfig } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { useRepeatableField } from '../hooks/use-repeatable-field';
import { useFormConfigContext } from './FormProvider';
import { RepeatableItem } from './repeatable-item';

// =================================================================
// TYPES
// =================================================================

export interface RepeatableFieldProps {
  repeatableId: string;
  repeatableConfig: RepeatableFieldConfig;
  className?: string;
}

// =================================================================
// COMPONENT
// =================================================================

export const RepeatableField = React.memo(function RepeatableField({
  repeatableId,
  repeatableConfig,
  className,
}: RepeatableFieldProps) {
  const { formConfig } = useFormConfigContext();
  const { items, append, remove, move, canAdd, canRemove } = useRepeatableField(repeatableId);

  // Render items
  const renderedItems = useMemo(
    () =>
      items.map((item, index) => (
        <RepeatableItem
          key={item.key}
          item={item}
          index={index}
          total={items.length}
          canRemove={canRemove}
          canMoveUp={index > 0}
          canMoveDown={index < items.length - 1}
          onRemove={() => remove(item.key)}
          onMoveUp={() => move(index, index - 1)}
          onMoveDown={() => move(index, index + 1)}
        />
      )),
    [items, canRemove, remove, move]
  );

  // Custom renderer from renderConfig
  const repeatableRenderer = formConfig.renderConfig?.repeatableRenderer;

  if (repeatableRenderer) {
    return repeatableRenderer({
      repeatableId,
      items,
      canAdd,
      canRemove,
      onAdd: () => append(),
      min: repeatableConfig.min,
      max: repeatableConfig.max,
      children: renderedItems,
    });
  }

  // Default rendering
  return (
    <div className={className} data-repeatable-id={repeatableId}>
      {renderedItems}
      {canAdd && (
        <button type="button" onClick={() => append()} data-repeatable-add={repeatableId}>
          Add
        </button>
      )}
    </div>
  );
});
