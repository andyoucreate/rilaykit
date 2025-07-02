import type { FormSubmitButtonRendererProps } from '@rilaykit/core';
import type React from 'react';
import { useFormContext } from './FormProvider';

export interface FormSubmitButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function FormSubmitButton({ className, children }: FormSubmitButtonProps) {
  const { formState, submit, formConfig } = useFormContext();

  const renderer = formConfig.renderConfig?.submitButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No submitButtonRenderer configured for form "${formConfig.id}". Please configure a submitButtonRenderer using config.setSubmitButtonRenderer() or config.setFormRenderConfig().`
    );
  }

  const props: FormSubmitButtonRendererProps = {
    isSubmitting: formState.isSubmitting,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    onSubmit: submit,
    className,
    children,
  };

  return renderer(props);
}

export default FormSubmitButton;
