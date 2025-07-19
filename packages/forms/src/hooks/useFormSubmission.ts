import type { ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { FormState } from './useFormState';

export interface UseFormSubmissionProps {
  formState: FormState;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  validateForm: () => Promise<ValidationResult>;
  setSubmitting: (isSubmitting: boolean) => void;
}

export function useFormSubmission({
  formState,
  onSubmit,
  validateForm,
  setSubmitting,
}: UseFormSubmissionProps) {
  // Use ref to avoid recreating callbacks when onSubmit changes
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const submit = useCallback(
    async (event?: React.FormEvent): Promise<boolean> => {
      event?.preventDefault();

      try {
        setSubmitting(true);

        // Always validate the form before submission
        const validationResult = await validateForm();

        // If validation fails, don't proceed with submission
        if (!validationResult.isValid) {
          return false;
        }

        if (!onSubmitRef.current) {
          return true;
        }

        await onSubmitRef.current(formState.values);
        return true;
      } catch (error) {
        // Log any unexpected errors from onSubmit
        console.error('Error during form submission:', error);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [formState.values, validateForm, setSubmitting]
  );

  return {
    submit,
  };
}
