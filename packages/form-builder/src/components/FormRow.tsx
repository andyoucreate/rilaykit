import type { FormFieldRow, FormRowRendererProps } from '@streamline/core';
import FormField from './FormField';
import { useFormContext } from './FormProvider';

export interface FormRowProps {
  row: FormFieldRow;
  className?: string;
}

export function FormRow({ row, className }: FormRowProps) {
  const { formConfig } = useFormContext();

  const rowRenderer = formConfig.renderConfig?.rowRenderer;

  if (!rowRenderer) {
    throw new Error(
      `No rowRenderer configured for form "${formConfig.id}". Please configure a rowRenderer using config.setRowRenderer() or config.setFormRenderConfig().`
    );
  }

  // Create FormField components for each field in the row
  const fieldComponents = row.fields.map((field) => (
    <FormField key={field.id} fieldId={field.id} />
  ));

  // Use FormRowRenderer with the field components as children
  const rowProps: FormRowRendererProps = {
    row,
    children: fieldComponents,
    className,
    spacing: row.spacing,
    alignment: row.alignment,
  };

  return rowRenderer(rowProps);
}

export default FormRow;
