import type { FormConfiguration } from '@rilaykit/core';
import { FormProvider } from './FormProvider';

export interface FormProps {
  formConfig: FormConfiguration;
  defaultValues?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: any, formData: Record<string, any>) => void;
  className?: string;
  children: React.ReactNode;
}
export function Form({ formConfig, defaultValues, onSubmit, onFieldChange, children }: FormProps) {
  return (
    <FormProvider
      formConfig={formConfig}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
      className="streamline-form"
    >
      {children}
    </FormProvider>
  );
}

export default Form;
