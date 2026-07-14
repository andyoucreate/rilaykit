import type { RepeatableFieldItem } from '@rilaykit/core';
import { NotFoundError } from '@rilaykit/core';
import React from 'react';
import { useRepeatableField } from '../hooks/use-repeatable-field';
import { useFormConfigContext } from './FormProvider';
import { FormListItem } from './FormListItem';

export interface FormListContext {
  items: RepeatableFieldItem[];
  add: () => void;
  remove: (key: string) => void;
  move: (from: number, to: number) => void;
  canAdd: boolean;
  canRemove: boolean;
}

export interface FormListProps {
  id: string;
  children?: (ctx: FormListContext) => React.ReactNode;
  className?: string;
}

export const FormList = React.memo(function FormList({ id, children, className }: FormListProps) {
  const { formConfig } = useFormConfigContext();
  const repeatable = formConfig.repeatableFields?.[id];
  if (!repeatable) {
    throw new NotFoundError(`Repeatable "${id}" not found in form "${formConfig.id}"`, { key: id });
  }

  const { items, append, remove, move, canAdd, canRemove } = useRepeatableField(id);

  if (children) {
    return <>{children({ items, add: () => append(), remove, move, canAdd, canRemove })}</>;
  }

  return (
    <div className={className} data-form-list={id}>
      {items.map((item) => (
        <FormListItem key={item.key} item={item} />
      ))}
      {canAdd && (
        <button type="button" onClick={() => append()} data-form-list-add={id}>
          Add
        </button>
      )}
    </div>
  );
});

export default FormList;
