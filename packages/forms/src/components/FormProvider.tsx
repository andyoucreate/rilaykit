import type {
  FieldConditions,
  FormConfiguration,
  SubmitOptions,
  ValidationResult,
} from '@rilaykit/core';
import { ConfigurationError } from '@rilaykit/core';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EffectEngine } from '../effects/effect-engine';
import { type UseFormConditionsReturn, useFormConditions } from '../hooks';
import { useFormSubmissionWithStore } from '../hooks/useFormSubmissionWithStore';
import { useFormValidationWithStore } from '../hooks/useFormValidationWithStore';
import { FormStoreContext, createFormStore } from '../stores';
import { holdsOnlyConditionalRequiredError } from '../utils/conditional-required';
import { initializeRepeatableState } from '../utils/repeatable-data';

// =================================================================
// FORM CONFIG CONTEXT
// =================================================================

export interface FormConfigContextValue {
  formConfig: FormConfiguration;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  validateField: (fieldId: string, value?: unknown) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  submit: (eventOrOptions?: React.FormEvent | SubmitOptions) => Promise<boolean>;
}

const FormConfigContext = createContext<FormConfigContextValue | null>(null);

/**
 * Access the form engine: configuration, conditions helpers, validation and submit.
 * Mirror of workflow's `useFlow`.
 */
export function useForm(): FormConfigContextValue {
  const context = useContext(FormConfigContext);
  if (!context) {
    throw new ConfigurationError('useForm must be used within a FormProvider');
  }
  return context;
}

// =================================================================
// FORM PROVIDER PROPS
// =================================================================

export interface FormProviderProps {
  children: React.ReactNode;
  formConfig: FormConfiguration;
  defaultValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void;
  className?: string;
  /**
   * Extra read-only values that field conditions may reference. They never
   * enter the store and are never submitted.
   *
   * A multi-step host passes the other steps' data here so a field can declare
   * a condition against a field captured on an earlier step
   * (`when('stepA.fieldX')`). Without it, a cross-step condition has nothing to
   * resolve against and silently evaluates to hidden / not-required.
   *
   * Only the names this form does NOT declare are taken from here: every id in
   * `formConfig` resolves from the live store alone, whether or not the user
   * has touched it. Two steps may therefore reuse an id without the second
   * one's untouched field inheriting the first one's value.
   */
  conditionValues?: Record<string, unknown>;
}

// =================================================================
// FORM PROVIDER IMPLEMENTATION
// =================================================================

