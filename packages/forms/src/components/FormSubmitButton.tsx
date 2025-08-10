import type { ComponentRendererBaseProps, FormSubmitButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { useFormContext } from './FormProvider';

export interface FormSubmitButtonProps
  extends ComponentRendererBaseProps<FormSubmitButtonRendererProps> {
  /**
   * Override the isSubmitting state from form context
   * If provided, this value will be used instead of the form's isSubmitting state
   */
  isSubmitting?: boolean;
}

export const FormSubmitButton = React.memo(function FormSubmitButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: FormSubmitButtonProps) {
  const { formState, submit, formConfig } = useFormContext();

  // Memoize base props to avoid recreating object
  const baseProps: FormSubmitButtonRendererProps = useMemo(
    () => ({
      isSubmitting: overrideIsSubmitting ?? formState.isSubmitting,
      onSubmit: submit,
      className,
    }),
    [overrideIsSubmitting, formState.isSubmitting, submit, className]
  );

  return (
    <ComponentRendererWrapper
      name="FormSubmitButton"
      renderer={formConfig.renderConfig?.submitButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
});

export default FormSubmitButton;
