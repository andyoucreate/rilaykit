import type { ComponentRendererBaseProps, FormSubmitButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from './FormProvider';

export interface FormSubmitButtonProps
  extends ComponentRendererBaseProps<FormSubmitButtonRendererProps> {
  /**
   * Override the isSubmitting state from form context
   * If provided, this value will be used instead of the form's isSubmitting state
   */
  isSubmitting?: boolean;
}

export function FormSubmitButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: FormSubmitButtonProps) {
  const { formState, submit, formConfig } = useFormContext();

  const baseProps: FormSubmitButtonRendererProps = {
    isSubmitting: overrideIsSubmitting ?? formState.isSubmitting,
    onSubmit: submit,
    className,
  };

  return (
    <ComponentRendererWrapper
      name="FormSubmitButton"
      renderer={formConfig.renderConfig?.submitButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
}

export default FormSubmitButton;
