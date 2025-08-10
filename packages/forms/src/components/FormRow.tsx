import type {
  ComponentRendererBaseProps,
  FormFieldRow,
  FormRowRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { FormField } from './FormField';
import { useFormContext } from './FormProvider';

export interface FormRowProps extends ComponentRendererBaseProps<FormRowRendererProps> {
  row: FormFieldRow;
}

export const FormRow = React.memo(function FormRow({ row, className, ...props }: FormRowProps) {
  const { formConfig } = useFormContext();

  // Memoize FormField components for each field in the row (default children)
  const defaultFieldComponents = useMemo(
    () => row.fields.map((field) => <FormField key={field.id} fieldId={field.id} />),
    [row.fields]
  );

  // Memoize base props to avoid recreating object
  const baseProps: FormRowRendererProps = useMemo(
    () => ({
      row,
      children: defaultFieldComponents,
      className,
    }),
    [row, defaultFieldComponents, className]
  );

  return (
    <ComponentRendererWrapper
      name="FormRow"
      renderer={formConfig.renderConfig?.rowRenderer}
      props={baseProps}
      {...props}
    >
      {defaultFieldComponents}
    </ComponentRendererWrapper>
  );
});

export default FormRow;
