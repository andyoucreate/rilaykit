import type { FormConfiguration, ValidationError, ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import {
  type ConditionEvaluationResult,
  type FormState,
  type UseFormConditionsReturn,
  useFormConditions,
  useFormState,
  useFormSubmission,
  useFormValidation,
} from '../hooks';

export interface FormContextValue {
  formState: FormState;
  formConfig: FormConfiguration;
  fieldConditions: Record<string, ConditionEvaluationResult>;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  setValue: (fieldId: string, value: any) => void;
  setFieldTouched: (fieldId: string, touched?: boolean) => void;
  validateField: (fieldId: string, value?: any) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  isFormValid: () => boolean;
  reset: (values?: Record<string, any>) => void;
  submit: (event?: React.FormEvent) => Promise<boolean>;
  setError: (fieldId: string, errors: ValidationError[]) => void;
  clearError: (fieldId: string) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export interface FormProviderProps {
  children: React.ReactNode;
  formConfig: FormConfiguration;
  defaultValues?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: any, formData: Record<string, any>) => void;
  className?: string;
}

export function FormProvider({
  children,
  formConfig,
  defaultValues = {},
  onSubmit,
  onFieldChange,
  className,
}: FormProviderProps) {
  // Use refs to track previous values for change detection
  const prevFormId = useRef(formConfig.id);

  // Initialize form state management with custom hook
  const {
    formState,
    setValue,
    setFieldTouched,
    reset,
    setError,
    clearError,
    setFieldValidationState,
    setSubmitting,
    isFormValid,
  } = useFormState({ defaultValues, onFieldChange });

  // Evaluate conditions using specialized hook
  const {
    fieldConditions,
    hasConditionalFields,
    getFieldCondition,
    isFieldVisible,
    isFieldDisabled,
    isFieldRequired,
    isFieldReadonly,
  } = useFormConditions({
    formConfig,
    formValues: formState.values,
  });

  // Group condition helpers for easy access
  const conditionsHelpers = useMemo(
    () => ({
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    }),
    [
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    ]
  );

  // Initialize form validation with custom hook
  const { validateField, validateForm } = useFormValidation({
    formConfig,
    formState,
    conditionsHelpers,
    setFieldValidationState,
    setError,
  });

  // Initialize form submission with custom hook
  const { submit } = useFormSubmission({
    formState,
    onSubmit,
    validateForm,
    setSubmitting,
  });

  // Simple: Only reset on component mount or when form ID changes (new form)
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    // Only reset if this is a completely new form
    if (prevFormId.current === null || formConfig.id !== prevFormId.current) {
      prevFormId.current = formConfig.id;

      reset(defaultValues);
    }
  }, [formConfig.id, reset]);

  // Memoize formConfig reference to avoid unnecessary recalculations
  const memoizedFormConfig = useMemo(() => formConfig, [formConfig]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: FormContextValue = useMemo(
    () => ({
      formState,
      formConfig: memoizedFormConfig,
      fieldConditions,
      conditionsHelpers,
      setValue,
      setFieldTouched,
      validateField,
      validateForm,
      isFormValid,
      reset,
      submit,
      setError,
      clearError,
    }),
    [
      formState,
      memoizedFormConfig,
      fieldConditions,
      conditionsHelpers,
      setValue,
      setFieldTouched,
      validateField,
      validateForm,
      isFormValid,
      reset,
      submit,
      setError,
      clearError,
    ]
  );

  return (
    <FormContext.Provider value={contextValue}>
      <form onSubmit={submit} className={className} noValidate>
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}
