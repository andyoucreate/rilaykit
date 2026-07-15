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
  getOwn,
  hasUnifiedValidation,
  isEmptyValue,
  validateFormWithUnifiedConfig,
  validateWithUnifiedConfig,
} from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import {
  CONDITIONAL_REQUIRED_CODE,
  holdsOnlyConditionalRequiredError,
} from '../utils/conditional-required';
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
  /**
   * Identity of the form currently mounted — `FormProvider`'s `configSignature`,
   * which leads with WHO the form is mounted for (`instanceId`) and then what it
   * can hold. A change to it is a form swap, and every validation run still in
   * flight is thereby invalidated: its verdict was computed for a field of a
   * form that is no longer mounted, from a value that no longer exists anywhere.
   *
   * Optional so the hook stays usable on its own; a caller that omits it gets a
   * form whose identity never changes, which is exactly the standalone case.
   */
  instanceKey?: string;
}

export function useFormValidationWithStore({
  formConfig,
  store,
  instanceKey,
}: UseFormValidationWithStoreProps) {
  // Use refs for stable references to avoid recreating callbacks
  const formConfigRef = useRef(formConfig);

  // Update refs when props change
  formConfigRef.current = formConfig;

  // Per-field validation generation tokens. Each validateField run bumps the
  // token; a run only writes results if it is still the latest for that field,
  // so a slow earlier run cannot overwrite a fast later one (stale-overwrite race).
  const validationSeqRef = useRef<Map<string, number>>(new Map());

  // Generation of the MOUNTED FORM, bumped on every swap. The per-field tokens
  // above cannot stand in for this: they only order runs of one field against
  // each other, and a run that nothing supersedes is never stale by that measure
  // — so an async run started on the previous step, with no successor on the new
  // one, sailed straight through and wrote the previous step's verdict onto the
  // new step's field of the same id. Field ids are not unique across a flow and
  // were never meant to be (workflow data is keyed by STEP id), so two ordinary
  // steps both naming a field `note` was all it took; the new step need not even
  // declare validation on it.
  //
  // Clearing the token map instead would be both insufficient and wrong: after a
  // swap the new step's first run for that field claims token 1 again, which the
  // stale run then MATCHES, and it would overwrite a verdict that is genuinely
  // the new step's.
  const generationRef = useRef(0);
  const instanceKeyRef = useRef(instanceKey);
  if (instanceKeyRef.current !== instanceKey) {
    instanceKeyRef.current = instanceKey;
    generationRef.current += 1;
  }

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
        const repeatableConfig = getOwn(
          formConfigRef.current.repeatableFields,
          parsed.repeatableId
        );
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
          const repeatableConfig = getOwn(
            formConfigRef.current.repeatableFields,
            parsed.repeatableId
          );
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
        const valueToCheck = value !== undefined ? value : getOwn(state.values, fieldId);

        if (isConditionallyRequired && isEmptyValue(valueToCheck)) {
          const result = {
            isValid: false as const,
            errors: [{ message: 'This field is required', code: CONDITIONAL_REQUIRED_CODE }],
          };
          state._setErrors(fieldId, result.errors);
          state._setValidationState(fieldId, 'invalid');
          return result;
        }

        state._setErrors(fieldId, []);
        state._setValidationState(fieldId, 'valid');
        return createSuccessResult();
      }

      const valueToValidate = value !== undefined ? value : getOwn(state.values, fieldId);

      // Claim a generation token for this run of the field, and record WHICH
      // MOUNTED FORM it is a run of. A run is stale if a newer run of the same
      // field superseded it, OR if the form it was started for has been swapped
      // out from under it — the second is not implied by the first.
      const seq = (validationSeqRef.current.get(fieldId) ?? 0) + 1;
      validationSeqRef.current.set(fieldId, seq);
      const generation = generationRef.current;
      const isStale = () =>
        generationRef.current !== generation || validationSeqRef.current.get(fieldId) !== seq;

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

        // The field may have become invisible while we awaited (a condition on
        // another field flipped). Writing errors on a now-hidden field would
        // wedge the global isValid with no visible error. Mirror the pre-await
        // and validateForm invisible handling: clear and skip.
        if (!isFieldVisibleLive(fieldId)) {
          state._setErrors(fieldId, []);
          state._setValidationState(fieldId, 'valid');
          return createSuccessResult();
        }

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
                { message: 'This field is required', code: CONDITIONAL_REQUIRED_CODE },
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
        // Field became invisible while we awaited — do not write errors on it.
        if (!isFieldVisibleLive(fieldId)) {
          state._setErrors(fieldId, []);
          state._setValidationState(fieldId, 'valid');
          return createSuccessResult();
        }
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

    // Clear stale CONDITIONAL_REQUIRED errors on visible fields that are no
    // longer conditionally required and have no base validation. Such a field
    // is excluded from `fieldsToValidate`, so without this its committed
    // required-error would linger in the store and wedge `store.isValid` even
    // though this function reports the form valid — a contradiction that keeps
    // a submit button (gated on useFormValid) disabled forever.
    for (const field of formConfigRef.current.allFields) {
      if (!isFieldVisibleLive(field.id)) continue;
      const hasValidation = field.validation && hasUnifiedValidation(field.validation);
      if (hasValidation || isFieldRequiredLive(field.id)) continue;
      if (holdsOnlyConditionalRequiredError(getOwn(state.errors, field.id))) {
        state._setErrors(field.id, []);
        state._setValidationState(field.id, 'valid');
      }
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
      const order = getOwn(state._repeatableOrder, repeatableId) ?? [];

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
            acc[fieldId] = getOwn(state.values, fieldId);
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
