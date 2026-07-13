import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { type form, resolveFormConfig } from '../builders/form';
import { FormProvider, type FormProviderProps } from './FormProvider';

export interface FormProps extends Omit<FormProviderProps, 'formConfig' | 'defaultValues'> {
  /** Form definition: a built FormConfiguration or a form builder (auto-built). */
  of: FormConfiguration<Record<string, never>> | form<Record<string, never>>;
  defaults?: Record<string, unknown>;
}

export function Form({ of, defaults, ...providerProps }: FormProps) {
  const resolvedConfig = useMemo(() => resolveFormConfig(of), [of]);

  return <FormProvider formConfig={resolvedConfig} defaultValues={defaults} {...providerProps} />;
}

export default Form;
