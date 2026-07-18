import { getLogger } from '@rilaykit/core';
import type {
  FormConfiguration,
  RepeatableFieldConfig,
  SubmitOptions,
  ValidationResult,
} from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { defineOwn, structureFormValues } from '../utils/repeatable-data';
import { pickVisibleSubmitValues } from '../utils/submit-visibility';

const log = getLogger('forms:submission');

/**
 * The payload exactly as the host receives it, on EVERY submit path (`force`
 * included — force skips VALIDATION, not the visibility contract):
 * currently-hidden fields dropped when a `formConfig` is supplied, then
 * composite keys structured back into authored arrays. A repeatable whose
 * whole template is hidden is left out of structuring too, so it does not
 * resurface as an array key with its rows filtered empty.
 */
function buildSubmitPayload(
  values: Record<string, unknown>,
  repeatableConfigs: Record<string, RepeatableFieldConfig>,
  repeatableOrder: Record<string, string[]>,
  formConfig: FormConfiguration | undefined,
  conditionData: Record<string, unknown>
): Record<string, unknown> {
  let visibleValues = values;
  let visibleConfigs = repeatableConfigs;

  if (formConfig) {
    const picked = pickVisibleSubmitValues(values, formConfig, conditionData);
    visibleValues = picked.values;
    if (picked.hiddenRepeatableIds.size > 0) {
      visibleConfigs = {};
      for (const [id, config] of Object.entries(repeatableConfigs)) {
        // `defineOwn`: a repeatable id is author data; see repeatable-data.
        if (!picked.hiddenRepeatableIds.has(id)) defineOwn(visibleConfigs, id, config);
      }
    }
  }

  return Object.keys(visibleConfigs).length > 0
    ? structureFormValues(visibleValues, visibleConfigs, repeatableOrder)
    : visibleValues;
}

export interface UseFormSubmissionWithStoreProps {
  store: FormStore;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  validateForm: () => Promise<ValidationResult>;
  defaultSubmitOptions?: SubmitOptions;
  /**
   * Identity of the form currently mounted — `FormProvider`'s `configSignature`,
   * which leads with WHO the form is mounted for (`instanceId`). A change to it
   * is a form swap, and a submit still in flight across one is abandoned.
   *
   * Optional so the hook stays usable on its own; a caller that omits it gets a
   * form whose identity never changes, which is exactly the standalone case.
   */
  instanceKey?: string;
  /**
   * The live form configuration — what makes the payload visibility filter
   * possible. The store holds values for every field it was ever handed
   * (seeded defaults of hidden fields, values typed into a since-hidden field:
   * both deliberate, for re-reveal UX), but validation already treats an
   * invisible field as NONEXISTENT, and the payload must agree: a
   * currently-hidden field's value shipping to the host is an answer to a
   * question the user never saw. Optional so the hook stays usable on its own;
   * a caller that omits it ships the values unfiltered, as before.
   */
  formConfig?: FormConfiguration;
  /**
   * Live data the visibility conditions evaluate against at submit time. Must
   * reproduce the RENDER-TIME visibility semantics or the filter would drop a
   * field the user is looking at: host-supplied external condition values
   * (cross-step references in a workflow) layered UNDER the live store values,
   * with every bare name the form owns answering from the store alone.
   * Defaults to the live store values — exactly right standalone.
   */
  getConditionValues?: () => Record<string, unknown>;
}

function isFormEvent(value: unknown): value is React.FormEvent {
  return typeof value === 'object' && value !== null && 'preventDefault' in value;
}

