import type { FormConfiguration } from '@rilaykit/core';
import { useMemo } from 'react';
import { type form, resolveFormConfig } from '../builders/form';
import { FormBody } from './FormBody';
import { FormField } from './FormField';
import { FormList } from './FormList';
import { FormProvider, type FormProviderProps } from './FormProvider';
import { FormSubmit } from './FormSubmit';

export interface FormProps<C extends Record<string, any> = Record<string, never>>
  extends Omit<FormProviderProps, 'formConfig' | 'defaultValues'> {
  /** Form definition: a built FormConfiguration or a form builder (auto-built).
   * Generic over the catalog's component map — `FormConfiguration` embeds a
   * `RilayInstance<C>`, which is invariant in `C`, so a fixed map type would
   * reject every configuration built from a fluently typed catalog. */
  of: FormConfiguration<C> | form<C>;
  defaults?: Record<string, unknown>;
}

function FormRoot<C extends Record<string, any>>({ of, defaults, ...providerProps }: FormProps<C>) {
  const resolvedConfig = useMemo(() => resolveFormConfig(of), [of]);

  return (
    <FormProvider
      // The provider only performs C-independent reads (lookups, validation
      // by id), and generics are erased at runtime — widening is safe here.
      formConfig={resolvedConfig as unknown as FormConfiguration}
      defaultValues={defaults}
      {...providerProps}
    />
  );
}

export const Form = Object.assign(FormRoot, {
  Body: FormBody,
  Field: FormField,
  Submit: FormSubmit,
  List: FormList,
});

export default Form;
