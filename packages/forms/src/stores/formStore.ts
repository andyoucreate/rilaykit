import type {
  FieldConditions,
  FieldState,
  FormState,
  RepeatableFieldConfig,
  ValidationError,
  ValidationState,
} from '@rilaykit/core';
import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { buildCompositeKey } from '../utils/repeatable-data';

// =================================================================
// STORE STATE & ACTIONS
// =================================================================

export interface FormStoreState extends FormState {
  // Internal state
  _defaultValues: Record<string, unknown>;
  _fieldConditions: Record<string, FieldConditions>;

  // Repeatable state
  _repeatableConfigs: Record<string, RepeatableFieldConfig>;
  _repeatableOrder: Record<string, string[]>;
  _repeatableNextKey: Record<string, number>;

  // Actions (internal - exposed via FormActions interface)
  _setValue: (fieldId: string, value: unknown) => void;
  _setTouched: (fieldId: string) => void;
  _setErrors: (fieldId: string, errors: ValidationError[]) => void;
  _clearErrors: (fieldId: string) => void;
  _setValidationState: (fieldId: string, state: ValidationState) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _reset: (values?: Record<string, unknown>) => void;
  _setFieldConditions: (fieldId: string, conditions: FieldConditions) => void;
  _updateIsValid: () => void;

  // Repeatable actions
  _setRepeatableConfig: (id: string, config: RepeatableFieldConfig) => void;
  _appendRepeatableItem: (repeatableId: string, defaultValue?: Record<string, unknown>) => string | null;
  _removeRepeatableItem: (repeatableId: string, key: string) => boolean;
  _moveRepeatableItem: (repeatableId: string, fromIndex: number, toIndex: number) => void;
  _insertRepeatableItem: (repeatableId: string, index: number, defaultValue?: Record<string, unknown>) => string | null;
}

// =================================================================
// STORE FACTORY
// =================================================================

export type FormStore = ReturnType<typeof createFormStore>;