export function useFormSubmissionWithStore({
  store,
  onSubmit,
  validateForm,
  defaultSubmitOptions,
  instanceKey,
  formConfig,
  getConditionValues,
}: UseFormSubmissionWithStoreProps) {
  // Use ref to store current onSubmit callback
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const defaultSubmitOptionsRef = useRef(defaultSubmitOptions);
  defaultSubmitOptionsRef.current = defaultSubmitOptions;

  // Refs, like onSubmit: a submit reads WHATEVER IS CURRENT when it ships, and
  // a recompiled config (growth chunk) must not recreate the callback.
  const formConfigRef = useRef(formConfig);
  formConfigRef.current = formConfig;
  const getConditionValuesRef = useRef(getConditionValues);
  getConditionValuesRef.current = getConditionValues;

  // Generation of the MOUNTED FORM, bumped on every swap — see `instanceKey`.
  // A submit is work started ON a form, but everything it needs on the far side
  // of `await validateForm()` is read as "whatever is current": `store.getState()`
  // and `onSubmitRef.current`. That is right for a re-rendered config and wrong
  // for a swap, and a workflow step transition is a swap.
  const generationRef = useRef(0);
  const instanceKeyRef = useRef(instanceKey);
  if (instanceKeyRef.current !== instanceKey) {
    instanceKeyRef.current = instanceKey;
    generationRef.current += 1;
  }

  const submit = useCallback(
    async (eventOrOptions?: React.FormEvent | SubmitOptions): Promise<boolean> => {
      // Handle both React.FormEvent and SubmitOptions
      let options: SubmitOptions = {};

      if (isFormEvent(eventOrOptions)) {
        eventOrOptions.preventDefault();
      } else if (eventOrOptions) {
        options = eventOrOptions;
      }

      // Merge with defaults (submit-time options take priority)
      const resolvedOptions: SubmitOptions = {
        ...defaultSubmitOptionsRef.current,
        ...options,
      };

      const state = store.getState();

      // Don't submit if already submitting
      if (state.isSubmitting) {
        return false;
      }

      // Which form this submit is a submit OF. Checked again after the only
      // await that can span a swap.
      const generation = generationRef.current;

      state._setSubmitting(true);

      try {
        // force takes priority over skipInvalid
        if (resolvedOptions.force) {
          // Skip validation entirely — submit current values, minus the fields
          // the user cannot currently see.
          const currentState = store.getState();
          const structuredValues = buildSubmitPayload(
            currentState.values as Record<string, unknown>,
            currentState._repeatableConfigs,
            currentState._repeatableOrder,
            formConfigRef.current,
            getConditionValuesRef.current?.() ?? (currentState.values as Record<string, unknown>)
          );

          if (onSubmitRef.current) {
            await onSubmitRef.current(structuredValues);
          }

          state._setSubmitting(false);
          return true;
        }

        // Validate form
        const validationResult = await validateForm();

        // The form this submit was started on has been swapped out from under it
        // — a workflow step transition, typically, while a slow remote validator
        // held this promise. Everything below reads WHATEVER IS CURRENT: the
        // store (now the new step's, freshly reset) and `onSubmitRef.current`
        // (now the new step's handler). Carrying on would submit a form nobody
        // submitted, on the strength of a validation run belonging to a form
        // that is gone — and in a workflow whose new step is the last one, that
        // completes the flow and ships it to the host's backend while the user
        // sits on an untouched, never-validated step.
        //
        // Deliberately does NOT clear `isSubmitting`: that flag now describes
        // the NEW form, whose own submit may already be in flight, and clearing
        // it would make that one re-entrant. The reset that accompanies a swap
        // already returns the flag to false for the new form.
        if (generationRef.current !== generation) {
          return false;
        }

        // A submit is the moment errors are meant to appear, and it has just
        // painted one on every invalid field at once — so mark exactly those
        // fields touched. `touched` is what a renderer gates its error display
        // on (`FieldBinding.touched`, the idiom the API invites) and what
        // change-validation gates on (`FormField`'s handleChange). Without this
        // a refused submit showed NOTHING to such a renderer — a silently
        // rejected form — and left a stale error on screen while the user typed
        // the fix, until they blurred or submitted again.
        const validatedState = store.getState();
        for (const [erroredFieldId, fieldErrors] of Object.entries(validatedState.errors)) {
          if (fieldErrors.length > 0) {
            validatedState._setTouched(erroredFieldId);
          }
        }

        if (!validationResult.isValid && !resolvedOptions.skipInvalid) {
          state._setSubmitting(false);
          return false;
        }

        // Get current values, filtering out invalid fields if skipInvalid
        const currentState = store.getState();
        let valuesToSubmit = currentState.values as Record<string, unknown>;

        if (resolvedOptions.skipInvalid && !validationResult.isValid) {
          const invalidFieldIds = new Set(
            Object.entries(currentState.errors)
              .filter(([, errs]) => errs.length > 0)
              .map(([id]) => id)
          );
          valuesToSubmit = Object.fromEntries(
            Object.entries(valuesToSubmit).filter(([key]) => !invalidFieldIds.has(key))
          );
        }

        // Drop currently-hidden fields, then structure composite keys into
        // authored arrays.
        const structuredValues = buildSubmitPayload(
          valuesToSubmit,
          currentState._repeatableConfigs,
          currentState._repeatableOrder,
          formConfigRef.current,
          getConditionValuesRef.current?.() ?? (currentState.values as Record<string, unknown>)
        );

        // Call onSubmit if provided
        if (onSubmitRef.current) {
          await onSubmitRef.current(structuredValues);
        }

        state._setSubmitting(false);
        return true;
      } catch (error) {
        state._setSubmitting(false);
        // Don't re-throw - submission errors are handled internally
        log.error('Form submission error:', error);
        return false;
      }
    },
    [store, validateForm]
  );

  return {
    submit,
  };
}
