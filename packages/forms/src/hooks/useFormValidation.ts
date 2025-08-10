import type { FormConfiguration, ValidationResult } from '@rilaykit/core';
import { createValidationContext, runValidatorsAsync } from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { UseFormConditionsReturn } from './useFormConditions';
import type { FormState } from './useFormState';

// Helper function to create success result
function createSuccessResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

export interface UseFormValidationProps {
  formConfig: FormConfiguration;
  formState: FormState;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  setFieldValidationState: (
    fieldId: string,
    state: 'idle' | 'validating' | 'valid' | 'invalid'
  ) => void;
  setError: (fieldId: string, errors: any[]) => void;
}

export function useFormValidation({
  formConfig,
  formState,
  conditionsHelpers,
  setFieldValidationState,
  setError,
}: UseFormValidationProps) {
  // Use refs for stable references to avoid recreating callbacks
  const formConfigRef = useRef(formConfig);
  const conditionsHelpersRef = useRef(conditionsHelpers);
  const setFieldValidationStateRef = useRef(setFieldValidationState);
  const setErrorRef = useRef(setError);

  // Update refs when props change
  formConfigRef.current = formConfig;
  conditionsHelpersRef.current = conditionsHelpers;
  setFieldValidationStateRef.current = setFieldValidationState;
  setErrorRef.current = setError;

  // Optimized field validation with stable dependencies
  const validateField = useCallback(
    async (fieldId: string, value?: any): Promise<ValidationResult> => {
      const fieldConfig = formConfigRef.current.allFields.find((field) => field.id === fieldId);

      // Skip si le champ n'existe pas
      if (!fieldConfig) {
        return createSuccessResult();
      }

      // Skip si le champ est invisible (clear errors)
      if (!conditionsHelpersRef.current.isFieldVisible(fieldId)) {
        setErrorRef.current(fieldId, []);
        setFieldValidationStateRef.current(fieldId, 'valid');
        return createSuccessResult();
      }

      // Skip si pas de validators
      if (!fieldConfig.validation?.validators?.length) {
        setErrorRef.current(fieldId, []);
        setFieldValidationStateRef.current(fieldId, 'valid');
        return createSuccessResult();
      }

      const valueToValidate = value !== undefined ? value : formState.values[fieldId];

      // Create validation context
      const context = createValidationContext({
        fieldId,
        formId: formConfigRef.current.id,
        allFormData: { ...formState.values, [fieldId]: valueToValidate },
      });

      setFieldValidationStateRef.current(fieldId, 'validating');

      try {
        // Run validators
        const result = await runValidatorsAsync(
          fieldConfig.validation.validators,
          valueToValidate,
          context
        );

        // Check si required par condition
        const isConditionallyRequired = conditionsHelpersRef.current.isFieldRequired(fieldId);
        const isEmpty =
          valueToValidate === undefined || valueToValidate === null || valueToValidate === '';

        if (isConditionallyRequired && isEmpty) {
          const hasRequiredError = result.errors.some(
            (error) => error.code === 'REQUIRED' || error.message.toLowerCase().includes('required')
          );

          if (!hasRequiredError) {
            const enhancedResult = {
              isValid: false,
              errors: [
                { message: 'This field is required', code: 'CONDITIONAL_REQUIRED' },
                ...result.errors,
              ],
            };
            setErrorRef.current(fieldId, enhancedResult.errors);
            setFieldValidationStateRef.current(fieldId, 'invalid');
            return enhancedResult;
          }
        }

        // Set results
        setErrorRef.current(fieldId, result.errors);
        setFieldValidationStateRef.current(fieldId, result.isValid ? 'valid' : 'invalid');
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
        setErrorRef.current(fieldId, errorResult.errors);
        setFieldValidationStateRef.current(fieldId, 'invalid');
        return errorResult;
      }
    },
    [formState.values] // Only depend on form values, use refs for other dependencies
  );

  // Optimized form validation with stable dependencies
  const validateForm = useCallback(async (): Promise<ValidationResult> => {
    // Get visible fields with validators
    const fieldsToValidate = formConfigRef.current.allFields.filter((field) => {
      const isVisible = conditionsHelpersRef.current.isFieldVisible(field.id);
      const hasValidators = field.validation?.validators && field.validation.validators.length > 0;
      return isVisible && hasValidators;
    });

    // Clear errors for invisible fields
    const invisibleFields = formConfigRef.current.allFields.filter(
      (field) => !conditionsHelpersRef.current.isFieldVisible(field.id)
    );
    for (const field of invisibleFields) {
      setErrorRef.current(field.id, []);
      setFieldValidationStateRef.current(field.id, 'valid');
    }

    // Validate visible fields
    const fieldResults = await Promise.all(
      fieldsToValidate.map((field) => validateField(field.id))
    );
    const hasFieldErrors = fieldResults.some((result) => !result.isValid);

    // Form-level validation (si configuré)
    let formResult = createSuccessResult();
    if (formConfigRef.current.validation?.validators?.length) {
      const visibleFormData = Object.keys(formState.values).reduce(
        (acc, fieldId) => {
          if (conditionsHelpersRef.current.isFieldVisible(fieldId)) {
            acc[fieldId] = formState.values[fieldId];
          }
          return acc;
        },
        {} as Record<string, any>
      );

      const context = createValidationContext({
        formId: formConfigRef.current.id,
        allFormData: visibleFormData,
      });

      try {
        formResult = await runValidatorsAsync(
          formConfigRef.current.validation.validators,
          visibleFormData,
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

    return {
      isValid: !hasFieldErrors && formResult.isValid,
      errors: [...fieldResults.flatMap((result) => result.errors), ...formResult.errors],
    };
  }, [formState.values, validateField]); // Reduced dependencies using refs

  return {
    validateField,
    validateForm,
  };
}
