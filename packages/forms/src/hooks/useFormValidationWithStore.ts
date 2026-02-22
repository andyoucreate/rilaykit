import type { FormConfiguration, FormFieldConfig, ValidationResult } from '@rilaykit/core';
import {
  createValidationContext,
  hasUnifiedValidation,
  isEmptyValue,
  validateFormWithUnifiedConfig,
  validateWithUnifiedConfig,
} from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { buildCompositeKey, parseCompositeKey } from '../utils/repeatable-data';
import type { UseFormConditionsReturn } from './useFormConditions';

// Helper function to create success result
function createSuccessResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

export interface UseFormValidationWithStoreProps {
  formConfig: FormConfiguration;
  store: FormStore;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
}

export function useFormValidationWithStore({
  formConfig,
  store,
  conditionsHelpers,
}: UseFormValidationWithStoreProps) {
  // Use refs for stable references to avoid recreating callbacks
  const formConfigRef = useRef(formConfig);
  const conditionsHelpersRef = useRef(conditionsHelpers);

  // Update refs when props change
  formConfigRef.current = formConfig;
  conditionsHelpersRef.current = conditionsHelpers;

  // Optimized field validation with stable dependencies
  const validateField = useCallback(
    async (fieldId: string, value?: unknown): Promise<ValidationResult> => {
      // Try static fields first, then composite key lookup for repeatable fields
      let fieldConfig: FormFieldConfig | undefined = formConfigRef.current.allFields.find(
        (field) => field.id === fieldId
      );

      if (!fieldConfig) {
        const parsed = parseCompositeKey(fieldId);
        if (parsed && formConfigRef.current.repeatableFields) {
          const repeatableConfig = formConfigRef.current.repeatableFields[parsed.repeatableId];
          if (repeatableConfig) {
            const templateField = repeatableConfig.allFields.find((f) => f.id === parsed.fieldId);
            if (templateField) {
              fieldConfig = { ...templateField, id: fieldId };
            }
          }
        }
      }

      const state = store.getState();

      // Skip if field doesn't exist
      if (!fieldConfig) {
        return createSuccessResult();
      }

      // Skip if field is invisible (clear errors)
      if (!conditionsHelpersRef.current.isFieldVisible(fieldId)) {
        state._setErrors(fieldId, []);
        state._setValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      // No base validation configured — still check conditional required
      if (!fieldConfig.validation || !hasUnifiedValidation(fieldConfig.validation)) {
        const isConditionallyRequired = conditionsHelpersRef.current.isFieldRequired(fieldId);
        const valueToCheck = value !== undefined ? value : state.values[fieldId];

        if (isConditionallyRequired && isEmptyValue(valueToCheck)) {
          const result = {
            isValid: false as const,
            errors: [{ message: 'This field is required', code: 'CONDITIONAL_REQUIRED' }],
          };
          state._setErrors(fieldId, result.errors);
          state._setValidationState(fieldId, 'invalid');
          return result;
        }

        state._setErrors(fieldId, []);
        state._setValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      const valueToValidate = value !== undefined ? value : state.values[fieldId];

      // Create validation context
      const context = createValidationContext({
        fieldId,
        formId: formConfigRef.current.id,
        allFormData: { ...state.values, [fieldId]: valueToValidate },
      });

      state._setValidationState(fieldId, 'validating');

      try {
        // Run unified validation (Standard Schema only)
        const result = await validateWithUnifiedConfig(
          fieldConfig.validation,
          valueToValidate,
          context
        );

        // Check if conditionally required
        const isConditionallyRequired = conditionsHelpersRef.current.isFieldRequired(fieldId);

        if (isConditionallyRequired && isEmptyValue(valueToValidate)) {
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
            state._setErrors(fieldId, enhancedResult.errors);
            state._setValidationState(fieldId, 'invalid');
            return enhancedResult;
          }
        }

        // Set results
        state._setErrors(fieldId, result.errors);
        state._setValidationState(fieldId, result.isValid ? 'valid' : 'invalid');
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
        state._setErrors(fieldId, errorResult.errors);
        state._setValidationState(fieldId, 'invalid');
        return errorResult;
      }
    },
    [store]
  );

  // Optimized form validation with stable dependencies
  const validateForm = useCallback(async (): Promise<ValidationResult> => {
    const state = store.getState();

    // Get visible fields with validation or conditional required
    const fieldsToValidate = formConfigRef.current.allFields.filter((field) => {
      const isVisible = conditionsHelpersRef.current.isFieldVisible(field.id);
      if (!isVisible) return false;

      const hasValidation = field.validation && hasUnifiedValidation(field.validation);
      const isConditionallyRequired = conditionsHelpersRef.current.isFieldRequired(field.id);
      return hasValidation || isConditionallyRequired;
    });

    // Clear errors for invisible fields
    const invisibleFields = formConfigRef.current.allFields.filter(
      (field) => !conditionsHelpersRef.current.isFieldVisible(field.id)
    );
    for (const field of invisibleFields) {
      state._setErrors(field.id, []);
      state._setValidationState(field.id, 'valid');
    }

    // Validate visible static fields
    const fieldResults = await Promise.all(
      fieldsToValidate.map((field) => validateField(field.id))
    );
    let hasFieldErrors = fieldResults.some((result) => !result.isValid);

    // Validate repeatable fields
    const repeatableConfigs = formConfigRef.current.repeatableFields ?? {};
    const repeatableResults: ValidationResult[] = [];

    for (const [repeatableId, config] of Object.entries(repeatableConfigs)) {
      const order = state._repeatableOrder[repeatableId] ?? [];

      // Validate each item's fields
      for (const itemKey of order) {
        for (const templateField of config.allFields) {
          const compositeId = buildCompositeKey(repeatableId, itemKey, templateField.id);

          // Skip invisible fields
          if (!conditionsHelpersRef.current.isFieldVisible(compositeId)) {
            state._setErrors(compositeId, []);
            state._setValidationState(compositeId, 'valid');
            continue;
          }

          const result = await validateField(compositeId);
          repeatableResults.push(result);
        }
      }

      // Validate min count constraint
      if (config.min !== undefined && order.length < config.min) {
        repeatableResults.push({
          isValid: false,
          errors: [
            {
              message: `At least ${config.min} item(s) required`,
              code: 'REPEATABLE_MIN_COUNT',
              path: repeatableId,
            },
          ],
        });
      }
    }

    const hasRepeatableErrors = repeatableResults.some((result) => !result.isValid);
    hasFieldErrors = hasFieldErrors || hasRepeatableErrors;

    // Form-level validation (if configured)
    let formResult = createSuccessResult();
    if (
      formConfigRef.current.validation &&
      hasUnifiedValidation(formConfigRef.current.validation)
    ) {
      const visibleFormData = Object.keys(state.values).reduce(
        (acc, fieldId) => {
          if (conditionsHelpersRef.current.isFieldVisible(fieldId)) {
            acc[fieldId] = state.values[fieldId];
          }
          return acc;
        },
        {} as Record<string, unknown>
      );

      const context = createValidationContext({
        formId: formConfigRef.current.id,
        allFormData: visibleFormData,
      });

      try {
        // Run unified form validation (Standard Schema only)
        formResult = await validateFormWithUnifiedConfig(
          formConfigRef.current.validation,
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
      errors: [
        ...fieldResults.flatMap((result) => result.errors),
        ...repeatableResults.flatMap((result) => result.errors),
        ...formResult.errors,
      ],
    };
  }, [store, validateField]);

  return {
    validateField,
    validateForm,
  };
}