export function createFormStore(initialValues: Record<string, unknown> = {}) {
  return createStore<FormStoreState>()(
    subscribeWithSelector((set, get) => ({
      // Initial state
      values: { ...initialValues },
      errors: {},
      validationStates: {},
      touched: {},
      isDirty: false,
      isSubmitting: false,
      isValid: true,

      // Internal state
      _defaultValues: { ...initialValues },
      _fieldConditions: {},

      // Repeatable state
      _repeatableConfigs: {},
      _repeatableOrder: {},
      _repeatableNextKey: {},

      // Actions
      _setValue: (fieldId, value) => {
        set((state) => {
          const newValues = { ...state.values, [fieldId]: value };
          return {
            values: newValues,
            isDirty: true,
          };
        });
      },

      _setTouched: (fieldId) => {
        set((state) => ({
          touched: { ...state.touched, [fieldId]: true },
        }));
      },

      _setErrors: (fieldId, errors) => {
        set((state) => {
          const newErrors = { ...state.errors, [fieldId]: errors };
          const newValidationState: ValidationState = errors.length > 0 ? 'invalid' : 'valid';

          return {
            errors: newErrors,
            validationStates: {
              ...state.validationStates,
              [fieldId]: newValidationState,
            },
          };
        });

        // Update global isValid after setting errors
        get()._updateIsValid();
      },

      _clearErrors: (fieldId) => {
        set((state) => {
          const newErrors = { ...state.errors };
          delete newErrors[fieldId];

          return {
            errors: newErrors,
            validationStates: {
              ...state.validationStates,
              [fieldId]: 'idle',
            },
          };
        });

        get()._updateIsValid();
      },

      _setValidationState: (fieldId, validationState) => {
        set((state) => ({
          validationStates: {
            ...state.validationStates,
            [fieldId]: validationState,
          },
        }));
      },

      _setSubmitting: (isSubmitting) => {
        set({ isSubmitting });
      },

      _reset: (values) => {
        const resetValues = values ?? get()._defaultValues;
        set({
          values: { ...resetValues },
          errors: {},
          validationStates: {},
          touched: {},
          isDirty: false,
          isSubmitting: false,
          isValid: true,
          _repeatableOrder: {},
          _repeatableNextKey: {},
        });
      },

      _setFieldConditions: (fieldId, conditions) => {
        set((state) => ({
          _fieldConditions: {
            ...state._fieldConditions,
            [fieldId]: conditions,
          },
        }));
      },

      _updateIsValid: () => {
        const state = get();
        const hasErrors = Object.values(state.errors).some(
          (fieldErrors) => fieldErrors && fieldErrors.length > 0
        );
        const hasInvalidFields = Object.values(state.validationStates).some((s) => s === 'invalid');
        set({ isValid: !hasErrors && !hasInvalidFields });
      },

      // Repeatable actions
      _setRepeatableConfig: (id, config) => {
        set((state) => ({
          _repeatableConfigs: { ...state._repeatableConfigs, [id]: config },
        }));
      },

      _appendRepeatableItem: (repeatableId, defaultValue) => {
        const state = get();
        const config = state._repeatableConfigs[repeatableId];
        if (!config) return null;

        const currentOrder = state._repeatableOrder[repeatableId] ?? [];
        if (config.max !== undefined && currentOrder.length >= config.max) return null;

        const nextKeyNum = state._repeatableNextKey[repeatableId] ?? 0;
        const itemKey = `k${nextKeyNum}`;
        const itemDefaults = defaultValue ?? config.defaultValue ?? {};

        // Set values for the new item
        const newValues = { ...state.values };
        for (const field of config.allFields) {
          const compositeKey = buildCompositeKey(repeatableId, itemKey, field.id);
          newValues[compositeKey] = itemDefaults[field.id] ?? undefined;
        }

        set({
          values: newValues,
          isDirty: true,
          _repeatableOrder: {
            ...state._repeatableOrder,
            [repeatableId]: [...currentOrder, itemKey],
          },
          _repeatableNextKey: {
            ...state._repeatableNextKey,
            [repeatableId]: nextKeyNum + 1,
          },
        });

        return itemKey;
      },

      _removeRepeatableItem: (repeatableId, key) => {
        const state = get();
        const config = state._repeatableConfigs[repeatableId];
        if (!config) return false;

        const currentOrder = state._repeatableOrder[repeatableId] ?? [];
        if (config.min !== undefined && currentOrder.length <= config.min) return false;
        if (!currentOrder.includes(key)) return false;

        // Remove the key from order
        const newOrder = currentOrder.filter((k) => k !== key);

        // Clean up store entries for this item
        const newValues = { ...state.values };
        const newErrors = { ...state.errors };
        const newValidationStates = { ...state.validationStates };
        const newTouched = { ...state.touched };
        const newFieldConditions = { ...state._fieldConditions };

        for (const field of config.allFields) {
          const compositeKey = buildCompositeKey(repeatableId, key, field.id);
          delete newValues[compositeKey];
          delete newErrors[compositeKey];
          delete newValidationStates[compositeKey];
          delete newTouched[compositeKey];
          delete newFieldConditions[compositeKey];
        }

        set({
          values: newValues,
          errors: newErrors,
          validationStates: newValidationStates,
          touched: newTouched,
          isDirty: true,
          _fieldConditions: newFieldConditions,
          _repeatableOrder: {
            ...state._repeatableOrder,
            [repeatableId]: newOrder,
          },
        });

        get()._updateIsValid();
        return true;
      },

      _moveRepeatableItem: (repeatableId, fromIndex, toIndex) => {
        const state = get();
        const currentOrder = state._repeatableOrder[repeatableId];
        if (!currentOrder) return;
        if (fromIndex < 0 || fromIndex >= currentOrder.length) return;
        if (toIndex < 0 || toIndex >= currentOrder.length) return;
        if (fromIndex === toIndex) return;

        const newOrder = [...currentOrder];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);

        set({
          _repeatableOrder: {
            ...state._repeatableOrder,
            [repeatableId]: newOrder,
          },
        });
      },

      _insertRepeatableItem: (repeatableId, index, defaultValue) => {
        const state = get();
        const config = state._repeatableConfigs[repeatableId];
        if (!config) return null;

        const currentOrder = state._repeatableOrder[repeatableId] ?? [];
        if (config.max !== undefined && currentOrder.length >= config.max) return null;

        const nextKeyNum = state._repeatableNextKey[repeatableId] ?? 0;
        const itemKey = `k${nextKeyNum}`;
        const itemDefaults = defaultValue ?? config.defaultValue ?? {};

        // Set values for the new item
        const newValues = { ...state.values };
        for (const field of config.allFields) {
          const compositeKey = buildCompositeKey(repeatableId, itemKey, field.id);
          newValues[compositeKey] = itemDefaults[field.id] ?? undefined;
        }

        // Insert at the specified index
        const newOrder = [...currentOrder];
        const clampedIndex = Math.max(0, Math.min(index, newOrder.length));
        newOrder.splice(clampedIndex, 0, itemKey);

        set({
          values: newValues,
          isDirty: true,
          _repeatableOrder: {
            ...state._repeatableOrder,
            [repeatableId]: newOrder,
          },
          _repeatableNextKey: {
            ...state._repeatableNextKey,
            [repeatableId]: nextKeyNum + 1,
          },
        });

        return itemKey;
      },
    }))
  );
}

