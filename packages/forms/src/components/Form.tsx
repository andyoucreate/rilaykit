import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { type form, resolveFormConfig } from '../builders/form';
import { FormBody } from './FormBody';
import { FormField } from './FormField';
import { FormList } from './FormList';
import { FormProvider, type FormProviderProps } from './FormProvider';
import { FormSubmit } from './FormSubmit';

export interface FormProps extends Omit<FormProviderProps, 'formConfig' | 'defaultValues'> {
  /** Form definition: a built FormConfiguration or a form builder (auto-built). */
  of: FormConfiguration<Record<string, never>> | form<Record<string, never>>;
  defaults?: Record<string, unknown>;
}

function FormRoot({ of, defaults, ...providerProps }: FormProps) {
  const resolvedConfig = useMemo(() => resolveFormConfig(of), [of]);

  return <FormProvider formConfig={resolvedConfig} defaultValues={defaults} {...providerProps} />;
}

export const Form = Object.assign(FormRoot, {
  Body: FormBody,
  Field: FormField,
  Submit: FormSubmit,
  List: FormList,
});

export default Form;
