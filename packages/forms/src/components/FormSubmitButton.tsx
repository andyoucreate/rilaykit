import type { ComponentRendererBaseProps, FormSubmitButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from './FormProvider';

export function FormSubmitButton({
  className,
  ...props
}: ComponentRendererBaseProps<FormSubmitButtonRendererProps>) {
  const { formState, submit, formConfig } = useFormContext();

  const baseProps: FormSubmitButtonRendererProps = {
    isSubmitting: formState.isSubmitting,

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
