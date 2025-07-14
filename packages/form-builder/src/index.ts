// Export all form builder components
export { Form } from './components/Form';
export { FormBody } from './components/FormBody';
export { FormField } from './components/FormField';
export * from './components/FormProvider';
export { FormProvider, useFormContext } from './components/FormProvider';
export { FormRow } from './components/FormRow';
export { FormSubmitButton } from './components/FormSubmitButton';

// Export form builder and ensure prototype extension is applied
export { createForm, form, form as FormBuilder } from './builders/form';
export type { FieldConfig } from './builders/form';

// Import the form module to ensure prototype extension is applied
import './builders/form';

// Re-export types and utilities from core
export type * from '@rilaykit/core';

export {
  createZodValidator,
  ril,
} from '@rilaykit/core';

// Component types
export type { FormProps } from './components/Form';
export type { FormBodyProps } from './components/FormBody';
export type { FormFieldProps } from './components/FormField';
export type {
  FormContextValue,
  FormProviderProps,
  FormState,
} from './components/FormProvider';
export type { FormRowProps } from './components/FormRow';
export type { FormSubmitButtonProps } from './components/FormSubmitButton';
