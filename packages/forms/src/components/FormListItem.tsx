import type { RepeatableFieldItem } from '@rilaykit/core';
import React from 'react';
import { visibleRowFields } from '../utils/visible-row-fields';
import { FormField } from './FormField';
import { useForm } from './FormProvider';

export interface FormListItemProps {
  item: RepeatableFieldItem;
}

/**
 * Internal: renders one repeatable item's rows with composite field ids.
 * Field configs come pre-scoped from useRepeatableField via FormList.
 */
export const FormListItem = React.memo(function FormListItem({ item }: FormListItemProps) {
  const { conditionsHelpers } = useForm();

  return (
    <div data-form-list-item={item.key}>
      {item.rows.map((row) => {
        const visibleFields = visibleRowFields(row, conditionsHelpers);
        if (visibleFields.length === 0) {
          return null;
        }
        return (
          <div key={row.id} data-form-row={row.id}>
            {visibleFields.map((field) => (
              <FormField key={field.id} id={field.id} config={field} />
            ))}
          </div>
        );
      })}
    </div>
  );
});

export default FormListItem;
