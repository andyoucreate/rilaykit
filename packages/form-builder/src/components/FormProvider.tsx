import type {
  FormConfiguration,
  FormFieldConfig,
  StreamlineConfig,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from '@streamline/core';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

// Form state types
export interface FormState {
  readonly formData: Record<string, any>;
  readonly errors: Record<string, ValidationError[]>;
  readonly warnings: Record<string, ValidationError[]>;
  readonly touched: Set<string>;
  readonly validating: Set<string>;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  readonly isValid: boolean;
  readonly submitAttempted: boolean;
}

// Form actions
type FormAction =
  | { type: 'SET_VALUE'; fieldId: string; value: any }
  | { type: 'SET_ERRORS'; fieldId: string; errors: ValidationError[] }
  | { type: 'SET_WARNINGS'; fieldId: string; warnings: ValidationError[] }
  | { type: 'SET_TOUCHED'; fieldId: string }
  | { type: 'SET_VALIDATING'; fieldId: string; isValidating: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_SUBMIT_ATTEMPTED'; attempted: boolean }
  | { type: 'RESET_FORM'; initialData?: Record<string, any> }
  | { type: 'RESET_FIELD'; fieldId: string }
  | { type: 'SET_FORM_DATA'; data: Record<string, any> };

// Form context interface
export interface FormContextValue {
  state: FormState;
  configuration: StreamlineConfig;
  formConfig: FormConfiguration;
  
  // Field operations
  setValue: (fieldId: string, value: any) => void;
  setTouched: (fieldId: string) => void;
  validateField: (fieldId: string) => Promise<void>;
  resetField: (fieldId: string) => void;
  
  // Form operations
  validateForm: () => Promise<boolean>;
  submitForm: () => Promise<void>;
  resetForm: (initialData?: Record<string, any>) => void;
  setFormData: (data: Record<string, any>) => void;
  
  // Helpers
  getFieldError: (fieldId: string) => ValidationError[] | undefined;
  getFieldWarnings: (fieldId: string) => ValidationError[] | undefined;
  isFieldTouched: (fieldId: string) => boolean;
  isFieldValidating: (fieldId: string) => boolean;
  getFieldValue: (fieldId: string) => any;
}

// Form reducer
function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_VALUE':
      return {
        ...state,
        formData: {
          ...state.formData,
          [action.fieldId]: action.value,
        },
        isDirty: true,
      };
      
    case 'SET_ERRORS':
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.fieldId]: action.errors,
        },
        isValid: Object.values({
          ...state.errors,
          [action.fieldId]: action.errors,
        }).every(errors => errors.length === 0),
      };
      
    case 'SET_WARNINGS':
      return {
        ...state,
        warnings: {
          ...state.warnings,
          [action.fieldId]: action.warnings,
        },
      };
      
    case 'SET_TOUCHED':
      return {
        ...state,
        touched: new Set([...state.touched, action.fieldId]),
      };
      
    case 'SET_VALIDATING':
      const newValidating = new Set(state.validating);
      if (action.isValidating) {
        newValidating.add(action.fieldId);
      } else {
        newValidating.delete(action.fieldId);
      }
      
      return {
        ...state,
        validating: newValidating,
      };
      
    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
      
    case 'SET_SUBMIT_ATTEMPTED':
      return {
        ...state,
        submitAttempted: action.attempted,
      };
      
    case 'RESET_FORM':
      return {
        formData: action.initialData || {},
        errors: {},
        warnings: {},
        touched: new Set(),
        validating: new Set(),
        isDirty: false,
        isSubmitting: false,
        isValid: true,
        submitAttempted: false,
      };
      
    case 'RESET_FIELD':
      const newErrors = { ...state.errors };
      const newWarnings = { ...state.warnings };
      const newTouched = new Set(state.touched);
      const newValidatingSet = new Set(state.validating);
      
      delete newErrors[action.fieldId];
      delete newWarnings[action.fieldId];
      newTouched.delete(action.fieldId);
      newValidatingSet.delete(action.fieldId);
      
      return {
        ...state,
        formData: {
          ...state.formData,
          [action.fieldId]: undefined,
        },
        errors: newErrors,
        warnings: newWarnings,
        touched: newTouched,
        validating: newValidatingSet,
      };
      
    case 'SET_FORM_DATA':
      return {
        ...state,
        formData: action.data,
        isDirty: true,
      };
      
    default:
      return state;
  }
}

// Create context
const FormContext = createContext<FormContextValue | null>(null);

// Custom hook to use form context
export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}

// FormProvider props
export interface FormProviderProps {
  configuration: StreamlineConfig;
  formConfig: FormConfiguration;
  initialData?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onValidate?: (data: Record<string, any>) => ValidationResult | Promise<ValidationResult>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
  children: React.ReactNode;
}

/**
 * FormProvider component that manages form state and provides context
 */
