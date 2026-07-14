import type { RepeatableFieldItem } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { FormField } from './FormField';
import { useFormConfigContext } from './FormProvider';

export interface FormListItemProps {
  item: RepeatableFieldItem;
}

/**
 * Internal: renders one repeatable item's rows with composite field ids.
 * Field configs come pre-scoped from useRepeatableField via FormList.
 */
export const FormListItem = React.memo(function FormListItem({ item }: FormListItemProps) {
  const { conditionsHelpers } = useFormConfigContext();

  // Build a fieldConfig lookup map for this item (avoids O(n) lookup in FormField)
  const fieldConfigMap = useMemo(
    () => new Map(item.allFields.map((f) => [f.id, f])),
    [item.allFields]
  );

  return (
    <div data-form-list-item={item.key}>
      {item.rows.map((row) => {
        const visibleFields = row.fields.filter((field) =>
          conditionsHelpers.isFieldVisible(field.id)
        );
        if (visibleFields.length === 0) {
          return null;
        }
        return (
          <div key={row.id} data-form-row={row.id}>
            {visibleFields.map((field) => (
              <FormField key={field.id} id={field.id} config={fieldConfigMap.get(field.id)} />
            ))}
          </div>
        );
      })}
    </div>
  );
});

export default FormListItem;
