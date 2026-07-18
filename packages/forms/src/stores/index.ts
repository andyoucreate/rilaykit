// Vanilla store factory (isomorphic — safe in a server component)
export { createFormStore, type FormStore, type FormStoreState } from './formStore';

// React context + selector/action hooks (client-only — the `'use client'`
// boundary lives in ./formStoreContext)
export {
  // Context
  FormStoreContext,
  useFormStore,
  // Field selectors
  useFieldValue,
  useFieldErrors,
  useFormErrors,
  useFieldTouched,
  useFieldValidationState,
  useFieldConditions,
  useFieldProps,
  useFieldState,
  // Form selectors
  useFormSubmitting,
  useFormValid,
  useFormDirty,
  useFormValues,
  useFormSubmitState,
  // Repeatable selectors
  useRepeatableKeys,
  // Action hooks
  useFieldActions,
  useFormActions,
  useFormStoreApi,
  type UseFieldActionsResult,
  type UseFormActionsResult,
} from './formStoreContext';
