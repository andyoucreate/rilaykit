import type {
  ConditionBuilder,
  ConditionConfig,
  ConditionalBehavior,
  FormConfiguration,
  FormFieldConfig,
  RepeatableFieldConfig,
  ValidationResult,
} from '@rilaykit/core';
import {
  createValidationContext,
  evaluateCondition,
  hasUnifiedValidation,
  isEmptyValue,
  validateFormWithUnifiedConfig,
  validateWithUnifiedConfig,
} from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { buildCompositeKey, parseCompositeKey } from '../utils/repeatable-data';
import { scopeConditions } from '../utils/scope-conditions';

// Helper function to create success result
function createSuccessResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

/**
 * Evaluate a single condition against form data, returning false on error.
 */
function evaluateConditionLive(
  condition: ConditionConfig | ConditionBuilder,
  formData: Record<string, unknown>
): boolean {
  try {
    if (typeof condition === 'object' && condition && 'build' in condition) {
      return evaluateCondition(condition.build(), formData);
    }
    return evaluateCondition(condition, formData);
  } catch {
    return false;
  }
}

function evaluateTemplateVisibleCondition(
  condition: ConditionConfig | ConditionBuilder | undefined,
  formData: Record<string, unknown>
): boolean {
  if (!condition) return true;
  return evaluateConditionLive(condition, formData);
}

function isRepeatableVisible(
  config: RepeatableFieldConfig,
  formData: Record<string, unknown>
): boolean {
  return config.allFields.some((field) =>
    evaluateTemplateVisibleCondition(field.conditions?.visible, formData)
  );
}

export interface UseFormValidationWithStoreProps {
  formConfig: FormConfiguration;
  store: FormStore;
}

export function useFormValidationWithStore({
  formConfig,
  store,
}: UseFormValidationWithStoreProps) {
  // Use refs for stable references to avoid recreating callbacks
  const formConfigRef = useRef(formConfig);

  // Update refs when props change
  formConfigRef.current = formConfig;

  // Per-field validation generation tokens. Each validateField run bumps the
  // token; a run only writes results if it is still the latest for that field,
  // so a slow earlier run cannot overwrite a fast later one (stale-overwrite race).
  const validationSeqRef = useRef<Map<string, number>>(new Map());

  // Resolve a field's conditional behavior (scoping repeatable template
  // conditions to the concrete item). Used to evaluate conditions against LIVE
  // store values at validation time — the render-derived conditions snapshot
  // lags a tick behind and would evaluate against stale data.
  const resolveConditionalBehavior = useCallback(
    (fieldId: string): ConditionalBehavior | undefined => {
      const staticField = formConfigRef.current.allFields.find((f) => f.id === fieldId);
      if (staticField) return staticField.conditions;

      const parsed = parseCompositeKey(fieldId);
      if (parsed && formConfigRef.current.repeatableFields) {
        const repeatableConfig = formConfigRef.current.repeatableFields[parsed.repeatableId];
        const templateField = repeatableConfig?.allFields.find((f) => f.id === parsed.fieldId);
        if (repeatableConfig && templateField?.conditions) {
          const templateFieldIds = new Set(repeatableConfig.allFields.map((f) => f.id));
          return scopeConditions(
            templateField.conditions,
            parsed.repeatableId,
            parsed.itemKey,
            templateFieldIds
          );
        }
      }

      return undefined;
    },
    []
  );

  const isFieldVisibleLive = useCallback(
    (fieldId: string): boolean => {
      const conditions = resolveConditionalBehavior(fieldId);
      if (!conditions?.visible) return true;
      return evaluateConditionLive(
        conditions.visible,
        store.getState().values as Record<string, unknown>
      );
    },
    [resolveConditionalBehavior, store]
  );

  const isFieldRequiredLive = useCallback(
    (fieldId: string): boolean => {
      const conditions = resolveConditionalBehavior(fieldId);
      if (!conditions?.required) return false;
      return evaluateConditionLive(
        conditions.required,
        store.getState().values as Record<string, unknown>
      );
    },
    [resolveConditionalBehavior, store]
  );

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
      if (!isFieldVisibleLive(fieldId)) {
        state._setErrors(fieldId, []);
        state._setValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      // No base validation configured — still check conditional required
      if (!fieldConfig.validation || !hasUnifiedValidation(fieldConfig.validation)) {
        const isConditionallyRequired = isFieldRequiredLive(fieldId);
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

      // Claim a generation token for this run of the field.
      const seq = (validationSeqRef.current.get(fieldId) ?? 0) + 1;
      validationSeqRef.current.set(fieldId, seq);
      const isStale = () => validationSeqRef.current.get(fieldId) !== seq;

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

        // A newer run for this field started while we awaited — do not let this
        // stale result overwrite the current one.
        if (isStale()) return result;

        // Check if conditionally required
        const isConditionallyRequired = isFieldRequiredLive(fieldId);

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
        // Superseded by a newer run — drop this stale error.
        if (isStale()) return errorResult;
        state._setErrors(fieldId, errorResult.errors);
        state._setValidationState(fieldId, 'invalid');
        return errorResult;
      }
    },
    [store, isFieldVisibleLive, isFieldRequiredLive]
  );

  // Optimized form validation with stable dependencies
  const validateForm = useCallback(async (): Promise<ValidationResult> => {
    const state = store.getState();

    // Get visible fields with validation or conditional required
    const fieldsToValidate = formConfigRef.current.allFields.filter((field) => {
      const isVisible = isFieldVisibleLive(field.id);
      if (!isVisible) return false;

      const hasValidation = field.validation && hasUnifiedValidation(field.validation);
      const isConditionallyRequired = isFieldRequiredLive(field.id);
      return hasValidation || isConditionallyRequired;
    });

    // Clear errors for invisible fields
    const invisibleFields = formConfigRef.current.allFields.filter(
      (field) => !isFieldVisibleLive(field.id)
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
          if (!isFieldVisibleLive(compositeId)) {
            state._setErrors(compositeId, []);
            state._setValidationState(compositeId, 'valid');
            continue;
          }

          const result = await validateField(compositeId);
          repeatableResults.push(result);
        }
      }

      // Validate min count constraint only when the repeatable is effectively visible.
      if (
        config.min !== undefined &&
        order.length < config.min &&
        isRepeatableVisible(config, state.values as Record<string, unknown>)
      ) {
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
          if (isFieldVisibleLive(fieldId)) {
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
  }, [store, validateField, isFieldVisibleLive, isFieldRequiredLive]);

  return {
    validateField,
    validateForm,
  };
}
