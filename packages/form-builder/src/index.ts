// Components
export { Form } from './components/Form';
export { FormBody } from './components/FormBody';
export { FormField } from './components/FormField';
export { FormProvider, useFormContext } from './components/FormProvider';
export { FormRow } from './components/FormRow';
export { FormSubmitButton } from './components/FormSubmitButton';

// Builders
export { FormBuilder } from './builders/FormBuilder';

// Re-export core types for convenience
export type {
  FormBodyRenderer,
  FormBodyRendererProps,
  FormConfiguration,
  FormFieldConfig,
  FormRenderConfig,
  FormRowRenderer,
  FormRowRendererProps,
  FormSubmitButtonRenderer,
  FormSubmitButtonRendererProps,
  StreamlineConfig,
} from '@streamline/core';

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
