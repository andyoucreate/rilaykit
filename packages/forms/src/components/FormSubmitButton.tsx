import type { ComponentRendererBaseProps, FormSubmitButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useMemo } from 'react';
import { useFormSubmitState } from '../stores';
import { useFormConfigContext } from './FormProvider';

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
  const { formConfig, submit } = useFormConfigContext();
  const { isSubmitting } = useFormSubmitState();

  // Memoize base props to avoid recreating object
  const baseProps: FormSubmitButtonRendererProps = useMemo(
    () => ({
      isSubmitting: overrideIsSubmitting ?? isSubmitting,
      onSubmit: submit,
      className,
    }),
    [overrideIsSubmitting, isSubmitting, submit, className]
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
