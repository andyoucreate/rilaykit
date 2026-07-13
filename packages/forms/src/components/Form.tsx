import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { form } from '../builders/form';
import { FormProvider } from './FormProvider';

export interface FormProps {
  /** Form definition: a built FormConfiguration or a form builder (auto-built). */
  of: FormConfiguration<Record<string, never>> | form<Record<string, never>>;
  defaults?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void;
  className?: string;
  children: React.ReactNode;
}

export function Form({ of, defaults, onSubmit, onFieldChange, className, children }: FormProps) {
  const resolvedConfig = useMemo(() => (of instanceof form ? of.build() : of), [of]);

  return (
    <FormProvider
      formConfig={resolvedConfig}
      defaultValues={defaults}
      onSubmit={onSubmit}
      onFieldChange={onFieldChange}
      className={className}
    >
      {children}
    </FormProvider>
  );
}

export default Form;
