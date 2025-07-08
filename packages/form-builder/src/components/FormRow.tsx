import type { FormFieldRow, FormRowRendererProps, RendererChildrenFunction } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import FormField from './FormField';
import { useFormContext } from './FormProvider';

export interface FormRowProps {
  row: FormFieldRow;
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<FormRowRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function FormRow({ row, className, children, renderAs }: FormRowProps) {
  const { formConfig } = useFormContext();

  // Create FormField components for each field in the row (default children)
  const defaultFieldComponents = row.fields.map((field) => (
    <FormField key={field.id} fieldId={field.id} />
  ));

  // If renderAs is 'children' or true, use children as renderer
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        'When renderAs="children" is used, children must be a function that returns React elements'
      );
    }
    const baseProps = {
      row,
      children: defaultFieldComponents, // Always React.ReactNode for renderer props
      className,
      spacing: row.spacing,
      alignment: row.alignment,
    };
    return children(baseProps);
  }

  // Default behavior: use configured renderer
  const rowRenderer = formConfig.renderConfig?.rowRenderer;

  if (!rowRenderer) {
    throw new Error(
      `No rowRenderer configured for form "${formConfig.id}". Please configure a rowRenderer using config.setRowRenderer() or config.setFormRenderConfig().`
    );
  }

  const baseProps = {
    row,
    children: defaultFieldComponents, // Default children for props
    className,
    spacing: row.spacing,
    alignment: row.alignment,
  };

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const rowProps: FormRowRendererProps = {
    ...baseProps,
    children: resolvedChildren || defaultFieldComponents, // Always React.ReactNode
  };

  return rowRenderer(rowProps);
}

export default FormRow;
