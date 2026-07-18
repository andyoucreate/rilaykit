import type {
  FieldConditions,
  FieldError,
  FormState,
  RepeatableFieldConfig,
  ValidationState,
} from '@rilaykit/core';
import { getOwn } from '@rilaykit/core';
import { subscribeWithSelector } from 'zustand/middleware';
// `zustand/vanilla`, NOT `zustand`: the main entry pulls React (its `create`/
// `useStore` hooks), which would reintroduce React into this isomorphic module.
import { createStore } from 'zustand/vanilla';
import { buildCompositeKey, initializeRepeatableState } from '../utils/repeatable-data';

// =================================================================
// STORE STATE & ACTIONS
// =================================================================

export interface FormStoreState extends FormState {
  // Internal state
  _defaultValues: Record<string, unknown>;
  _fieldConditions: Record<string, FieldConditions>;
  // Dynamic props overrides (set by field effects via setProps)
  _fieldProps: Record<string, Record<string, unknown>>;

  // Repeatable state
  _repeatableConfigs: Record<string, RepeatableFieldConfig>;
  _repeatableOrder: Record<string, string[]>;
  _repeatableNextKey: Record<string, number>;

  // Actions (internal - exposed via FormActions interface)
  _setValue: (fieldId: string, value: unknown) => void;
  _setTouched: (fieldId: string) => void;
  _setErrors: (fieldId: string, errors: FieldError[]) => void;
  _clearErrors: (fieldId: string) => void;
  _setValidationState: (fieldId: string, state: ValidationState) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _reset: (values?: Record<string, unknown>, repeatableOrder?: Record<string, string[]>) => void;
  /**
   * Replace the default-values baseline. Called when the mounted form's
   * identity changes so `reset()` (no args) and the per-field dirty flag
   * (`value !== _defaultValues[fieldId]`) track the CURRENT form, not the
   * previous one whose defaults were frozen at store creation.
   */
  _setDefaultValues: (values: Record<string, unknown>) => void;
  _setFieldConditions: (fieldId: string, conditions: FieldConditions) => void;
  _setFieldProps: (fieldId: string, props: Record<string, unknown>) => void;
  _updateIsValid: () => void;

  // Repeatable actions
  _setRepeatableConfig: (id: string, config: RepeatableFieldConfig) => void;
  _appendRepeatableItem: (
    repeatableId: string,
    defaultValue?: Record<string, unknown>
  ) => string | null;
  _removeRepeatableItem: (repeatableId: string, key: string) => boolean;
  _moveRepeatableItem: (repeatableId: string, fromIndex: number, toIndex: number) => void;
  _insertRepeatableItem: (
    repeatableId: string,
    index: number,
    defaultValue?: Record<string, unknown>
  ) => string | null;
}

// =================================================================
// STORE FACTORY
// =================================================================

export type FormStore = ReturnType<typeof createFormStore>;

/** The data members of a form store — everything that is state rather than behaviour. */
export type FormStoreData = Omit<
  FormStoreState,
  {
    [K in keyof FormStoreState]: FormStoreState[K] extends (...args: never[]) => unknown
      ? K
      : never;
  }[keyof FormStoreState]
>;

/**
 * Every DATA member of a form store at its birth value: the single definition of
 * "a form nobody has touched yet".
 *
 * `_reset` is BUILT FROM THIS, rather than from a hand-written list of members to
 * clear, and the inversion is the whole point: RESET IS THE DEFAULT, PRESERVE IS
 * OPT-IN. A member added to `FormStoreState` tomorrow has to be added here for
 * the store to typecheck at all, and it is then reset for free.
 *
 * Under the hand-list this replaces, the incentive ran exactly backwards: a new
 * member was PRESERVED for free — it silently survived every `reset()` and every
 * form swap, and nothing in the type system objected. That was not hypothetical.
 * `_fieldConditions` was missing from the list, so on a workflow step transition
 * a field that declared NO conditions inherited the previous step's stored
 * `visible: false` and rendered nothing at all: an unfillable step, from two
 * ordinary steps that happened to share a field id.
 */
