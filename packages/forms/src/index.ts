'use client';

export { Form } from './components/Form';
export type { FormProps } from './components/Form';
export { FormBody } from './components/FormBody';
export type { FormBodyProps } from './components/FormBody';
export { FormField } from './components/FormField';
export type { FormFieldProps } from './components/FormField';
export { FormSubmit } from './components/FormSubmit';
export type { FormSubmitProps } from './components/FormSubmit';
export { FormList } from './components/FormList';
export type { FormListContext, FormListProps } from './components/FormList';
export { FormProvider, useForm } from './components/FormProvider';
export type { FormConfigContextValue, FormProviderProps } from './components/FormProvider';

export { form as FormBuilder, form, resolveFormConfig } from './builders/form';
export type { FieldConfig } from './builders/form';
export { RepeatableBuilder } from './builders/repeatable-builder';

export * from './stores';
export * from './hooks';
export type { ConditionEvaluationResult } from './hooks/useConditionEvaluation';
export {
  structureFormValues,
  flattenRepeatableValues,
  buildCompositeKey,
  parseCompositeKey,
} from './utils/repeatable-data';
export {
  evaluateConditionLive,
  isFieldVisibleInData,
  isRepeatableVisible,
  pickVisibleSubmitValues,
  resolveFieldConditionalBehavior,
} from './utils/submit-visibility';
export type { VisibleSubmitValues } from './utils/submit-visibility';
export * from './schema';
