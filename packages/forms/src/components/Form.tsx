import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { form } from '../builders/form';
import { FormProvider } from './FormProvider';

export interface FormProps {
  formConfig: FormConfiguration<any> | form<any>;
  defaultValues?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: any, formData: Record<string, any>) => void;
  className?: string;
  children: React.ReactNode;
}

export function Form({
  formConfig,
  defaultValues,
  onSubmit,
  onFieldChange,
  className,
  children,
}: FormProps) {
  // Auto-build if it's a form builder
  const resolvedFormConfig = useMemo(() => {
    if (formConfig instanceof form) {
      return formConfig.build();
    }
    return formConfig;
  }, [formConfig]);

  return (
    <FormProvider
      formConfig={resolvedFormConfig}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
      className={className}
    >
      {children}
    </FormProvider>
  );
}

export default Form;
