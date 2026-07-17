import type {
  ConditionalBehavior,
  FieldError,
  FormConfiguration,
  FormFieldConfig,
  ValidationResult,
} from '@rilaykit/core';
import {
  createValidationContext,
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
import { routeFormIssuesToKeys } from '../utils/form-error-routing';
import { buildCompositeKey, parseCompositeKey } from '../utils/repeatable-data';
// The condition resolution/evaluation these hooks used to define inline lives
// in utils/submit-visibility.ts now, shared with the submit payload boundary:
// "invisible = nonexistent" is ONE contract, so validation and submission must
// measure visibility identically.
import {
  evaluateConditionLive,
  isRepeatableVisible,
  resolveFieldConditionalBehavior,
} from '../utils/submit-visibility';

// Helper function to create success result
function createSuccessResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

/**
 * Every field id a form-level issue's `path` may legitimately name. A form
 * schema's object path is dot-joined by `formatIssuePath` (`items.0.sku`),
 * whereas a repeatable row's field id is a bracket composite key
 * (`items[k0].sku`) — the two forms can never be equal, so a cross-field issue
 * over a repeatable correctly falls to `__form__` rather than a row. Only the
 * static field ids are collectable; consumed by `routeFormIssuesToKeys` to
 * decide field-bucket vs. `__form__`.
 */
function collectKnownFieldIds(config: FormConfiguration): Set<string> {
  return new Set(config.allFields.map((field) => field.id));
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
    (fieldId: string): ConditionalBehavior | undefined =>
      resolveFieldConditionalBehavior(formConfigRef.current, fieldId),
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

  // Whether a field id still resolves in the LIVE config — a static field or a
  // repeatable template field. A streamed field id can arrive torn (`na`) and
  // complete to a different id (`name`) mid-await; the in-flight run's field is
  // then gone from allFields. Writing its verdict under the old key would create
  // a ghost the clearing loops (which iterate the LIVE allFields) can never
  // reach, wedging isValid with no visible error. Mirrors the fieldConfig lookup.
  const fieldExistsLive = useCallback(
    (fieldId: string): boolean => {
      if (formConfigRef.current.allFields.some((field) => field.id === fieldId)) return true;
      const parsed = parseCompositeKey(fieldId);
      if (parsed && formConfigRef.current.repeatableFields) {
        const repeatableConfig = getOwn(
          formConfigRef.current.repeatableFields,
          parsed.repeatableId
        );
        const templateExists =
          repeatableConfig?.allFields.some((field) => field.id === parsed.fieldId) ?? false;
        if (!templateExists) return false;
        // The ROW must still be live too: a row removed while its validation was
        // in flight leaves the template but drops the itemKey from _repeatableOrder.
        // Writing the late verdict under `items[k0].sku` would ghost-wedge isValid.
        const liveOrder = getOwn(store.getState()._repeatableOrder, parsed.repeatableId);
        return liveOrder?.includes(parsed.itemKey) ?? false;
      }
      return false;
    },
    [store]
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

      // The component this run is validating against. A mid-stream RETYPE
      // (`text`→`textarea`, same id) re-registers the field as a fresh control;
      // this run's verdict — computed for the OLD control's value — must not land
      // on the new one. Captured before any await, compared after.
      const startedComponentId = fieldConfig.componentId;
      const wasRetyped = () => {
        const current = formConfigRef.current.allFields.find((field) => field.id === fieldId);
        return current !== undefined && current.componentId !== startedComponentId;
      };

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

        // The field's id was renamed/removed (incl. a repeatable row dropped),
        // or its component was retyped, while we awaited (a torn streamed id/type
        // completed, or a row removed mid-submit). Its verdict applies to no live
        // field: it must neither show (the store is cleared) NOR count against the
        // form. Return SUCCESS — a nonexistent field is not invalid — matching the
        // invisible-field arm below, so validateForm does not block submit on it.
        if (!fieldExistsLive(fieldId) || wasRetyped()) {
          state._setErrors(fieldId, []);
          state._setValidationState(fieldId, 'valid');
          return createSuccessResult();
        }

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
        // The field's id was renamed/removed, or its component was retyped, while
        // we awaited — dropping the verdict avoids a ghost error key (rename) or a
        // phantom error on a re-registered control (retype).
        if (!fieldExistsLive(fieldId) || wasRetyped()) {
          state._setErrors(fieldId, []);
          state._setValidationState(fieldId, 'valid');
          return createSuccessResult();
        }
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
    [store, isFieldVisibleLive, isFieldRequiredLive, fieldExistsLive]
  );

  // Form-level (cross-field) validation, routed into the shared error map. Runs
  // the configured form schema against the currently-VISIBLE values, then routes
  // each issue by `path` (matched field id → that field's bucket; empty/unmatched
  // → `__form__`) and writes the result via `_setFormLevelErrors` — the ONE place
  // the store learns of cross-field errors. Returns the RAW (untagged) issues so
  // `validateForm` can keep its returned `ValidationResult` unchanged. Shared by
  // the submit path (below) and the live path (`validateFormLevel`) so routing
  // and clearing can never diverge.
  const evaluateFormLevel = useCallback(async (): Promise<FieldError[]> => {
    const config = formConfigRef.current;
    const state = store.getState();

    if (!config.validation || !hasUnifiedValidation(config.validation)) {
      // No form-level schema — there can be no form-level error to write or
      // clear, so leave the map (and its subscribers) untouched.
      return [];
    }

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
      formId: config.id,
      allFormData: visibleFormData,
    });

    let formErrors: FieldError[];
    try {
      const result = await validateFormWithUnifiedConfig(
        config.validation,
        visibleFormData,
        context
      );
      formErrors = result.errors;
    } catch (error) {
      formErrors = [
        {
          message: error instanceof Error ? error.message : 'Form validation failed',
          code: 'FORM_VALIDATION_ERROR',
        },
      ];
    }

    const knownFieldIds = collectKnownFieldIds(config);
    store.getState()._setFormLevelErrors(routeFormIssuesToKeys(formErrors, knownFieldIds));
    return formErrors;
  }, [store, isFieldVisibleLive]);

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

    // Form-level (cross-field) validation — routed into the shared error map so
    // it shows on fields and flips the stored `isValid`. The returned issues are
    // the raw (untagged) ones, keeping this function's ValidationResult unchanged.
    const formErrors = await evaluateFormLevel();

    return {
      isValid: !hasFieldErrors && formErrors.length === 0,
      errors: [
        ...fieldResults.flatMap((result) => result.errors),
        ...repeatableResults.flatMap((result) => result.errors),
        ...formErrors,
      ],
    };
  }, [store, validateField, isFieldVisibleLive, isFieldRequiredLive, evaluateFormLevel]);

  return {
    validateField,
    validateForm,
    // Live form-level (re)evaluation, gated by FormField on the same
    // mode/reValidateMode schedule as field validation so a cross-field error
    // appears and clears live.
    validateFormLevel: evaluateFormLevel,
  };
}
