import type {
  FieldConditions,
  FormConfiguration,
  SubmitOptions,
  ValidationResult,
} from '@rilaykit/core';
import { ConfigurationError, hasOwn } from '@rilaykit/core';
import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EffectEngine } from '../effects/effect-engine';
import { type UseFormConditionsReturn, useFormConditions } from '../hooks';
import { useFormSubmissionWithStore } from '../hooks/useFormSubmissionWithStore';
import { useFormValidationWithStore } from '../hooks/useFormValidationWithStore';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
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
  /**
   * WHO this form is mounted for, when the host has an identity the config does
   * not carry. Two mounts with the same config but different `instanceId` are
   * two DIFFERENT forms, and swapping between them resets the store exactly as a
   * config change does.
   *
   * `formConfig` alone answers "what can this form hold"; it cannot answer
   * "whose values are these". A workflow step is the case that needs the
   * difference: form ids are NOT unique within a flow — `flow.build()` and
   * `validateFlowSchema` enforce STEP id uniqueness and are silent on form ids,
   * a form id is only a signature input and a monitoring label (never a key into
   * workflow data, which is keyed by step id), and `form.create(catalog)`
   * auto-generates one. So two steps reusing one form — the same built form
   * handed to two `addStep` calls — are structurally IDENTICAL here, and without
   * this the swap between them was invisible: the previous step's values,
   * errors, touched, dirty and validation states stayed mounted and were
   * presented as the new step's own.
   *
   * Optional, because a standalone form has no owner and its config IS its whole
   * identity. Hosts that mount one form per surface never need it.
   */
  instanceId?: string;
  defaultValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void | Promise<void>;
  onFieldChange?: (fieldId: string, value: unknown, formData: Record<string, unknown>) => void;
  /**
   * Fired when field ids DISAPPEAR from the store — today only when a
   * repeatable row is removed, which deletes that row's composite keys.
   *
   * `onFieldChange` can never carry this: it reports a key's new value, and a
   * removed key has none. A host that mirrors the form's values (a workflow
   * step's captured data) and only listens to `onFieldChange` therefore builds
   * an APPEND-ONLY mirror — deleted rows stay in it, get submitted to the
   * backend, and are restored the next time the form is rebuilt from it.
   *
   * Not fired for the wholesale value swap of a form-id change: that is the
   * host replacing one form with another, not the user deleting anything.
   */
  onFieldsRemove?: (fieldIds: string[], formData: Record<string, unknown>) => void;
  /**
   * Fired whenever the live repeatable row order changes, so a host that
   * rebuilds this form from its flat values can hand the order back through
   * `defaultRepeatableOrder`.
   */
  onRepeatableOrderChange?: (order: Record<string, string[]>) => void;
  /**
   * Row order to restore, per repeatable id. Wins over the order reconstructed
   * from the insertion order of `defaultValues`' composite keys, which cannot
   * represent a user reorder (a move rewrites the order, never the values).
   */
  defaultRepeatableOrder?: Record<string, string[]>;
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

/**
 * Cheap identity of a mounted form: WHOSE values it holds, and which values it
 * can hold.
 *
 * `instanceId` is the "whose" — an identity the host has and the config does
 * not. It leads the signature because a change to it is a form swap on its own,
 * whatever the shape says. See {@link FormProviderProps.instanceId}: two
 * workflow steps may legitimately reuse ONE form, and then the shape below is
 * identical and only this tells the two mounts apart.
 *
 * The reset used to key on `formConfig.id` alone, but a form id is stable
 * BUSINESS identity while the schema behind it evolves. A backend re-emitting an
 * evolved schema under the same id — the server-driven case — left the store
 * holding values for fields that no longer existed, and they were still
 * submitted.
 *
 * Deliberately NOT the config object's identity: a config is rebuilt on every
 * parent render in normal usage, so resetting on identity would wipe the user's
 * input on each one. Only the shape of what can be STORED is compared — each
 * field's id AND type, and the repeatable ids with their own fields — so a
 * re-emitted identical schema (new objects, same shape) does not reset, while a
 * schema that adds, drops or RETYPES a field does. Presentation-only churn
 * (labels, props, row layout) is intentionally invisible here: it orphans no
 * value.
 *
 * The component is part of it because an id says WHICH value a field holds while
 * its type says what KIND of value it can hold. Retyping `{id:'x', type:'text'}`
 * to `{id:'x', type:'number'}` under a stable form id orphans the stored string
 * exactly as removing the field would — and the host's evolved contract says
 * number.
 */