export function FormProvider({
  children,
  formConfig,
  defaultValues = {},
  onSubmit,
  onFieldChange,
  className,
  conditionValues,
}: FormProviderProps) {
  // Create store once - stable across renders
  // Synchronously initialize repeatable configs and default values
  const [store] = useState(() => {
    const repeatableConfigs = formConfig.repeatableFields ?? {};

    // Flatten default arrays, reconstruct order and pad to min counts.
    const {
      values: initialValues,
      order: initialOrder,
      nextKeys: initialNextKeys,
    } = initializeRepeatableState(defaultValues, repeatableConfigs);

    const s = createFormStore(initialValues);

    // Set repeatable configs and order synchronously
    const state = s.getState();
    for (const [id, config] of Object.entries(repeatableConfigs)) {
      state._setRepeatableConfig(id, config);
    }
    s.setState({
      _repeatableOrder: initialOrder,
      _repeatableNextKey: initialNextKeys,
    });

    return s;
  });

  // Effect engine lifecycle
  const effectEngineRef = useRef<EffectEngine | null>(null);
  // Stable indirection to the current validateField: the engine is created in an
  // effect that runs before validateField is defined below, and validateField
  // changes identity across renders. The ref keeps the engine stable while always
  // dispatching to the latest validator.
  const validateFieldRef = useRef<((fieldId: string) => Promise<unknown>) | null>(null);

  // Track form ID changes
  const prevFormIdRef = useRef(formConfig.id);

  // Reset when form ID changes — reinitialize repeatable configs and min items.
  // This MUST run before the effect-engine effect below so that, on a step
  // transition where both steps share a field id, the new step's initial effects
  // observe the NEW step's reset values rather than the previous step's leftover
  // values. React runs effects in declaration order, so this stays first.
  useEffect(() => {
    if (prevFormIdRef.current !== formConfig.id) {
      prevFormIdRef.current = formConfig.id;

      const repeatableConfigs = formConfig.repeatableFields ?? {};

      // Install THIS form's repeatable configs (replacing the previous form's)
      // BEFORE resetting. `_reset` rebuilds repeatable rows against the store's
      // `_repeatableConfigs`; if the previous form's configs were still present,
      // a reset would pad their `min` items into this form's values (leaking
      // stale composite keys like `prevRepeatable[k0].field` across steps).
      store.setState({ _repeatableConfigs: repeatableConfigs });

      // Flatten default arrays, reconstruct order and pad to min counts.
      const { values: resetValues } = initializeRepeatableState(defaultValues, repeatableConfigs);

      // Refresh the default-values baseline to THIS form before resetting.
      // `_defaultValues` was frozen at store creation for the previous form; a
      // later no-arg `reset()` would otherwise restore the previous form's
      // defaults (leaking stale composite keys) and corrupt the dirty flag
      // (`value !== _defaultValues[fieldId]`).
      store.getState()._setDefaultValues(resetValues);

      // Reset with computed values — `_reset` rebuilds order/next-keys from the
      // now-current configs.
      store.getState()._reset(resetValues);
    }
  }, [formConfig.id, formConfig.repeatableFields, store, defaultValues]);

  useEffect(() => {
    effectEngineRef.current?.stop();
    effectEngineRef.current = null;

    if (formConfig.effectsMap && Object.keys(formConfig.effectsMap).length > 0) {
      const engine = new EffectEngine({
        effectsMap: formConfig.effectsMap,
        store,
        revalidateField: (fieldId) => {
          void validateFieldRef.current?.(fieldId);
        },
      });
      engine.start();
      engine.runInitialEffects();
      effectEngineRef.current = engine;
    }

    return () => {
      effectEngineRef.current?.stop();
      effectEngineRef.current = null;
    };
  }, [formConfig.effectsMap, store]);

  // Stable refs for callbacks
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;

  // Subscribe to value changes for onFieldChange callback
  useEffect(() => {
    if (!onFieldChangeRef.current) return;

    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values, prevValues) => {
        // Find which field changed
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            onFieldChangeRef.current?.(fieldId, values[fieldId], values as Record<string, unknown>);
          }
        }
      }
    );

    return unsubscribe;
  }, [store]);

  // Subscribe to form values for reactive conditions evaluation
  const [formValues, setFormValues] = useState(() => store.getState().values);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values) => setFormValues(values)
    );
    return unsubscribe;
  }, [store]);

  // Subscribe to repeatable order for reactive conditions evaluation
  const [repeatableOrder, setRepeatableOrder] = useState(() => store.getState()._repeatableOrder);

  useEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state._repeatableOrder,
      (order) => setRepeatableOrder(order)
    );
    return unsubscribe;
  }, [store]);

  // Every bare name this form OWNS. An external value may never answer for one
  // of them: `formValues` only carries fields the user has actually touched, so
  // layering external values underneath would let an UNTOUCHED local field
  // inherit a foreign step's value for the same id instead of reading empty.
  const ownFieldIds = useMemo(
    () =>
      new Set<string>([
        ...formConfig.allFields.map((field) => field.id),
        ...Object.keys(formConfig.repeatableFields ?? {}),
      ]),
    [formConfig.allFields, formConfig.repeatableFields]
  );

  // Conditions resolve against the store's own values, with host-supplied
  // external values filling ONLY the names this form does not own — so a
  // qualified cross-step reference (`stepA.fieldX`) resolves, while every bare
  // name the form declares answers from the live store alone, touched or not.
  const conditionEvaluationValues = useMemo(() => {
    if (!conditionValues) return formValues;
    const external: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(conditionValues)) {
      if (!ownFieldIds.has(key)) {
        external[key] = value;
      }
    }
    return { ...external, ...formValues };
  }, [conditionValues, formValues, ownFieldIds]);

  // Evaluate conditions using specialized hook
  const {
    fieldConditions,
    hasConditionalFields,
    getFieldCondition,
    isFieldVisible,
    isFieldDisabled,
    isFieldRequired,
    isFieldReadonly,
  } = useFormConditions({
    formConfig,
    formValues: conditionEvaluationValues,
    repeatableOrder,
  });

  // Sync conditions to store whenever they change
  useEffect(() => {
    const state = store.getState();
    // Snapshot the previous conditions BEFORE any write so a visible→hidden
    // transition can be detected per field.
    const prevConditions = state._fieldConditions;

    for (const [fieldId, condition] of Object.entries(fieldConditions)) {
      // A field with no stored conditions yet is treated as visible (matches
      // the store's DEFAULT_FIELD_CONDITIONS), so only a real true→false flip
      // triggers the clear below. `required` defaults to false, so a field only
      // counts as "was required" once a true was actually stored.
      const wasVisible = prevConditions[fieldId]?.visible ?? true;
      const wasRequired = prevConditions[fieldId]?.required ?? false;

      const conditions: FieldConditions = {
        visible: condition.visible,
        disabled: condition.disabled,
        required: condition.required,
        readonly: condition.readonly,
      };
      state._setFieldConditions(fieldId, conditions);

      // When a field transitions from visible → hidden, clear any already
      // committed error + validation state so it stops contributing to the
      // global isValid (a hidden field must never wedge isValid with no
      // visible error). Mirrors validateForm's invisible-field handling and
      // the in-flight guard in useFormValidationWithStore. A field that
      // becomes visible again is re-validated normally on its next trigger —
      // this only clears the stale committed state, it does not suppress
      // future validation.
      const becameHidden = wasVisible && condition.visible === false;

      // Sibling of the visible→hidden clear: when a still-visible field stops
      // being conditionally required (required true→false) and its ONLY
      // committed error is the synthetic CONDITIONAL_REQUIRED one, clear it.
      // Otherwise the field would wedge isValid forever even though
      // validateForm — which excludes a non-required field with no base
      // validation — reports the form valid. A field whose requirement is
      // re-added (false→true) is re-validated normally on its next submit, so
      // this only clears stale state, it does not suppress future validation.
      // A base-validation error (any non-CONDITIONAL_REQUIRED code) is left
      // intact and recomputed on the next validation trigger.
      const requirementRemoved = wasRequired && condition.required === false;
      const onlyConditionalRequiredError =
        requirementRemoved &&
        !becameHidden &&
        holdsOnlyConditionalRequiredError(store.getState().errors[fieldId]);

      if (becameHidden || onlyConditionalRequiredError) {
        state._setErrors(fieldId, []);
        state._setValidationState(fieldId, 'valid');
      }
    }
  }, [fieldConditions, store]);

  // Memoize condition helpers
  const conditionsHelpers = useMemo(
    () => ({
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    }),
    [
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    ]
  );

  // Initialize validation with store
  const { validateField, validateForm } = useFormValidationWithStore({
    formConfig,
    store,
  });
  // Expose the latest validator to the effect engine (see validateFieldRef).
  validateFieldRef.current = validateField;

  // Initialize submission with store
  const { submit } = useFormSubmissionWithStore({
    store,
    onSubmit,
    validateForm,
    defaultSubmitOptions: formConfig.submitOptions,
  });

  // Memoize form config context
  const formConfigContextValue = useMemo(
    () => ({
      formConfig,
      conditionsHelpers,
      validateField,
      validateForm,
      submit,
    }),
    [formConfig, conditionsHelpers, validateField, validateForm, submit]
  );

  return (
    <FormStoreContext.Provider value={store}>
      <FormConfigContext.Provider value={formConfigContextValue}>
        <form onSubmit={submit} className={className} noValidate>
          {children}
        </form>
      </FormConfigContext.Provider>
    </FormStoreContext.Provider>
  );
}
