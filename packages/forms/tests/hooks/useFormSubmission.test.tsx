import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFormSubmission } from '../../src/hooks/useFormSubmission';

describe('useFormSubmission', () => {
  it('should prevent submission when validation fails', async () => {
    const mockOnSubmit = vi.fn();
    const mockValidateForm = vi.fn().mockResolvedValue({ isValid: false, errors: [] });
    const mockSetSubmitting = vi.fn();

    const formState = {
      values: { name: 'John' },
      errors: {},
      validationState: {},
      touched: {},
      isDirty: false,
      isSubmitting: false,
      isValid: false,
    };

    const { result } = renderHook(() =>
      useFormSubmission({
        formState,
        onSubmit: mockOnSubmit,
        validateForm: mockValidateForm,
        setSubmitting: mockSetSubmitting,
      })
    );

    let submissionResult: boolean;
    await act(async () => {
      submissionResult = await result.current.submit();
    });

    expect(submissionResult).toBe(false);
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockValidateForm).toHaveBeenCalled();
    expect(mockSetSubmitting).toHaveBeenCalledWith(true);
    expect(mockSetSubmitting).toHaveBeenCalledWith(false);
  });

  it('should successfully submit when validation passes', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockValidateForm = vi.fn().mockResolvedValue({ isValid: true, errors: [] });
    const mockSetSubmitting = vi.fn();

    const formState = {
      values: { name: 'John' },
      errors: {},
      validationState: {},
      touched: {},
      isDirty: false,
      isSubmitting: false,
      isValid: true,
    };

    const { result } = renderHook(() =>
      useFormSubmission({
        formState,
        onSubmit: mockOnSubmit,
        validateForm: mockValidateForm,
        setSubmitting: mockSetSubmitting,
      })
    );

    let submissionResult: boolean;
    await act(async () => {
      submissionResult = await result.current.submit();
    });

    expect(submissionResult).toBe(true);
    expect(mockOnSubmit).toHaveBeenCalledWith({ name: 'John' });
    expect(mockValidateForm).toHaveBeenCalled();
    expect(mockSetSubmitting).toHaveBeenCalledWith(true);
    expect(mockSetSubmitting).toHaveBeenCalledWith(false);
  });

  it('should return true when no onSubmit handler is provided but validation passes', async () => {
    const mockValidateForm = vi.fn().mockResolvedValue({ isValid: true, errors: [] });
    const mockSetSubmitting = vi.fn();

    const formState = {
      values: { name: 'John' },
      errors: {},
      validationState: {},
      touched: {},
      isDirty: false,
      isSubmitting: false,
      isValid: true,
    };

    const { result } = renderHook(() =>
      useFormSubmission({
        formState,
        onSubmit: undefined,
        validateForm: mockValidateForm,
        setSubmitting: mockSetSubmitting,
      })
    );

    let submissionResult: boolean;
    await act(async () => {
      submissionResult = await result.current.submit();
    });

    expect(submissionResult).toBe(true);
    expect(mockValidateForm).toHaveBeenCalled();
    expect(mockSetSubmitting).toHaveBeenCalledWith(true);
    expect(mockSetSubmitting).toHaveBeenCalledWith(false);
  });

  it('should handle submission errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockOnSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'));
    const mockValidateForm = vi.fn().mockResolvedValue({ isValid: true, errors: [] });
    const mockSetSubmitting = vi.fn();

    const formState = {
      values: { name: 'John' },
      errors: {},
      validationState: {},
      touched: {},
      isDirty: false,
      isSubmitting: false,
      isValid: true,
    };

    const { result } = renderHook(() =>
      useFormSubmission({
        formState,
        onSubmit: mockOnSubmit,
        validateForm: mockValidateForm,
        setSubmitting: mockSetSubmitting,
      })
    );

    let submissionResult: boolean;
    await act(async () => {
      submissionResult = await result.current.submit();
    });

    expect(submissionResult).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error during form submission:',
      expect.any(Error)
    );
    expect(mockSetSubmitting).toHaveBeenCalledWith(true);
    expect(mockSetSubmitting).toHaveBeenCalledWith(false);

    consoleErrorSpy.mockRestore();
  });
});
