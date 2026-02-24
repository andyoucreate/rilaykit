import type {
  FieldConditions,
  FormConfiguration,
  SubmitOptions,
  ValidationResult,
} from '@rilaykit/core';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type UseFormConditionsReturn, useFormConditions } from '../hooks';
import { useFormSubmissionWithStore } from '../hooks/useFormSubmissionWithStore';
import { useFormValidationWithStore } from '../hooks/useFormValidationWithStore';
import { FormStoreContext, createFormStore } from '../stores';
import { buildCompositeKey, flattenRepeatableValues } from '../utils/repeatable-data';

// =================================================================
// FORM CONFIG CONTEXT
// =================================================================

export interface FormConfigContextValue {
  formConfig: FormConfiguration;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  validateField: (fieldId: string, value?: unknown) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  submit: (eventOrOptions?: React.FormEvent | SubmitOptions) => Promise<boolean>;
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
  // Synchronously initialize repeatable configs and default values
  const [store] = useState(() => {
    const repeatableConfigs = formConfig.repeatableFields ?? {};
    let initialValues = { ...defaultValues };
    let initialOrder: Record<string, string[]> = {};
    let initialNextKeys: Record<string, number> = {};

    // If defaultValues contain arrays for repeatables, flatten them
    const hasRepeatableDefaults = Object.keys(repeatableConfigs).some((id) =>
      Array.isArray(defaultValues[id])
    );

    if (hasRepeatableDefaults) {
      const flattened = flattenRepeatableValues(defaultValues, repeatableConfigs);
      initialValues = flattened.values;
      initialOrder = flattened.order;
      initialNextKeys = flattened.nextKeys;
    }

    // For repeatables without default arrays, create min items
    for (const [id, config] of Object.entries(repeatableConfigs)) {
      if (!initialOrder[id]) {
        const minItems = config.min ?? 0;
        const keys: string[] = [];
        let keyCounter = initialNextKeys[id] ?? 0;

        for (let i = 0; i < minItems; i++) {
          const itemKey = `k${keyCounter}`;
          keys.push(itemKey);

          for (const field of config.allFields) {
            const compositeKey = buildCompositeKey(id, itemKey, field.id);
            initialValues[compositeKey] = config.defaultValue?.[field.id] ?? undefined;
          }

          keyCounter++;
        }

        initialOrder[id] = keys;
        initialNextKeys[id] = keyCounter;
      }
    }

    const s = createFormStore(initialValues);

    // Set repeatable configs and order synchronously
    const state = s.getState();
    for (const [id, config] of Object.entries(repeatableConfigs)) {
      state._setRepeatableConfig(id, config);
    }
    s.setState({
      _repeatableOrder: initialOrder,
      _repeatableNextKey: initialNextKeys,
    });

    return s;
  });

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

  // Reset when form ID changes — reinitialize repeatable configs and min items
  useEffect(() => {
    if (prevFormIdRef.current !== formConfig.id) {
      prevFormIdRef.current = formConfig.id;

      const repeatableConfigs = formConfig.repeatableFields ?? {};
      let resetValues = { ...defaultValues };
      let initialOrder: Record<string, string[]> = {};
      let initialNextKeys: Record<string, number> = {};

      // Flatten default arrays for repeatables
      const hasRepeatableDefaults = Object.keys(repeatableConfigs).some((id) =>
        Array.isArray(defaultValues[id])
      );

      if (hasRepeatableDefaults) {
        const flattened = flattenRepeatableValues(defaultValues, repeatableConfigs);
        resetValues = flattened.values;
        initialOrder = flattened.order;
        initialNextKeys = flattened.nextKeys;
      }

      // Create min items for repeatables without defaults
      for (const [id, config] of Object.entries(repeatableConfigs)) {
        if (!initialOrder[id]) {
          const minItems = config.min ?? 0;
          const keys: string[] = [];
          let keyCounter = initialNextKeys[id] ?? 0;

          for (let i = 0; i < minItems; i++) {
            const itemKey = `k${keyCounter}`;
            keys.push(itemKey);

            for (const field of config.allFields) {
              const compositeKey = buildCompositeKey(id, itemKey, field.id);
              resetValues[compositeKey] = config.defaultValue?.[field.id] ?? undefined;
            }

            keyCounter++;
          }

          initialOrder[id] = keys;
          initialNextKeys[id] = keyCounter;
        }
      }

      // Reset with computed values
      store.getState()._reset(resetValues);

      // Re-set repeatable configs and order
      const state = store.getState();
      for (const [id, config] of Object.entries(repeatableConfigs)) {
        state._setRepeatableConfig(id, config);
      }
      store.setState({
        _repeatableOrder: initialOrder,
        _repeatableNextKey: initialNextKeys,
      });
    }
  }, [formConfig.id, formConfig.repeatableFields, store, defaultValues]);

  // Subscribe to form values for reactive conditions evaluation
  const [formValues, setFormValues] = useState(() => store.getState().values);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values) => setFormValues(values)
    );
    return unsubscribe;
  }, [store]);

  // Subscribe to repeatable order for reactive conditions evaluation
  const [repeatableOrder, setRepeatableOrder] = useState(() => store.getState()._repeatableOrder);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state._repeatableOrder,
      (order) => setRepeatableOrder(order)
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
    repeatableOrder,
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
    defaultSubmitOptions: formConfig.submitOptions,
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
