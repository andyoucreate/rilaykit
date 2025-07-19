import type {
  ComponentRendererBaseProps,
  FormFieldRow,
  FormRowRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { FormField } from './FormField';
import { useFormContext } from './FormProvider';

export interface FormRowProps extends ComponentRendererBaseProps<FormRowRendererProps> {
  row: FormFieldRow;
}

export function FormRow({ row, className, ...props }: FormRowProps) {
  const { formConfig } = useFormContext();

  // Create FormField components for each field in the row (default children)
  const defaultFieldComponents = row.fields.map((field) => (
    <FormField key={field.id} fieldId={field.id} />
  ));

  const baseProps: FormRowRendererProps = {
    row,
    children: defaultFieldComponents,
    className,
  };

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
}

export default FormRow;