// =================================================================
// REACT CONTEXT
// =================================================================

export const FormStoreContext = createContext<FormStore | null>(null);

/**
 * Get the form store from context
 * @throws Error if used outside of FormProvider
 */
export function useFormStore(): FormStore {
  const store = useContext(FormStoreContext);
  if (!store) {
    throw new Error('useFormStore must be used within a FormProvider');
  }
  return store;
}

// =================================================================
// GRANULAR SELECTORS
// =================================================================

// Stable empty array references
const EMPTY_FIELD_ERRORS: ValidationError[] = [];

/**
 * Select a single field value - re-renders only when this field's value changes
 */
export function useFieldValue<T = unknown>(fieldId: string): T {
  const store = useFormStore();
  return useStore(store, (state) => state.values[fieldId] as T);
}

/**
 * Select field errors - re-renders only when this field's errors change
 */
export function useFieldErrors(fieldId: string): ValidationError[] {
  const store = useFormStore();
  return useStore(store, (state) => state.errors[fieldId] ?? EMPTY_FIELD_ERRORS);
}

/**
 * Select field touched state - re-renders only when this field's touched state changes
 */
export function useFieldTouched(fieldId: string): boolean {
  const store = useFormStore();
  return useStore(store, (state) => state.touched[fieldId] ?? false);
}

/**
 * Select field validation state - re-renders only when this field's validation state changes
 */
export function useFieldValidationState(fieldId: string): ValidationState {
  const store = useFormStore();
  return useStore(store, (state) => state.validationStates[fieldId] ?? 'idle');
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
  return useStore(store, (state) => state._fieldConditions[fieldId] ?? DEFAULT_FIELD_CONDITIONS);
}

/**
 * Select complete field state - uses individual selectors to avoid object recreation
 */
export function useFieldState(fieldId: string): FieldState {
  const store = useFormStore();

  // Use individual selectors to avoid creating new objects
  const value = useStore(store, (state) => state.values[fieldId]);
  const errors = useStore(store, (state) => state.errors[fieldId] ?? EMPTY_FIELD_ERRORS);
  const validationState = useStore(
    store,
    (state) => (state.validationStates[fieldId] ?? 'idle') as ValidationState
  );
  const touched = useStore(store, (state) => state.touched[fieldId] ?? false);
  const defaultValue = useStore(store, (state) => state._defaultValues[fieldId]);

  return {
    value,
    errors,
    validationState,
    touched,
    dirty: value !== defaultValue,
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
  return useStore(store, (state) => state._repeatableOrder[repeatableId] ?? EMPTY_KEYS);
}

// =================================================================
// ACTION HOOKS
// =================================================================

export interface UseFieldActionsResult {
  setValue: (value: unknown) => void;
  setTouched: () => void;
  setErrors: (errors: ValidationError[]) => void;
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
    setErrors: (errors: ValidationError[]) => store.getState()._setErrors(fieldId, errors),
    clearErrors: () => store.getState()._clearErrors(fieldId),
    setValidationState: (state: ValidationState) =>
      store.getState()._setValidationState(fieldId, state),
  };
}

export interface UseFormActionsResult {
  setValue: (fieldId: string, value: unknown) => void;
  setTouched: (fieldId: string) => void;
  setErrors: (fieldId: string, errors: ValidationError[]) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  reset: (values?: Record<string, unknown>) => void;
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
    setErrors: (fieldId: string, errors: ValidationError[]) =>
      store.getState()._setErrors(fieldId, errors),
    setSubmitting: (isSubmitting: boolean) => store.getState()._setSubmitting(isSubmitting),
    reset: (values?: Record<string, unknown>) => store.getState()._reset(values),
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
