import type { SubmitOptions, ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { structureFormValues } from '../utils/repeatable-data';

export interface UseFormSubmissionWithStoreProps {
  store: FormStore;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  validateForm: () => Promise<ValidationResult>;
  defaultSubmitOptions?: SubmitOptions;
}

function isFormEvent(value: unknown): value is React.FormEvent {
  return typeof value === 'object' && value !== null && 'preventDefault' in value;
}

export function useFormSubmissionWithStore({
  store,
  onSubmit,
  validateForm,
  defaultSubmitOptions,
}: UseFormSubmissionWithStoreProps) {
  // Use ref to store current onSubmit callback
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const defaultSubmitOptionsRef = useRef(defaultSubmitOptions);
  defaultSubmitOptionsRef.current = defaultSubmitOptions;

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
        console.error('Form submission error:', error);
        return false;
      }
    },
    [store, validateForm]
  );

  return {
    submit,
  };
}
