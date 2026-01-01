import type {
  ComponentRendererBaseProps,
  FormFieldRow,
  FormRowRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { FormField } from './FormField';
import { useFormConfigContext } from './FormProvider';

export interface FormRowProps extends ComponentRendererBaseProps<FormRowRendererProps> {
  row: FormFieldRow;
}

export const FormRow = React.memo(function FormRow({ row, className, ...props }: FormRowProps) {
  const { formConfig, conditionsHelpers } = useFormConfigContext();

  // Filter visible fields BEFORE creating components to avoid empty wrapper divs
  const visibleFields = useMemo(
    () => row.fields.filter((field) => conditionsHelpers.isFieldVisible(field.id)),
    [row.fields, conditionsHelpers]
  );

  // Memoize FormField components only for visible fields
  const defaultFieldComponents = useMemo(
    () => visibleFields.map((field) => <FormField key={field.id} fieldId={field.id} />),
    [visibleFields]
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

  // Early return AFTER all hooks - prevents empty wrapper div and CSS gaps
  if (visibleFields.length === 0) {
    return null;
  }

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
