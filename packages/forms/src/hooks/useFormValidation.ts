import type { FormConfiguration, ValidationResult } from '@rilaykit/core';
import { createValidationContext, runValidatorsAsync } from '@rilaykit/core';
import { useCallback } from 'react';
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
  // Simple field validation
  const validateField = useCallback(
    async (fieldId: string, value?: any): Promise<ValidationResult> => {
      const fieldConfig = formConfig.allFields.find((field) => field.id === fieldId);

      // Skip si le champ n'existe pas
      if (!fieldConfig) {
        return createSuccessResult();
      }

      // Skip si le champ est invisible (clear errors)
      if (!conditionsHelpers.isFieldVisible(fieldId)) {
        setError(fieldId, []);
        setFieldValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      // Skip si pas de validators
      if (!fieldConfig.validation?.validators?.length) {
        setError(fieldId, []);
        setFieldValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      const valueToValidate = value !== undefined ? value : formState.values[fieldId];

      // Créer le contexte de validation
      const context = createValidationContext({
        fieldId,
        formId: formConfig.id,
        allFormData: { ...formState.values, [fieldId]: valueToValidate },
      });

      setFieldValidationState(fieldId, 'validating');

      try {
        // Run validators
        const result = await runValidatorsAsync(
          fieldConfig.validation.validators,
          valueToValidate,
          context
        );

        // Check si required par condition
        const isConditionallyRequired = conditionsHelpers.isFieldRequired(fieldId);
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
            setError(fieldId, enhancedResult.errors);
            setFieldValidationState(fieldId, 'invalid');
            return enhancedResult;
          }
        }

        // Set results
        setError(fieldId, result.errors);
        setFieldValidationState(fieldId, result.isValid ? 'valid' : 'invalid');
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
        setError(fieldId, errorResult.errors);
        setFieldValidationState(fieldId, 'invalid');
        return errorResult;
      }
    },
    [formConfig, formState.values, conditionsHelpers, setFieldValidationState, setError]
  );

  // Simple form validation
  const validateForm = useCallback(async (): Promise<ValidationResult> => {
    // Get visible fields with validators
    const fieldsToValidate = formConfig.allFields.filter((field) => {
      const isVisible = conditionsHelpers.isFieldVisible(field.id);
      const hasValidators = field.validation?.validators && field.validation.validators.length > 0;
      return isVisible && hasValidators;
    });

    // Clear errors for invisible fields
    const invisibleFields = formConfig.allFields.filter(
      (field) => !conditionsHelpers.isFieldVisible(field.id)
    );
    for (const field of invisibleFields) {
      setError(field.id, []);
      setFieldValidationState(field.id, 'valid');
    }

    // Validate visible fields
    const fieldResults = await Promise.all(
      fieldsToValidate.map((field) => validateField(field.id))
    );
    const hasFieldErrors = fieldResults.some((result) => !result.isValid);

    // Form-level validation (si configuré)
    let formResult = createSuccessResult();
    if (formConfig.validation?.validators?.length) {
      const visibleFormData = Object.keys(formState.values).reduce(
        (acc, fieldId) => {
          if (conditionsHelpers.isFieldVisible(fieldId)) {
            acc[fieldId] = formState.values[fieldId];
          }
          return acc;
        },
        {} as Record<string, any>
      );

      const context = createValidationContext({
        formId: formConfig.id,
        allFormData: visibleFormData,
      });

      try {
        formResult = await runValidatorsAsync(
          formConfig.validation.validators,
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
  }, [
    formConfig,
    formState.values,
    conditionsHelpers,
    validateField,
    setError,
    setFieldValidationState,
  ]);

  return {
    validateField,
    validateForm,
  };
}
