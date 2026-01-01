import type { FieldConditions, FormConfiguration, ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type UseFormConditionsReturn, useFormConditions } from '../hooks';
import { useFormSubmissionWithStore } from '../hooks/useFormSubmissionWithStore';
import { useFormValidationWithStore } from '../hooks/useFormValidationWithStore';
import { FormStoreContext, createFormStore } from '../stores';

// =================================================================
// FORM CONFIG CONTEXT
// =================================================================

export interface FormConfigContextValue {
  formConfig: FormConfiguration;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  validateField: (fieldId: string, value?: unknown) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  submit: (event?: React.FormEvent) => Promise<boolean>;
}

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

/**
 * Access form configuration and validation methods
 */
export function useFormConfigContext(): FormConfigContextValue {
  const context = useContext(FormConfigContext);
  if (!context) {
    throw new Error('useFormConfigContext must be used within a FormProvider');
  }
  return context;
}

// =================================================================
// FORM PROVIDER PROPS
// =================================================================

export interface FormProviderProps {
  children: React.ReactNode;
  formConfig: FormConfiguration;
  defaultValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void;
  className?: string;
}

// =================================================================
// FORM PROVIDER IMPLEMENTATION
// =================================================================

export function FormProvider({
  children,
  formConfig,
  defaultValues = {},
  onSubmit,
  onFieldChange,
  className,
}: FormProviderProps) {
  // Create store once - stable across renders
  const [store] = useState(() => createFormStore(defaultValues));

  // Track form ID changes
  const prevFormIdRef = useRef(formConfig.id);

  // Stable refs for callbacks
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;

  // Subscribe to value changes for onFieldChange callback
  useEffect(() => {
    if (!onFieldChangeRef.current) return;

    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values, prevValues) => {
        // Find which field changed
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            onFieldChangeRef.current?.(fieldId, values[fieldId], values as Record<string, unknown>);
          }
        }
      }
    );

    return unsubscribe;
  }, [store]);

  // Reset when form ID changes
  useEffect(() => {
    if (prevFormIdRef.current !== formConfig.id) {
      prevFormIdRef.current = formConfig.id;
      store.getState()._reset(defaultValues);
    }
  }, [formConfig.id, store, defaultValues]);

  // Subscribe to form values for reactive conditions evaluation
  const [formValues, setFormValues] = useState(() => store.getState().values);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values) => setFormValues(values)
    );
    return unsubscribe;
  }, [store]);

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
    formValues,
  });

  // Sync conditions to store whenever they change
  useEffect(() => {
    for (const [fieldId, condition] of Object.entries(fieldConditions)) {
      const conditions: FieldConditions = {
        visible: condition.visible,
        disabled: condition.disabled,
        required: condition.required,
        readonly: condition.readonly,
      };
      store.getState()._setFieldConditions(fieldId, conditions);
    }
  }, [fieldConditions, store]);

  // Memoize condition helpers
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

  // Initialize validation with store
  const { validateField, validateForm } = useFormValidationWithStore({
    formConfig,
    store,
    conditionsHelpers,
  });

  // Initialize submission with store
  const { submit } = useFormSubmissionWithStore({
    store,
    onSubmit,
    validateForm,
  });

  // Memoize form config context
  const formConfigContextValue = useMemo(
    () => ({
      formConfig,
      conditionsHelpers,
      validateField,
      validateForm,
      submit,
    }),
    [formConfig, conditionsHelpers, validateField, validateForm, submit]
  );

  return (
    <FormStoreContext.Provider value={store}>
      <FormConfigContext.Provider value={formConfigContextValue}>
        <form onSubmit={submit} className={className} noValidate>
          {children}
        </form>
      </FormConfigContext.Provider>
    </FormStoreContext.Provider>
  );
}
