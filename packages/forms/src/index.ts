// Export all form builder components
export { Form } from './components/Form';
export { FormBody } from './components/FormBody';
export { FormField } from './components/FormField';
export { FormProvider, useFormContext } from './components/FormProvider';
export { FormRow } from './components/FormRow';
export { FormSubmitButton } from './components/FormSubmitButton';

// Export form builder and ensure prototype extension is applied
export { createForm, form, form as FormBuilder } from './builders/form';
export type { FieldConfig } from './builders/form';

// Import the form module to ensure prototype extension is applied
import './builders/form';

// Export custom hooks for advanced usage
export * from './hooks';

// Export specific types for condition evaluation
export type { ConditionEvaluationResult } from './hooks/useConditionEvaluation';

// Re-export types and utilities from core
export type * from '@rilaykit/core';

export * from '@rilaykit/core';
