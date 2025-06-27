import type { FormConfiguration, ValidationError, ValidationResult } from '@rilay/core';
import type React from 'react';
import { createContext, useCallback, useContext, useReducer, useRef } from 'react';

export interface FormState {
  values: Record<string, any>;
  errors: Record<string, ValidationError[]>;
  warnings: Record<string, ValidationError[]>;
  touched: Set<string>;
  isValidating: Set<string>;
  isDirty: boolean;
  isValid: boolean;
  isSubmitting: boolean;
}

export interface FormContextValue {
  formState: FormState;
  formConfig: FormConfiguration;
  setValue: (fieldId: string, value: any) => void;
  setError: (fieldId: string, errors: ValidationError[]) => void;
  setWarning: (fieldId: string, warnings: ValidationError[]) => void;
  clearError: (fieldId: string) => void;
  clearWarning: (fieldId: string) => void;
  markFieldTouched: (fieldId: string) => void;
  setFieldValidating: (fieldId: string, isValidating: boolean) => void;
  validateField: (fieldId: string, value?: any) => Promise<ValidationResult>;
  validateAllFields: () => Promise<boolean>;
  reset: (values?: Record<string, any>) => void;
  submit: () => Promise<void>;
}

type FormAction =
  | { type: 'SET_VALUE'; fieldId: string; value: any }
  | { type: 'SET_ERROR'; fieldId: string; errors: ValidationError[] }
  | { type: 'SET_WARNING'; fieldId: string; warnings: ValidationError[] }
  | { type: 'CLEAR_ERROR'; fieldId: string }
  | { type: 'CLEAR_WARNING'; fieldId: string }
  | { type: 'MARK_TOUCHED'; fieldId: string }
  | { type: 'SET_VALIDATING'; fieldId: string; isValidating: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'RESET'; values?: Record<string, any> }
  | { type: 'UPDATE_VALIDATION_STATE' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_VALUE': {
      const newValues = { ...state.values, [action.fieldId]: action.value };
      return {
        ...state,
        values: newValues,
        isDirty: true,
      };
    }

    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.fieldId]: action.errors },
        isValid: false,
      };

    case 'SET_WARNING':
      return {
        ...state,
        warnings: { ...state.warnings, [action.fieldId]: action.warnings },
      };

    case 'CLEAR_ERROR': {
      const newErrors = { ...state.errors };
      delete newErrors[action.fieldId];
      return {
        ...state,
        errors: newErrors,
      };
    }

    case 'CLEAR_WARNING': {
      const newWarnings = { ...state.warnings };
      delete newWarnings[action.fieldId];
      return {
        ...state,
        warnings: newWarnings,
      };
    }

    case 'MARK_TOUCHED':
      return {
        ...state,
        touched: new Set([...state.touched, action.fieldId]),
      };

    case 'SET_VALIDATING': {
      const newValidating = new Set(state.isValidating);
      if (action.isValidating) {
        newValidating.add(action.fieldId);
      } else {
        newValidating.delete(action.fieldId);
      }
      return {
        ...state,
        isValidating: newValidating,
      };
    }

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case 'RESET':
      return {
        values: action.values || {},
        errors: {},
        warnings: {},
        touched: new Set(),
        isValidating: new Set(),
        isDirty: false,
        isValid: true,
        isSubmitting: false,
      };

    case 'UPDATE_VALIDATION_STATE': {
      const hasErrors = Object.keys(state.errors).some((key) => state.errors[key].length > 0);
      return {
        ...state,
        isValid: !hasErrors,
      };
    }

    default:
      return state;
  }
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
  console.log(formConfig.renderConfig);
  const initialState: FormState = {
    values: defaultValues,
    errors: {},
    warnings: {},
    touched: new Set(),
    isValidating: new Set(),
    isDirty: false,
    isValid: true,
    isSubmitting: false,
  };

  const [formState, dispatch] = useReducer(formReducer, initialState);

  const validationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const setError = useCallback((fieldId: string, errors: ValidationError[]) => {
    dispatch({ type: 'SET_ERROR', fieldId, errors });
    dispatch({ type: 'UPDATE_VALIDATION_STATE' });
  }, []);

  const setWarning = useCallback((fieldId: string, warnings: ValidationError[]) => {
    dispatch({ type: 'SET_WARNING', fieldId, warnings });
  }, []);

  const clearError = useCallback((fieldId: string) => {
    dispatch({ type: 'CLEAR_ERROR', fieldId });
    dispatch({ type: 'UPDATE_VALIDATION_STATE' });
  }, []);

  const clearWarning = useCallback((fieldId: string) => {
    dispatch({ type: 'CLEAR_WARNING', fieldId });
  }, []);

  const markFieldTouched = useCallback((fieldId: string) => {
    dispatch({ type: 'MARK_TOUCHED', fieldId });
  }, []);

  const setFieldValidating = useCallback((fieldId: string, isValidating: boolean) => {
    dispatch({ type: 'SET_VALIDATING', fieldId, isValidating });
  }, []);

  const setValue = useCallback(
    (fieldId: string, value: any) => {
      dispatch({ type: 'SET_VALUE', fieldId, value });

      // Clear existing errors when value changes
      // This ensures errors are cleared when user corrects their input
      if (formState.errors[fieldId] && formState.errors[fieldId].length > 0) {
        dispatch({ type: 'CLEAR_ERROR', fieldId });
        dispatch({ type: 'UPDATE_VALIDATION_STATE' });
      }

      // Call field change callback
      if (onFieldChange) {
        const newValues = { ...formState.values, [fieldId]: value };
        onFieldChange(fieldId, value, newValues);
      }
    },
    [formState.values, formState.errors, onFieldChange]
  );

  const validateField = useCallback(
    async (fieldId: string, value?: any): Promise<ValidationResult> => {
      const fieldConfig = formConfig.allFields.find((f) => f.id === fieldId);
      if (!fieldConfig?.validation?.validator) {
        return { isValid: true, errors: [] };
      }

      // Use provided value or current form value
      const fieldValue = value !== undefined ? value : formState.values[fieldId];

      // Clear existing timeout for this field
      const existingTimeout = validationTimeouts.current.get(fieldId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Create validation context
      const context = {
        fieldId,
        formData: formState.values,
        fieldProps: fieldConfig.props,
        touched: formState.touched.has(fieldId),
        dirty: formState.isDirty,
      };

      const debounceMs = fieldConfig.validation.debounceMs || 0;

      return new Promise((resolve) => {
        const performValidation = async () => {
          setFieldValidating(fieldId, true);

          try {
            const result = await fieldConfig.validation!.validator!(
              fieldValue,
              context,
              fieldConfig.props
            );

            if (result.errors.length > 0) {
              setError(fieldId, result.errors);
            } else {
              clearError(fieldId);
            }

            if (result.warnings && result.warnings.length > 0) {
              setWarning(fieldId, result.warnings);
            } else {
              clearWarning(fieldId);
            }

            resolve(result);
          } catch (error) {
            const errorResult: ValidationResult = {
              isValid: false,
              errors: [
                {
                  code: 'validation_error',
                  message: error instanceof Error ? error.message : 'Validation error',
                },
              ],
            };

            setError(fieldId, errorResult.errors);
            resolve(errorResult);
          } finally {
            setFieldValidating(fieldId, false);
          }
        };

        if (debounceMs > 0) {
          const timeout = setTimeout(performValidation, debounceMs);
          validationTimeouts.current.set(fieldId, timeout);
        } else {
          performValidation();
        }
      });
    },
    [
      formConfig,
      formState.values,
      formState.touched,
      formState.isDirty,
      setError,
      setWarning,
      clearError,
      clearWarning,
      setFieldValidating,
    ]
  );

  const validateAllFields = useCallback(async (): Promise<boolean> => {
    const validationPromises = formConfig.allFields.map((field) => validateField(field.id));

    const results = await Promise.all(validationPromises);

    return results.every((result) => result.isValid);
  }, [formConfig, validateField]);

  const reset = useCallback((values?: Record<string, any>) => {
    dispatch({ type: 'RESET', values });
  }, []);

  const submit = useCallback(async () => {
    if (!onSubmit) return;

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      // Validate all fields before submission
      const isValid = await validateAllFields();

      if (!isValid) {
        return;
      }

      await onSubmit(formState.values);
    } catch (error) {
      // Log any unexpected errors from onSubmit
      console.error('Error during form submission:', error);
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [onSubmit, formState.values, validateAllFields]);

  const contextValue: FormContextValue = {
    formState,
    formConfig,
    setValue,
    setError,
    setWarning,
    clearError,
    clearWarning,
    markFieldTouched,
    setFieldValidating,
    validateField,
    validateAllFields,
    reset,
    submit,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form onSubmit={handleSubmit} className={className} noValidate>
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
