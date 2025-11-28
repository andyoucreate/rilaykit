import type { ValidationResult } from '@rilaykit/core';
import type React from 'react';
import { useCallback, useRef } from 'react';

export interface UseFormSubmissionProps {
  valuesRef: React.MutableRefObject<Record<string, any>>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  validateForm: () => Promise<ValidationResult>;
  setSubmitting: (isSubmitting: boolean) => void;
}

export function useFormSubmission({
  valuesRef,
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

        // CRITICAL FIX: Read from valuesRef.current to get the most recent values
        // This ensures that even if submit() is called synchronously after setValue(),
        // we always submit the latest values, not stale closure values
        await onSubmitRef.current(valuesRef.current);
        return true;
      } catch (error) {
        // Log any unexpected errors from onSubmit
        console.error('Error during form submission:', error);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [valuesRef, validateForm, setSubmitting]
  );

  return {
    submit,
  };
}