function createInitialFormData(initialValues: Record<string, unknown> = {}): FormStoreData {
  return {
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
    _fieldProps: {},

    // Repeatable state
    _repeatableConfigs: {},
    _repeatableOrder: {},
    _repeatableNextKey: {},
  };
}

export function createFormStore(initialValues: Record<string, unknown> = {}) {
  return createStore<FormStoreState>()(
    subscribeWithSelector((set, get) => ({
      ...createInitialFormData(initialValues),

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

      _reset: (values, repeatableOrder) => {
        const state = get();
        const resetValues = values ?? state._defaultValues;

        // Rebuild the repeatable order + next-keys from the reset values so rows
        // (and their default/min items) survive a reset instead of vanishing.
        // A caller-supplied `repeatableOrder` re-sequences them: key insertion
        // order cannot express a reorder the user performed.
        const {
          values: rebuiltValues,
          order,
          nextKeys,
        } = initializeRepeatableState(resetValues, state._repeatableConfigs, repeatableOrder);

        set({
          // Reset is the DEFAULT: start from a form nobody has touched.
          ...createInitialFormData(),

          // Then carry over ONLY what a reset must not destroy — each named with
          // its reason. These are the mounted form's IDENTITY, installed by the
          // mounting layer, never authored by the user: `_defaultValues` is the
          // baseline a no-arg `reset()` restores to and that `isDirty` compares
          // against, and `_repeatableConfigs` is the shape this form was mounted
          // with (which `initializeRepeatableState` above has just read).
          _defaultValues: state._defaultValues,
          _repeatableConfigs: state._repeatableConfigs,

          // ...plus what this reset just computed.
          values: { ...rebuiltValues },
          _repeatableOrder: order,
          _repeatableNextKey: nextKeys,
        });
      },

      _setDefaultValues: (values) => {
        set({ _defaultValues: { ...values } });
      },

      _setFieldConditions: (fieldId, conditions) => {
        set((state) => ({
          _fieldConditions: {
            ...state._fieldConditions,
            [fieldId]: conditions,
          },
        }));
      },

      _setFieldProps: (fieldId, props) => {
        set((state) => ({
          _fieldProps: {
            ...state._fieldProps,
            [fieldId]: { ...(getOwn(state._fieldProps, fieldId) ?? {}), ...props },
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
        const config = getOwn(state._repeatableConfigs, repeatableId);
        if (!config) return null;

        const currentOrder = getOwn(state._repeatableOrder, repeatableId) ?? [];
        if (config.max !== undefined && currentOrder.length >= config.max) return null;

        const nextKeyNum = getOwn(state._repeatableNextKey, repeatableId) ?? 0;
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
        const config = getOwn(state._repeatableConfigs, repeatableId);
        if (!config) return false;

        const currentOrder = getOwn(state._repeatableOrder, repeatableId) ?? [];
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
        const currentOrder = getOwn(state._repeatableOrder, repeatableId);
        if (!currentOrder) return;
        if (fromIndex < 0 || fromIndex >= currentOrder.length) return;
        if (toIndex < 0 || toIndex >= currentOrder.length) return;
        if (fromIndex === toIndex) return;

        const newOrder = [...currentOrder];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);

        set({
          isDirty: true,
          _repeatableOrder: {
            ...state._repeatableOrder,
            [repeatableId]: newOrder,
          },
        });
      },

      _insertRepeatableItem: (repeatableId, index, defaultValue) => {
        const state = get();
        const config = getOwn(state._repeatableConfigs, repeatableId);
        if (!config) return null;

        const currentOrder = getOwn(state._repeatableOrder, repeatableId) ?? [];
        if (config.max !== undefined && currentOrder.length >= config.max) return null;

        const nextKeyNum = getOwn(state._repeatableNextKey, repeatableId) ?? 0;
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