export const FormProvider: React.FC<FormProviderProps> = ({
  configuration,
  formConfig,
  initialData = {},
  onSubmit,
  onValidate,
  validateOnChange = true,
  validateOnBlur = true,
  debounceMs = 300,
  children,
}) => {
  // Initialize form state
  const initialState: FormState = useMemo(() => ({
    formData: initialData,
    errors: {},
    warnings: {},
    touched: new Set(),
    validating: new Set(),
    isDirty: false,
    isSubmitting: false,
    isValid: true,
    submitAttempted: false,
  }), [initialData]);

  const [state, dispatch] = useReducer(formReducer, initialState);

  // Refs for debouncing
  const validateTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Memoize all fields for efficient lookup
  const allFields = useMemo(() => {
    return formConfig.allFields.reduce((acc, field) => {
      acc[field.id] = field;
      return acc;
    }, {} as Record<string, FormFieldConfig>);
  }, [formConfig.allFields]);

  // Validate individual field
  const validateField = useCallback(
    async (fieldId: string) => {
      const fieldConfig = allFields[fieldId];
      const componentConfig = configuration.getComponent(fieldConfig?.componentId);
      
      if (!fieldConfig || !componentConfig) return;

      dispatch({ type: 'SET_VALIDATING', fieldId, isValidating: true });

      try {
        const value = state.formData[fieldId];
        const validationConfig = fieldConfig.validation || componentConfig.validation;
        
        if (validationConfig?.validator) {
          const context: ValidationContext = {
            fieldId,
            formData: state.formData,
            fieldProps: fieldConfig.props,
            touched: state.touched.has(fieldId),
            dirty: state.isDirty,
          };

          const result = await validationConfig.validator(value, context, fieldConfig.props);
          
          dispatch({ type: 'SET_ERRORS', fieldId, errors: result.errors });
          if (result.warnings) {
            dispatch({ type: 'SET_WARNINGS', fieldId, warnings: result.warnings });
          }
        } else {
          // No validation configured, clear errors
          dispatch({ type: 'SET_ERRORS', fieldId, errors: [] });
        }
      } catch (error) {
        console.error(`Validation error for field ${fieldId}:`, error);
        dispatch({
          type: 'SET_ERRORS',
          fieldId,
          errors: [{
            code: 'validation_error',
            message: 'Validation error occurred',
          }],
        });
      } finally {
        dispatch({ type: 'SET_VALIDATING', fieldId, isValidating: false });
      }
    },
    [state.formData, state.touched, state.isDirty, allFields, configuration]
  );

  // Debounced validation function
  const debouncedValidateField = useCallback(
    (fieldId: string, value: any) => {
      // Clear existing timeout
      if (validateTimeouts.current[fieldId]) {
        clearTimeout(validateTimeouts.current[fieldId]);
      }
      
      // Set new timeout
      validateTimeouts.current[fieldId] = setTimeout(async () => {
        await validateField(fieldId);
        delete validateTimeouts.current[fieldId];
      }, debounceMs);
    },
    [debounceMs, validateField]
  );

  // Set field value
  const setValue = useCallback(
    (fieldId: string, value: any) => {
      dispatch({ type: 'SET_VALUE', fieldId, value });
      
      if (validateOnChange) {
        debouncedValidateField(fieldId, value);
      }
    },
    [validateOnChange, debouncedValidateField]
  );

  // Set field as touched
  const setTouched = useCallback(
    (fieldId: string) => {
      dispatch({ type: 'SET_TOUCHED', fieldId });
      
      if (validateOnBlur) {
        validateField(fieldId);
      }
    },
    [validateOnBlur, validateField]
  );

  // Reset individual field
  const resetField = useCallback((fieldId: string) => {
    dispatch({ type: 'RESET_FIELD', fieldId });
  }, []);

  // Validate entire form
  const validateForm = useCallback(async () => {
    const validationPromises = formConfig.allFields.map(field => 
      validateField(field.id)
    );
    
    await Promise.all(validationPromises);
    
    // Custom form-level validation
    if (onValidate) {
      try {
        const result = await onValidate(state.formData);
        if (!result.isValid) {
          // Handle form-level errors
          result.errors.forEach(error => {
            const fieldId = error.path?.[0] || '_form';
            dispatch({ type: 'SET_ERRORS', fieldId, errors: [error] });
          });
        }
        return result.isValid;
      } catch (error) {
        console.error('Form validation error:', error);
        return false;
      }
    }
    
    return state.isValid;
  }, [formConfig.allFields, validateField, onValidate, state.formData, state.isValid]);

  // Submit form
  const submitForm = useCallback(async () => {
    dispatch({ type: 'SET_SUBMIT_ATTEMPTED', attempted: true });
    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      const isFormValid = await validateForm();
      
      if (isFormValid && onSubmit) {
        await onSubmit(state.formData);
      }
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [validateForm, onSubmit, state.formData]);

  // Reset form
  const resetForm = useCallback((initialData?: Record<string, any>) => {
    dispatch({ type: 'RESET_FORM', initialData });
  }, []);

  // Set form data
  const setFormData = useCallback((data: Record<string, any>) => {
    dispatch({ type: 'SET_FORM_DATA', data });
  }, []);

  // Helper functions
  const getFieldError = useCallback(
    (fieldId: string) => state.errors[fieldId],
    [state.errors]
  );

  const getFieldWarnings = useCallback(
    (fieldId: string) => state.warnings[fieldId],
    [state.warnings]
  );

  const isFieldTouched = useCallback(
    (fieldId: string) => state.touched.has(fieldId),
    [state.touched]
  );

  const isFieldValidating = useCallback(
    (fieldId: string) => state.validating.has(fieldId),
    [state.validating]
  );

  const getFieldValue = useCallback(
    (fieldId: string) => state.formData[fieldId],
    [state.formData]
  );

  // Context value
  const contextValue: FormContextValue = useMemo(() => ({
    state,
    configuration,
    formConfig,
    setValue,
    setTouched,
    validateField,
    resetField,
    validateForm,
    submitForm,
    resetForm,
    setFormData,
    getFieldError,
    getFieldWarnings,
    isFieldTouched,
    isFieldValidating,
    getFieldValue,
  }), [
    state,
    configuration,
    formConfig,
    setValue,
    setTouched,
    validateField,
    resetField,
    validateForm,
    submitForm,
    resetForm,
    setFormData,
    getFieldError,
    getFieldWarnings,
    isFieldTouched,
    isFieldValidating,
    getFieldValue,
  ]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(validateTimeouts.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  return (
    <FormContext.Provider value={contextValue}>
      {children}
    </FormContext.Provider>
  );
};

FormProvider.displayName = 'FormProvider'; 