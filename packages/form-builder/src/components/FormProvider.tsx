import type { FormConfiguration, ValidationError, ValidationResult } from '@rilaykit/core';
import { createValidationContext, runValidatorsAsync } from '@rilaykit/core';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';

// Helper function to create success result
function createSuccessResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

export interface FormState {
  values: Record<string, any>;
  errors: Record<string, ValidationError[]>;
  validationState: Record<string, 'idle' | 'validating' | 'valid' | 'invalid'>;
  touched: Record<string, boolean>;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
}

export interface FormContextValue {
  formState: FormState;
  formConfig: FormConfiguration;
  setValue: (fieldId: string, value: any) => void;
  setFieldTouched: (fieldId: string, touched?: boolean) => void;
  validateField: (fieldId: string) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  isFormValid: () => boolean;
  reset: (values?: Record<string, any>) => void;
  submit: (event?: React.FormEvent) => Promise<boolean>;
}

type FormAction =
  | { type: 'SET_VALUE'; fieldId: string; value: any }
  | { type: 'SET_FIELD_ERRORS'; fieldId: string; errors: ValidationError[] }
  | {
      type: 'SET_FIELD_VALIDATION_STATE';
      fieldId: string;
      state: 'idle' | 'validating' | 'valid' | 'invalid';
    }
  | { type: 'SET_FIELD_TOUCHED'; fieldId: string; touched: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_FORM_VALIDITY'; isValid: boolean }
  | { type: 'RESET'; values?: Record<string, any> };

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

    case 'SET_FIELD_ERRORS':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.fieldId]: action.errors,
        },
      };

    case 'SET_FIELD_VALIDATION_STATE':
      return {
        ...state,
        validationState: {
          ...state.validationState,
          [action.fieldId]: action.state,
        },
      };

    case 'SET_FIELD_TOUCHED':
      return {
        ...state,
        touched: {
          ...state.touched,
          [action.fieldId]: action.touched,
        },
      };

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case 'SET_FORM_VALIDITY':
      return {
        ...state,
        isValid: action.isValid,
      };

    case 'RESET':
      return {
        values: action.values || {},
        errors: {},
        validationState: {},
        touched: {},
        isDirty: false,
        isSubmitting: false,
        isValid: true,
      };

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
  const initialState: FormState = {
    values: defaultValues,
    errors: {},
    validationState: {},
    isDirty: false,
    touched: {},
    isSubmitting: false,
    isValid: true,
  };

  const [formState, dispatch] = useReducer(formReducer, initialState);

  // Use refs to avoid recreating callbacks when these change
  const onSubmitRef = useRef(onSubmit);
  const onFieldChangeRef = useRef(onFieldChange);

  // Update refs when props change
  onSubmitRef.current = onSubmit;
  onFieldChangeRef.current = onFieldChange;

  // Optimize setValue with minimal dependencies
  const setValue = useCallback(
    (fieldId: string, value: any) => {
      dispatch({ type: 'SET_VALUE', fieldId, value });
      onFieldChangeRef.current?.(fieldId, value, { ...formState.values, [fieldId]: value });
    },
    [formState.values]
  );

  // Set field touched state
  const setFieldTouched = useCallback((fieldId: string, touched = true) => {
    dispatch({ type: 'SET_FIELD_TOUCHED', fieldId, touched });
  }, []);

  // Validate a specific field
  const validateField = useCallback(
    async (fieldId: string): Promise<ValidationResult> => {
      const fieldConfig = formConfig.allFields.find((field) => field.id === fieldId);
      if (!fieldConfig || !fieldConfig.validation?.validators) {
        return createSuccessResult();
      }

      const value = formState.values[fieldId];
      const context = createValidationContext({
        fieldId,
        formId: formConfig.id,
        allFormData: formState.values,
      });

      dispatch({ type: 'SET_FIELD_VALIDATION_STATE', fieldId, state: 'validating' });

      try {
        const result = await runValidatorsAsync(fieldConfig.validation.validators, value, context);

        dispatch({ type: 'SET_FIELD_ERRORS', fieldId, errors: result.errors });
        dispatch({
          type: 'SET_FIELD_VALIDATION_STATE',
          fieldId,
          state: result.isValid ? 'valid' : 'invalid',
        });

        return result;
      } catch (error) {
        const errorResult = {
          isValid: false,
          errors: [
            {
              message: error instanceof Error ? error.message : 'Validation failed',
              code: 'VALIDATION_ERROR',
            },
          ],
        };

        dispatch({ type: 'SET_FIELD_ERRORS', fieldId, errors: errorResult.errors });
        dispatch({ type: 'SET_FIELD_VALIDATION_STATE', fieldId, state: 'invalid' });

        return errorResult;
      }
    },
    [formConfig, formState.values]
  );

  // Validate the entire form
  const validateForm = useCallback(async (): Promise<ValidationResult> => {
    const fieldValidationPromises = formConfig.allFields
      .filter((field) => field.validation?.validators)
      .map((field) => validateField(field.id));

    const fieldResults = await Promise.all(fieldValidationPromises);
    const hasFieldErrors = fieldResults.some((result) => !result.isValid);

    // Run form-level validators if configured
    let formResult = createSuccessResult();

    if (formConfig.validation?.validators) {
      const context = createValidationContext({
        formId: formConfig.id,
        allFormData: formState.values,
      });

      try {
        formResult = await runValidatorsAsync(
          formConfig.validation.validators,
          formState.values,
          context
        );
      } catch (error) {
        formResult = {
          isValid: false,
          errors: [
            {
              message: error instanceof Error ? error.message : 'Form validation failed',
              code: 'FORM_VALIDATION_ERROR',
            },
          ],
        };
      }
    }

    const combinedResult = {
      isValid: !hasFieldErrors && formResult.isValid,
      errors: [...fieldResults.flatMap((result) => result.errors), ...formResult.errors],
    };

    dispatch({ type: 'SET_FORM_VALIDITY', isValid: combinedResult.isValid });

    return combinedResult;
  }, [formConfig, formState.values, validateField]);

  // Helper function for checking form validity without triggering validation
  const isFormValid = useCallback(() => {
    // Check if form has any errors and if all required fields are valid
    const hasErrors = Object.values(formState.errors).some((errors) => errors.length > 0);
    const hasInvalidFields = Object.values(formState.validationState).some(
      (state) => state === 'invalid'
    );

    return formState.isValid && !hasErrors && !hasInvalidFields;
  }, [formState.isValid, formState.errors, formState.validationState]);

  // Memoize formConfig reference to avoid unnecessary recalculations
  const memoizedFormConfig = useMemo(() => formConfig, [formConfig]);

  const reset = useCallback((values?: Record<string, any>) => {
    dispatch({ type: 'RESET', values });
  }, []);

  const submit = useCallback(
    async (event?: React.FormEvent): Promise<boolean> => {
      event?.preventDefault();

      try {
        dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

        // Always validate the form before submission
        const validationResult = await validateForm();

        // If validation fails, don't proceed with submission
        if (!validationResult.isValid) {
          return false;
        }

        if (!onSubmitRef.current) {
          return true;
        }

        await onSubmitRef.current(formState.values);
        return true;
      } catch (error) {
        // Log any unexpected errors from onSubmit
        console.error('Error during form submission:', error);
        return false;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
      }
    },
    [formState.values, validateForm]
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: FormContextValue = useMemo(
    () => ({
      formState,
      formConfig: memoizedFormConfig,
      setValue,
      setFieldTouched,
      validateField,
      validateForm,
      isFormValid,
      reset,
      submit,
    }),
    [
      formState,
      memoizedFormConfig,
      setValue,
      setFieldTouched,
      validateField,
      validateForm,
      isFormValid,
      reset,
      submit,
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
