'use client';

import type { FieldConditions, FieldError, FieldState, ValidationState } from '@rilaykit/core';
import { ConfigurationError, FORM_LEVEL_ERROR_KEY, getOwn } from '@rilaykit/core';
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { FormStore } from './formStore';

// =================================================================
// REACT CONTEXT
// =================================================================

export const FormStoreContext = createContext<FormStore | null>(null);

/**
 * Get the form store from context
 * @throws ConfigurationError if used outside of FormProvider
 */
export function useFormStore(): FormStore {
  const store = useContext(FormStoreContext);
  if (!store) {
    throw new ConfigurationError('useFormStore must be used within a FormProvider');
  }
  return store;
}

// =================================================================
// GRANULAR SELECTORS
// =================================================================

// Stable empty array references
const EMPTY_FIELD_ERRORS: FieldError[] = [];

/**
 * Select a single field value - re-renders only when this field's value changes
 */
export function useFieldValue<T = unknown>(fieldId: string): T {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state.values, fieldId) as T);
}

/**
 * Select field errors - re-renders only when this field's errors change
 */
export function useFieldErrors(fieldId: string): FieldError[] {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state.errors, fieldId) ?? EMPTY_FIELD_ERRORS);
}

/**
 * Select the form-level (cross-field) errors — the reserved `__form__` bucket,
 * holding form validation issues that target no specific field (a whole-form
 * message, or a path matching no live field). Mirrors `useFieldErrors`; returns
 * a stable empty array when there are none. Field-targeted cross-field issues
 * are routed onto their fields and surface through `useFieldErrors(id)` instead.
 */
export function useFormErrors(): FieldError[] {
  const store = useFormStore();
  return useStore(
    store,
    (state) => getOwn(state.errors, FORM_LEVEL_ERROR_KEY) ?? EMPTY_FIELD_ERRORS
  );
}

/**
 * Select field touched state - re-renders only when this field's touched state changes
 */
export function useFieldTouched(fieldId: string): boolean {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state.touched, fieldId) ?? false);
}

/**
 * Select field validation state - re-renders only when this field's validation state changes
 */
export function useFieldValidationState(fieldId: string): ValidationState {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state.validationStates, fieldId) ?? 'idle');
}

/**
 * Default field conditions (stable reference)
 */
const DEFAULT_FIELD_CONDITIONS: FieldConditions = {
  visible: true,
  disabled: false,
  required: false,
  readonly: false,
};

/**
 * Select field conditions - re-renders only when this field's conditions change
 */
export function useFieldConditions(fieldId: string): FieldConditions {
  const store = useFormStore();
  return useStore(
    store,
    (state) => getOwn(state._fieldConditions, fieldId) ?? DEFAULT_FIELD_CONDITIONS
  );
}

/**
 * Stable empty object for field props
 */
const EMPTY_FIELD_PROPS: Record<string, unknown> = {};

/**
 * Select dynamic props for a field - re-renders only when this field's dynamic props change
 */
export function useFieldProps(fieldId: string): Record<string, unknown> {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state._fieldProps, fieldId) ?? EMPTY_FIELD_PROPS);
}

/**
 * Select complete field state - uses individual selectors to avoid object recreation
 */
export function useFieldState(fieldId: string): FieldState {
  const store = useFormStore();

  // Use individual selectors to avoid creating new objects
  const value = useStore(store, (state) => getOwn(state.values, fieldId));
  const errors = useStore(store, (state) => getOwn(state.errors, fieldId) ?? EMPTY_FIELD_ERRORS);
  const validationState = useStore(
    store,
    (state) => (getOwn(state.validationStates, fieldId) ?? 'idle') as ValidationState
  );
  const touched = useStore(store, (state) => getOwn(state.touched, fieldId) ?? false);
  // Own-property only, like every sibling selector above: a field named
  // `toString` would otherwise resolve Object.prototype's method as its default
  // and report the pristine field as permanently dirty.
  const defaultValue = useStore(store, (state) => getOwn(state._defaultValues, fieldId));

  return {
    value,
    errors,
    validationState,
    touched,
    // `!Object.is`, not `!==`: a field defaulting to NaN would otherwise report
    // `dirty` forever (NaN !== NaN), misfiring an unsaved-changes guard on a
    // pristine form. Object.is(NaN, NaN) is true; the only other difference,
    // -0 vs 0, is a more-correct dirty signal, not a regression.
    dirty: !Object.is(value, defaultValue),
  };
}

