import type { ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { FormStore } from '../stores';
import { structureFormValues } from '../utils/repeatable-data';

export interface UseFormSubmissionWithStoreProps {
  store: FormStore;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  validateForm: () => Promise<ValidationResult>;
}

export function useFormSubmissionWithStore({
  store,
  onSubmit,
  validateForm,
}: UseFormSubmissionWithStoreProps) {
  // Use ref to store current onSubmit callback
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const submit = useCallback(
    async (event?: React.FormEvent): Promise<boolean> => {
      // Prevent default form submission
      event?.preventDefault();

      const state = store.getState();

      // Don't submit if already submitting
      if (state.isSubmitting) {
        return false;
      }

      state._setSubmitting(true);

      try {
        // Validate form first
        const validationResult = await validateForm();

        if (!validationResult.isValid) {
          state._setSubmitting(false);
          return false;
        }

        // Get current values and structure them (flatten composite keys into arrays)
        const currentState = store.getState();
        const hasRepeatables = Object.keys(currentState._repeatableConfigs).length > 0;
        const structuredValues = hasRepeatables
          ? structureFormValues(
              currentState.values as Record<string, unknown>,
              currentState._repeatableConfigs,
              currentState._repeatableOrder
            )
          : (currentState.values as Record<string, unknown>);

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
