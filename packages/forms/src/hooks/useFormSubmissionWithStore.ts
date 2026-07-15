import { getLogger } from '@rilaykit/core';
import type { SubmitOptions, ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { structureFormValues } from '../utils/repeatable-data';

const log = getLogger('forms:submission');

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
}: UseFormSubmissionWithStoreProps) {
  // Use ref to store current onSubmit callback
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const defaultSubmitOptionsRef = useRef(defaultSubmitOptions);
  defaultSubmitOptionsRef.current = defaultSubmitOptions;

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
          // Skip validation entirely — submit current values as-is
          const currentState = store.getState();
          const hasRepeatables = Object.keys(currentState._repeatableConfigs).length > 0;
          const structuredValues = hasRepeatables
            ? structureFormValues(
                currentState.values as Record<string, unknown>,
                currentState._repeatableConfigs,
                currentState._repeatableOrder
              )
            : (currentState.values as Record<string, unknown>);

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

        // Structure values (flatten composite keys into arrays)
        const hasRepeatables = Object.keys(currentState._repeatableConfigs).length > 0;
        const structuredValues = hasRepeatables
          ? structureFormValues(
              valuesToSubmit,
              currentState._repeatableConfigs,
              currentState._repeatableOrder
            )
          : valuesToSubmit;

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