function buildConfigSignature(formConfig: FormConfiguration, instanceId?: string): string {
  const fields = fieldShapes(formConfig.allFields);
  const repeatables = Object.entries(formConfig.repeatableFields ?? {})
    .map(([id, config]) => [id, fieldShapes(config.allFields)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return JSON.stringify([instanceId ?? null, formConfig.id, fields, repeatables]);
}

/**
 * Each field as `id:componentId`, order-independent — what the field can hold.
 * `componentId` is the compiled form of the schema's `type`.
 */
function fieldShapes(fields: FormConfiguration['allFields']): string[] {
  return (fields ?? []).map((field) => `${field.id}:${field.componentId}`).sort();
}

export function FormProvider({
  children,
  formConfig,
  instanceId,
  defaultValues = {},
  onSubmit,
  onFieldChange,
  onFieldsRemove,
  onRepeatableOrderChange,
  defaultRepeatableOrder,
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
    } = initializeRepeatableState(defaultValues, repeatableConfigs, defaultRepeatableOrder);

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

  // Track genuine form swaps — see `buildConfigSignature`. A swap is any change
  // to WHOSE VALUES THESE ARE or to WHAT THE FORM CAN HOLD; neither is "the id
  // changed". A hot-swapped schema under a stable id (only the field set
  // changes) and a move to a different owner holding an identical form (only
  // `instanceId` changes) are the same event as far as the store is concerned.
  //
  // That second case is why `instanceId` exists. This used to read "a workflow
  // step transition (id changes)" and rely on it: a step transition was ASSUMED
  // to change the form id. Two steps may reuse one form, and then a transition
  // changed nothing here — the previous step's values stayed mounted, and the
  // workflow wrote them into the new step's slice on submit.
  const configSignature = useMemo(
    () => buildConfigSignature(formConfig, instanceId),
    [formConfig, instanceId]
  );
  const prevConfigSignatureRef = useRef(configSignature);

  // Brackets the form-id reset so the values subscription can tell a wholesale
  // form swap (every previous key disappears at once) from a genuine user
  // removal. Zustand fires subscribers synchronously inside `set`, so the flag
  // reliably covers exactly the reset's own notification.
  const isResettingRef = useRef(false);

  // Reset when the mounted form is swapped — reinitialize repeatable configs and
  // min items.
  //
  // This MUST be a LAYOUT effect, not a passive one. The signature changes when
  // the mounted form is swapped (a workflow step transition, or a schema
  // re-emitted with a new shape), and the store still holds the PREVIOUS form's
  // values until this reset runs. A passive effect is flushed in a scheduler
  // macrotask, so it leaves a window in which the new
  // form's fields are already committed and painted while the store is still
  // stale — the browser can paint one frame of the previous step's values, and,
  // worse, ANY write landing in that window (a user keystroke, or a programmatic
  // prefill such as a step's `onAfterValidation` binding) is silently destroyed
  // by the reset that follows. A layout effect runs synchronously after the
  // commit and before paint, making the reset atomic with the swap.
  //
  // This MUST also run before the effect-engine effect below so that, on a step
  // transition where both steps share a field id, the new step's initial effects
  // observe the NEW step's reset values rather than the previous step's leftover
  // values. Layout effects run before passive effects, so this stays first.
  useIsomorphicLayoutEffect(() => {
    if (prevConfigSignatureRef.current !== configSignature) {
      prevConfigSignatureRef.current = configSignature;

      const repeatableConfigs = formConfig.repeatableFields ?? {};

      // Install THIS form's repeatable configs (replacing the previous form's)
      // BEFORE resetting. `_reset` rebuilds repeatable rows against the store's
      // `_repeatableConfigs`; if the previous form's configs were still present,
      // a reset would pad their `min` items into this form's values (leaking
      // stale composite keys like `prevRepeatable[k0].field` across steps).
      store.setState({ _repeatableConfigs: repeatableConfigs });

      // Flatten default arrays, reconstruct order and pad to min counts.
      const { values: resetValues } = initializeRepeatableState(
        defaultValues,
        repeatableConfigs,
        defaultRepeatableOrder
      );

      // Refresh the default-values baseline to THIS form before resetting.
      // `_defaultValues` was frozen at store creation for the previous form; a
      // later no-arg `reset()` would otherwise restore the previous form's
      // defaults (leaking stale composite keys) and corrupt the dirty flag
      // (`value !== _defaultValues[fieldId]`).
      store.getState()._setDefaultValues(resetValues);

      // Reset with computed values — `_reset` rebuilds order/next-keys from the
      // now-current configs.
      isResettingRef.current = true;
      try {
        store.getState()._reset(resetValues, defaultRepeatableOrder);
      } finally {
        isResettingRef.current = false;
      }
    }
  }, [configSignature, formConfig.repeatableFields, store, defaultValues, defaultRepeatableOrder]);

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
  const onFieldsRemoveRef = useRef(onFieldsRemove);
  onFieldsRemoveRef.current = onFieldsRemove;

  // Subscribe to value changes for the onFieldChange / onFieldsRemove callbacks.
  //
  // The diff walks the UNION of the new and previous keys. Iterating the new
  // keys alone can only ever report additions and updates — a key that is gone
  // is not in `values` to be compared — which makes every listener's copy of
  // the form data append-only.
  //
  // This MUST be a LAYOUT effect, for the same reason as the form-id reset
  // above. These callbacks are the ONLY channel through which a host learns
  // what the form holds. A passive effect is flushed in a scheduler macrotask,
  // leaving a window in which the form is committed and interactive while
  // NOTHING is listening — and a write landing there is not merely reported
  // late, it becomes this subscription's own `prevValues` baseline and is lost
  // forever. The window is real: a child that prefills on mount runs its
  // effects before its parent's, and a workflow step re-keyed by a resolving
  // persistence load re-mounts the whole form into exactly this state — the
  // user's next edit (or a repeatable row they delete) never reaches the step's
  // captured data, and the flow submits the stale slice.
  useIsomorphicLayoutEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state.values,
      (values, prevValues) => {
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            onFieldChangeRef.current?.(fieldId, values[fieldId], values as Record<string, unknown>);
          }
        }

        // A form-id swap replaces the whole value set; that is not a removal.
        if (isResettingRef.current) return;

        const removedFieldIds = Object.keys(prevValues).filter(
          (fieldId) => !hasOwn(values, fieldId)
        );
        if (removedFieldIds.length > 0) {
          onFieldsRemoveRef.current?.(removedFieldIds, values as Record<string, unknown>);
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

  // Subscribe to repeatable order for reactive conditions evaluation, and to
  // report it to a host that needs to restore it later (a move rewrites only
  // the order, so the values alone cannot carry it).
  const [repeatableOrder, setRepeatableOrder] = useState(() => store.getState()._repeatableOrder);
  const onRepeatableOrderChangeRef = useRef(onRepeatableOrderChange);
  onRepeatableOrderChangeRef.current = onRepeatableOrderChange;

  // Layout effect, like the value mirror above: `onRepeatableOrderChange` is
  // host-facing state the host cannot reconstruct from the values, so an order
  // change landing in the passive-flush window would never be reported.
  useIsomorphicLayoutEffect(() => {
    const unsubscribe = store.subscribe(
      (state) => state._repeatableOrder,
      (order) => {
        setRepeatableOrder(order);
        onRepeatableOrderChangeRef.current?.(order);
      }
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
