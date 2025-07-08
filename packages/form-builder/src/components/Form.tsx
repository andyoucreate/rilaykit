import type { FormConfiguration } from '@rilaykit/core';
import { form } from '../builders/form';
import { FormProvider } from './FormProvider';

export interface FormProps {
  formConfig: FormConfiguration | form;
  defaultValues?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: any, formData: Record<string, any>) => void;
  className?: string;
  children: React.ReactNode;
}

export function Form({ formConfig, defaultValues, onSubmit, onFieldChange, children }: FormProps) {
  // Auto-build if it's a form builder
  const resolvedFormConfig = formConfig instanceof form ? formConfig.build() : formConfig;

  return (
    <FormProvider
      formConfig={resolvedFormConfig}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
    >
      {children}
    </FormProvider>
  );
}

export default Form;
