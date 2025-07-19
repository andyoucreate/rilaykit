import type { ValidationError } from '@rilaykit/core';
import { useCallback, useReducer, useRef } from 'react';

export interface FormState {
  values: Record<string, any>;
  errors: Record<string, ValidationError[]>;
  validationState: Record<string, 'idle' | 'validating' | 'valid' | 'invalid'>;
  touched: Record<string, boolean>;
  isDirty: boolean;
  isSubmitting: boolean;
}

export type FormAction =
  | { type: 'SET_VALUE'; fieldId: string; value: any }
  | { type: 'SET_FIELD_ERRORS'; fieldId: string; errors: ValidationError[] }
  | {
      type: 'SET_FIELD_VALIDATION_STATE';
      fieldId: string;
      state: 'idle' | 'validating' | 'valid' | 'invalid';
    }
  | { type: 'SET_FIELD_TOUCHED'; fieldId: string }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'RESET'; values?: Record<string, any> };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_VALUE':
      return {
        ...state,
        values: { ...state.values, [action.fieldId]: action.value },
        isDirty: true,
      };

    case 'SET_FIELD_ERRORS':
      return {
        ...state,
        errors: { ...state.errors, [action.fieldId]: action.errors },
      };

    case 'SET_FIELD_VALIDATION_STATE':
      return {
        ...state,
        validationState: { ...state.validationState, [action.fieldId]: action.state },
      };

    case 'SET_FIELD_TOUCHED':
      return {
        ...state,
        touched: { ...state.touched, [action.fieldId]: true },
      };

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case 'RESET':
      return {
        values: action.values || {},
        errors: {},
        validationState: {},
        touched: {},
        isDirty: false,
        isSubmitting: false,
      };

    default:
      return state;
  }
}

export interface UseFormStateProps {
  defaultValues?: Record<string, any>;
  onFieldChange?: (fieldId: string, value: any, formData: Record<string, any>) => void;
}

export function useFormState({ defaultValues = {}, onFieldChange }: UseFormStateProps) {
  const initialState: FormState = {
    values: defaultValues,
    errors: {},
    validationState: {},
    touched: {},
    isDirty: false,
    isSubmitting: false,
  };

  const [formState, dispatch] = useReducer(formReducer, initialState);

  // Use ref pour éviter les re-créations de callbacks
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;

  // Actions simples et directes
  const setValue = useCallback(
    (fieldId: string, value: any) => {
      dispatch({ type: 'SET_VALUE', fieldId, value });
      onFieldChangeRef.current?.(fieldId, value, { ...formState.values, [fieldId]: value });
    },
    [formState.values]
  );

  const setFieldTouched = useCallback((fieldId: string) => {
    dispatch({ type: 'SET_FIELD_TOUCHED', fieldId });
  }, []);

  const setError = useCallback((fieldId: string, errors: ValidationError[]) => {
    dispatch({ type: 'SET_FIELD_ERRORS', fieldId, errors });
  }, []);

  const clearError = useCallback((fieldId: string) => {
    dispatch({ type: 'SET_FIELD_ERRORS', fieldId, errors: [] });
  }, []);

  const setFieldValidationState = useCallback(
    (fieldId: string, state: 'idle' | 'validating' | 'valid' | 'invalid') => {
      dispatch({ type: 'SET_FIELD_VALIDATION_STATE', fieldId, state });
    },
    []
  );

  const setSubmitting = useCallback((isSubmitting: boolean) => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting });
  }, []);

  const reset = useCallback((values?: Record<string, any>) => {
    dispatch({ type: 'RESET', values });
  }, []);

  // Helper pour calculer la validité (quand nécessaire)
  const isFormValid = useCallback(() => {
    const hasErrors = Object.values(formState.errors).some((errors) => errors.length > 0);
    const hasInvalidFields = Object.values(formState.validationState).some(
      (state) => state === 'invalid'
    );
    return !hasErrors && !hasInvalidFields;
  }, [formState.errors, formState.validationState]);

  return {
    formState,
    setValue,
    setFieldTouched,
    setError,
    clearError,
    setFieldValidationState,
    setSubmitting,
    reset,
    isFormValid,
  };
}
