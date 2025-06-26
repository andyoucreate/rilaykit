import type { FormBodyRendererProps } from '@streamline/core';
import { useFormContext } from './FormProvider';
import FormRow from './FormRow';

export interface FormBodyProps {
  className?: string;
}

export function FormBody({ className }: FormBodyProps) {
  const { formConfig } = useFormContext();

  const bodyRenderer = formConfig.renderConfig?.bodyRenderer;

  if (!bodyRenderer) {
    throw new Error(
      `No bodyRenderer configured for form "${formConfig.id}". Please configure a bodyRenderer using config.setBodyRenderer() or config.setFormRenderConfig().`
    );
  }

  // Render all rows using FormRow component
  const renderedRows = formConfig.rows.map((row) => <FormRow key={row.id} row={row} />);

  const bodyProps: FormBodyRendererProps = {
    formConfig,
    children: renderedRows,
    className,
  };

  return bodyRenderer(bodyProps);
}

export default FormBody;
