import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFormState } from '../../src/hooks/useFormState';

describe('useFormState', () => {
  it('should initialize with default values', () => {
    const defaultValues = { name: 'John', email: 'john@example.com' };
    const { result } = renderHook(() => useFormState({ defaultValues }));

    expect(result.current.formState.values).toEqual(defaultValues);
    expect(result.current.formState.errors).toEqual({});
    expect(result.current.formState.isDirty).toBe(false);
    expect(result.current.formState.isSubmitting).toBe(false);
    expect(result.current.isFormValid()).toBe(true);
  });

  it('should update field value and mark form as dirty', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    act(() => {
      result.current.setValue('name', 'John');
    });

    expect(result.current.formState.values.name).toBe('John');
    expect(result.current.formState.isDirty).toBe(true);
  });

  it('should call onFieldChange when field value changes', () => {
    const onFieldChange = vi.fn();
    const { result } = renderHook(() =>
      useFormState({
        defaultValues: {},
        onFieldChange,
      })
    );

    act(() => {
      result.current.setValue('email', 'john@example.com');
    });

    expect(onFieldChange).toHaveBeenCalledWith('email', 'john@example.com', {
      email: 'john@example.com',
    });
  });

  it('should set field as touched', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    act(() => {
      result.current.setFieldTouched('name');
    });

    expect(result.current.formState.touched.name).toBe(true);
  });

  it('should reset form state', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    // First make some changes
    act(() => {
      result.current.setValue('name', 'John');
      result.current.setFieldTouched('name');
    });

    expect(result.current.formState.isDirty).toBe(true);

    // Then reset
    act(() => {
      result.current.reset({ name: 'Jane' });
    });

    expect(result.current.formState.values.name).toBe('Jane');
    expect(result.current.formState.touched).toEqual({});
    expect(result.current.formState.isDirty).toBe(false);
  });

  it('should set and clear errors', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    const errors = [{ message: 'Required field', code: 'REQUIRED' }];

    act(() => {
      result.current.setError('name', errors);
    });

    expect(result.current.formState.errors.name).toEqual(errors);

    act(() => {
      result.current.clearError('name');
    });

    expect(result.current.formState.errors.name).toEqual([]);
  });

  it('should correctly determine form validity', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    // Form should be valid initially
    expect(result.current.isFormValid()).toBe(true);

    // Add an error
    act(() => {
      result.current.setError('name', [{ message: 'Error', code: 'ERROR' }]);
    });

    expect(result.current.isFormValid()).toBe(false);

    // Clear error
    act(() => {
      result.current.clearError('name');
    });

    expect(result.current.isFormValid()).toBe(true);
  });

  it('should set form validation state', () => {
    const { result } = renderHook(() => useFormState({ defaultValues: {} }));

    act(() => {
      result.current.setFieldValidationState('name', 'validating');
    });

    expect(result.current.formState.validationState.name).toBe('validating');

    act(() => {
      result.current.setFieldValidationState('name', 'valid');
    });

    expect(result.current.formState.validationState.name).toBe('valid');
  });
});
