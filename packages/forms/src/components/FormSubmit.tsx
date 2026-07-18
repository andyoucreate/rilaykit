import React, { useCallback } from 'react';
import { useFormSubmitting } from '../stores';
import { useForm } from './FormProvider';

export interface FormSubmitProps {
  children?:
    | React.ReactNode
    | ((ctx: { submitting: boolean; submit: () => void }) => React.ReactNode);
  className?: string;
}

export const FormSubmit = React.memo(function FormSubmit({ children, className }: FormSubmitProps) {
  const { submit } = useForm();
  const submitting = useFormSubmitting();
  const handleSubmit = useCallback(() => void submit(), [submit]);

  if (typeof children === 'function') {
    return <>{children({ submitting, submit: handleSubmit })}</>;
  }

  return (
    <button type="submit" className={className} disabled={submitting} data-form-submit>
      {children ?? 'Submit'}
    </button>
  );
});

export default FormSubmit;