/**
 * Select form submitting state
 */
export function useFormSubmitting(): boolean {
  const store = useFormStore();

  return useStore(store, (state) => state.isSubmitting);
}

/**
 * Select form valid state
 */
export function useFormValid(): boolean {
  const store = useFormStore();

  return useStore(store, (state) => state.isValid);
}

/**
 * Select form dirty state
 */
export function useFormDirty(): boolean {
  const store = useFormStore();

  return useStore(store, (state) => state.isDirty);
}

/**
 * Select all form values - uses shallow comparison
 */
export function useFormValues(): Record<string, unknown> {
  const store = useFormStore();

  return useStore(store, (state) => state.values);
}

/**
 * Select form state for submit button - minimal re-renders
 */
export function useFormSubmitState(): {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
} {
  const store = useFormStore();
  // Use individual selectors to avoid object recreation
  const isSubmitting = useStore(store, (state) => state.isSubmitting);
  const isValid = useStore(store, (state) => state.isValid);
  const isDirty = useStore(store, (state) => state.isDirty);

  return { isSubmitting, isValid, isDirty };
}

// Stable empty array for repeatable keys
const EMPTY_KEYS: string[] = [];

/**
 * Select ordered keys for a repeatable field — re-renders when the order changes
 */
export function useRepeatableKeys(repeatableId: string): string[] {
  const store = useFormStore();
  return useStore(store, (state) => getOwn(state._repeatableOrder, repeatableId) ?? EMPTY_KEYS);
}

// =================================================================
// ACTION HOOKS
// =================================================================

export interface UseFieldActionsResult {
  setValue: (value: unknown) => void;
  setTouched: () => void;
  setErrors: (errors: FieldError[]) => void;
  clearErrors: () => void;
  setValidationState: (state: ValidationState) => void;
}

/**
 * Get stable action references for a field
 * Actions don't cause re-renders
 */
export function useFieldActions(fieldId: string): UseFieldActionsResult {
  const store = useFormStore();

  // Actions are stable - they don't change between renders
  return {
    setValue: (value: unknown) => store.getState()._setValue(fieldId, value),
    setTouched: () => store.getState()._setTouched(fieldId),
    setErrors: (errors: FieldError[]) => store.getState()._setErrors(fieldId, errors),
    clearErrors: () => store.getState()._clearErrors(fieldId),
    setValidationState: (state: ValidationState) =>
      store.getState()._setValidationState(fieldId, state),
  };
}

export interface UseFormActionsResult {
  setValue: (fieldId: string, value: unknown) => void;
  setTouched: (fieldId: string) => void;
  setErrors: (fieldId: string, errors: FieldError[]) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  reset: (values?: Record<string, unknown>, repeatableOrder?: Record<string, string[]>) => void;
  setFieldConditions: (fieldId: string, conditions: FieldConditions) => void;
}

/**
 * Get stable form-level action references
 * Actions don't cause re-renders
 */
export function useFormActions(): UseFormActionsResult {
  const store = useFormStore();

  return {
    setValue: (fieldId: string, value: unknown) => store.getState()._setValue(fieldId, value),
    setTouched: (fieldId: string) => store.getState()._setTouched(fieldId),
    setErrors: (fieldId: string, errors: FieldError[]) =>
      store.getState()._setErrors(fieldId, errors),
    setSubmitting: (isSubmitting: boolean) => store.getState()._setSubmitting(isSubmitting),
    reset: (values?: Record<string, unknown>, repeatableOrder?: Record<string, string[]>) =>
      store.getState()._reset(values, repeatableOrder),
    setFieldConditions: (fieldId: string, conditions: FieldConditions) =>
      store.getState()._setFieldConditions(fieldId, conditions),
  };
}

/**
 * Get the raw store for advanced use cases (like validation hooks)
 */
export function useFormStoreApi(): FormStore {
  return useFormStore();
}
