import type {
  FieldConditions,
  FormConfiguration,
  SubmitOptions,
  ValidationResult,
} from '@rilaykit/core';
import { ConfigurationError, getOwn, hasOwn } from '@rilaykit/core';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EffectEngine, effectsMapEquals } from '../effects/effect-engine';
import { type UseFormConditionsReturn, useFormConditions } from '../hooks';
import { useFormSubmissionWithStore } from '../hooks/useFormSubmissionWithStore';
import { useFormValidationWithStore } from '../hooks/useFormValidationWithStore';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import { FormStoreContext, createFormStore } from '../stores';
import { holdsOnlyConditionalRequiredError } from '../utils/conditional-required';
import { defineOwn, initializeRepeatableState, parseCompositeKey } from '../utils/repeatable-data';

// =================================================================
// FORM CONFIG CONTEXT
// =================================================================

export interface FormConfigContextValue {
  formConfig: FormConfiguration;
  conditionsHelpers: Omit<UseFormConditionsReturn, 'fieldConditions'>;
  validateField: (fieldId: string, value?: unknown) => Promise<ValidationResult>;
  validateForm: () => Promise<ValidationResult>;
  submit: (eventOrOptions?: React.FormEvent | SubmitOptions) => Promise<boolean>;
  /**
   * Opaque identity of the form CURRENTLY mounted. Treat the value as
   * meaningless and only ever compare it for equality: it changes exactly when
   * this provider swaps forms — a workflow step transition, or a schema
   * re-emitted with a new shape — and never on an ordinary re-render. A schema
   * that merely GREW (fields appended, nothing dropped) or RETYPED a field in
   * place (a torn streamed `type` completing — a streaming emission being
   * progressively mounted, either way) is the SAME form and keeps it.
   *
   * Anything below the provider that holds STEP-SCOPED work must key on it.
   * `formConfig` cannot stand in: two workflow steps may be handed the SAME
   * built config, and then it is reference-identical across the crossing.
   */
  formInstanceKey: string;
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
 * schema that DROPS a field does — a schema that only APPENDS fields is growth,
 * and one that RETYPES a field under a retained id set is an in-place
 * correction, neither a swap; see below. Presentation-only churn
 * (labels, props, row layout) is intentionally invisible here: it orphans no
 * value.
 *
 * The component is part of it because an id says WHICH value a field holds while
 * its type says what KIND of value it can hold. Retyping `{id:'x', type:'text'}`
 * to `{id:'x', type:'number'}` under a stable form id orphans the stored string
 * exactly as removing the field would — and the host's evolved contract says
 * number. But it orphans ONLY that field's value, so it is handled surgically —
 * that one field re-registers — rather than by resetting siblings it never
 * touched.
 *
 * A signature CHANGE is however not yet a swap. Two continuations keep the
 * mounted form:
 *
 * GROWTH — the same owner, the same form id, and every previous field still
 * present with its type intact — is the same form gaining fields (a schema
 * being progressively emitted by a streaming agent), and it orphans no value:
 * the appended fields register incrementally and the store is NOT reset.
 *
 * RETYPE — the same owner, the same form id, and the same field-id set, but
 * one or more fields' `componentId` changed — is the same form CORRECTING
 * itself mid-stream. A streamed `type` string can arrive torn at a chunk
 * boundary on a value that is itself a registered component (`"text"` cut from
 * `"textarea"`): the torn field mounts, the user types — in it and in sibling
 * fields — and the next chunk completes the string. That completion changes
 * one field's componentId under an unchanged identity; only THAT field's value
 * is orphaned, so only that field is re-registered and every sibling keeps its
 * keystrokes. Resetting here was the campaign-era data-loss bug: a single
 * field's type completing mid-stream nuked the whole form.
 *
 * Anything else a signature change can mean — a field DROPPED, a different
 * `instanceId`, a different form id — IS a swap and still resets; see
 * `classifyShapeChange`.
 */
interface ConfigShape {
  readonly instanceId: string | null;
  readonly formId: string;
  /**
   * Each top-level field's `componentId` by field id — which value a field
   * holds (the id) and what kind of value it can hold (the componentId, the
   * compiled form of the schema's `type`). A Map rather than joined
   * `id:componentId` strings: the growth/retype diff must split the pair back
   * apart, and an id may itself contain any delimiter.
   */
  readonly fields: ReadonlyMap<string, string>;
  /** Repeatable ids with their own template field shapes. */
  readonly repeatables: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

function buildConfigShape(formConfig: FormConfiguration, instanceId?: string): ConfigShape {
  return {
    instanceId: instanceId ?? null,
    formId: formConfig.id,
    fields: fieldComponentMap(formConfig.allFields),
    repeatables: new Map(
      Object.entries(formConfig.repeatableFields ?? {}).map(
        ([id, config]) => [id, fieldComponentMap(config.allFields)] as const
      )
    ),
  };
}

/** Each field's componentId keyed by its id — what the field can hold. */
function fieldComponentMap(fields: FormConfiguration['allFields']): ReadonlyMap<string, string> {
  return new Map((fields ?? []).map((field) => [field.id, field.componentId]));
}

/** Entries id-sorted so the signature is insertion-order-independent. */
function sortedShapeEntries(map: ReadonlyMap<string, string>): (readonly [string, string])[] {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function buildConfigSignature(shape: ConfigShape): string {
  return JSON.stringify([
    shape.instanceId,
    shape.formId,
    sortedShapeEntries(shape.fields),
    [...shape.repeatables]
      .map(([id, template]) => [id, sortedShapeEntries(template)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]);
}

/**
 * How `next` relates to the form mounted as `prev` — the structural distinction
 * the store reset hangs on.
 *
 * `'growth'` — the same owner (`instanceId`), the same form id, and every
 * previous field — top-level and per-repeatable template alike — still present
 * with its `componentId` intact. Appending a field, or a whole new repeatable,
 * is growth: it orphans no stored value.
 *
 * `'retype'` — growth's conditions except that one or more RETAINED field ids
 * changed componentId: the same form correcting a torn streamed `type` in
 * place (see {@link ConfigShape}). Only the retyped fields' values are
 * orphaned; the effect below drops exactly those and spares every sibling. A
 * retype may ride the same chunk as growth — appended ids alongside a
 * completed type — and stays `'retype'`.
 *
 * `'rename'` — the ONE continuation a differing field-id set may still be: a
 * torn field id completing mid-stream (see {@link detectTornIdCompletion}).
 * The field's state carries from the torn id to the completed one; siblings
 * are untouched.
 *
 * `'swap'` — everything else: a field dropped, a different owner, a different
 * form id. The asymmetry is the point: the campaign's bug class (#10/#12 — a
 * step transition leaking the previous step's values) lives entirely on the
 * swap side, and a swap ALWAYS resets. A different `instanceId` wins over any
 * shape similarity: two steps handed structurally identical forms are two
 * forms.
 */
type ShapeTransition = 'growth' | 'retype' | 'rename' | 'swap';

/**
 * The single field-id-set change that is NOT a swap: a torn field id
 * completing mid-stream. When the model emits `type` before `id`, a chunk
 * boundary can tear the id string itself — the field mounts under `"na"` and
 * the next chunk completes it to `"name"`. The id SET then differs between the
 * two compiles, which reads as a swap and would reset the whole store over two
 * characters of one id. Within one streaming emission, a field id that is a
 * strict PREFIX of the one id that replaced it is the SAME field's id
 * completing, not a new field.
 *
 * The constraints are deliberately airtight, because a mis-merge would carry
 * one real field's value into a DIFFERENT real field: same owner and form id,
 * the same field COUNT (a rename adds nothing and drops nothing), EXACTLY one
 * id differing in each direction, the previous id a non-empty strict prefix of
 * the new one, the same componentId on both sides of it, every retained
 * field's componentId untouched (a simultaneous retype falls back to the swap
 * reset), and the repeatable shapes byte-identical. A form that legitimately
 * holds both `na` and `name` can never trip this: with both present, no
 * transition has `na` missing while the counts match — dropping `na` changes
 * the count, and appending `name` is growth.
 */
function detectTornIdCompletion(
  prev: ConfigShape,
  next: ConfigShape
): { from: string; to: string } | null {
  if (prev.instanceId !== next.instanceId || prev.formId !== next.formId) return null;
  if (prev.fields.size !== next.fields.size) return null;

  let from: string | null = null;
  for (const [fieldId, componentId] of prev.fields) {
    const nextComponent = next.fields.get(fieldId);
    if (nextComponent === undefined) {
      if (from !== null) return null;
      from = fieldId;
    } else if (nextComponent !== componentId) {
      return null;
    }
  }
  if (from === null || from.length === 0) return null;

  let to: string | null = null;
  for (const fieldId of next.fields.keys()) {
    if (!prev.fields.has(fieldId)) {
      if (to !== null) return null;
      to = fieldId;
    }
  }
  // `from !== to` holds by construction: `from` is absent from `next`, `to` is
  // absent from `prev` — so `startsWith` alone makes the prefix strict.
  if (to === null || !to.startsWith(from)) return null;
  if (prev.fields.get(from) !== next.fields.get(to)) return null;

  if (prev.repeatables.size !== next.repeatables.size) return null;
  for (const [repeatableId, template] of prev.repeatables) {
    const nextTemplate = next.repeatables.get(repeatableId);
    if (nextTemplate === undefined || nextTemplate.size !== template.size) return null;
    for (const [fieldId, componentId] of template) {
      if (nextTemplate.get(fieldId) !== componentId) return null;
    }
  }
  return { from, to };
}

/** Carry one per-field table entry from a torn field id to its completed id. */
function carryTableEntry<T>(table: Record<string, T>, from: string, to: string): boolean {
  if (!hasOwn(table, from)) return false;
  defineOwn(table as Record<string, unknown>, to, getOwn(table, from));
  delete table[from];
  return true;
}

function classifyShapeChange(prev: ConfigShape, next: ConfigShape): ShapeTransition {
  if (prev.instanceId !== next.instanceId || prev.formId !== next.formId) return 'swap';

  let retyped = false;
  for (const [fieldId, componentId] of prev.fields) {
    const nextComponent = next.fields.get(fieldId);
    if (nextComponent === undefined) {
      return detectTornIdCompletion(prev, next) !== null ? 'rename' : 'swap';
    }
    if (nextComponent !== componentId) retyped = true;
  }
  for (const [repeatableId, template] of prev.repeatables) {
    const grown = next.repeatables.get(repeatableId);
    if (grown === undefined) return 'swap';
    for (const [fieldId, componentId] of template) {
      const nextComponent = grown.get(fieldId);
      if (nextComponent === undefined) return 'swap';
      if (nextComponent !== componentId) retyped = true;
    }
  }
  return retyped ? 'retype' : 'growth';
}

/**
 * Every store key held FOR a field whose componentId changed between two shapes
 * of the same form: the retyped top-level ids (`fieldIds`, also the exclusion
 * list that lets them re-seed as newcomers), plus — via `storeKeys` — the LIVE
 * composite keys of retyped repeatable-template fields, resolved against the
 * store's actual keys because row keys are runtime state the shape cannot know.
 */
function collectRetypedFields(
  prev: ConfigShape,
  next: ConfigShape,
  liveValueKeys: readonly string[]
): { fieldIds: string[]; storeKeys: string[] } {
  const fieldIds: string[] = [];
  for (const [fieldId, componentId] of prev.fields) {
    const nextComponent = next.fields.get(fieldId);
    if (nextComponent !== undefined && nextComponent !== componentId) {
      fieldIds.push(fieldId);
    }
  }

  const templateFields = new Map<string, Set<string>>();
  for (const [repeatableId, template] of prev.repeatables) {
    const grown = next.repeatables.get(repeatableId);
    if (grown === undefined) continue;
    for (const [fieldId, componentId] of template) {
      const nextComponent = grown.get(fieldId);
      if (nextComponent !== undefined && nextComponent !== componentId) {
        const fields = templateFields.get(repeatableId) ?? new Set<string>();
        fields.add(fieldId);
        templateFields.set(repeatableId, fields);
      }
    }
  }

  const storeKeys = [...fieldIds];
  if (templateFields.size > 0) {
    for (const key of liveValueKeys) {
      const parsed = parseCompositeKey(key);
      if (parsed && templateFields.get(parsed.repeatableId)?.has(parsed.fieldId)) {
        storeKeys.push(key);
      }
    }
  }
  return { fieldIds, storeKeys };
}

/**
 * Structural equality over PLAIN DATA — the shape a compiled default can hold:
 * JSON containers and primitives; anything else compares by identity, mirroring
 * how `clonePlainData` passes functions and schema objects through untouched.
 *
 * This exists for exactly one comparison: a newly compiled default against the
 * committed baseline default. Identity cannot carry it — every compile of a
 * streamed schema deep-clones its `defaultValues`, so two compiles of the SAME
 * emission hand over different objects, and keying the upgrade on `!==` would
 * re-seed (and re-notify the host) on every chunk. Only a default that differs
 * IN VALUE is a torn container having completed.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function plainDataEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => plainDataEquals(entry, b[index]));
  }
  if (isPlainRecord(a) && isPlainRecord(b)) {
    const aKeys = Object.keys(a);
    return (
      aKeys.length === Object.keys(b).length &&
      aKeys.every((key) => hasOwn(b, key) && plainDataEquals(getOwn(a, key), getOwn(b, key)))
    );
  }
  return false;
}

/**
 * Whether an UNTOUCHED field's committed baseline default may be UPGRADED to a
 * newly compiled default — the second way a default arrives late. A composite
 * default cut mid-stream (`["alpha","beta"]` torn after `"alpha",`) recovers,
 * seeds, and becomes the baseline; the chunk that completes it then finds the
 * field existing WITH a baseline, so the "default newly appeared" detection
 * stays silent and the torn value would freeze into submit.
 *
 * The guard is the exact untouched-guard family proven against the workflow
 * echo, stated positively: the field's live value must BE — by identity — the
 * committed baseline default (any user write replaces that identity, and a
 * host echoing captured values back through `defaultValues` echoes either that
 * same identity or the user's own object, neither of which differs from what
 * is already held), the field must be untouched (a blur is the user's even
 * over an unchanged value), the user must never have EDITED it (`userEdited` —
 * the provider's record of every value write that was not its own; identity
 * alone cannot see an edit that lands back on the exact torn prefix, because a
 * primitive's identity IS its value: type "alx", delete back to "al", and the
 * value is indistinguishable from the pristine baseline while the user's
 * cursor is in the field), and the new default must differ from the baseline
 * IN VALUE (see `plainDataEquals` — a recompile of the same emission must not
 * fire). Used by both the detection pass and the seeding pass so the two can
 * never disagree.
 */
function isUpgradableDefault(
  fieldId: string,
  nextDefault: unknown,
  defaultsBaseline: Record<string, unknown>,
  values: Record<string, unknown>,
  touched: Record<string, boolean>,
  userEdited: ReadonlySet<string>
): boolean {
  if (getOwn(touched, fieldId)) return false;
  if (userEdited.has(fieldId)) return false;
  if (!hasOwn(defaultsBaseline, fieldId) || !hasOwn(values, fieldId)) return false;
  const baselineDefault = getOwn(defaultsBaseline, fieldId);
  if (getOwn(values, fieldId) !== baselineDefault) return false;
  return !plainDataEquals(nextDefault, baselineDefault);
}

/**
 * Layers host-supplied external condition values UNDER a set of form values,
 * admitting only the names this form does not own. One definition for the two
 * moments that must agree on what conditions see: the render-time evaluation
 * (`conditionEvaluationValues`) and the submit-time payload visibility filter
 * (`getSubmitConditionValues`) — a filter measuring visibility differently
 * from the screen would drop a field the user was looking at.
 */
function mergeExternalConditionValues(
  conditionValues: Record<string, unknown> | undefined,
  ownFieldIds: ReadonlySet<string>,
  formValues: Record<string, unknown>
): Record<string, unknown> {
  if (!conditionValues) return formValues;
  const external: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(conditionValues)) {
    if (!ownFieldIds.has(key)) {
      external[key] = value;
    }
  }
  return { ...external, ...formValues };
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
  const configShape = useMemo(
    () => buildConfigShape(formConfig, instanceId),
    [formConfig, instanceId]
  );
  const configSignature = useMemo(() => buildConfigSignature(configShape), [configShape]);

  // CONTENT identity for the effects index. Every streamed chunk is a fresh
  // compile and therefore a fresh `effectsMap` OBJECT even when not a single
  // effect changed — keying the engine's lifetime on the object identity made
  // every growth chunk tear the engine down, re-run initial effects over the
  // user's typed answers and abort in-flight async effects. Keep the previous
  // reference while keys + per-effect handler references are unchanged (the
  // "work that outlives a render must key on content, not identity" class).
  // Render-phase ref adjustment, same convergence argument as `identityState`
  // above: idempotent, and a discarded render only re-runs the comparison.
  const stableEffectsMapRef = useRef(formConfig.effectsMap);
  if (
    stableEffectsMapRef.current !== formConfig.effectsMap &&
    !effectsMapEquals(stableEffectsMapRef.current, formConfig.effectsMap)
  ) {
    stableEffectsMapRef.current = formConfig.effectsMap;
  }
  const stableEffectsMap = stableEffectsMapRef.current;

  // Identity of the MOUNTED form: the signature as of the last genuine swap.
  // GROWTH and RETYPE keep it — an appended field, like a torn type completing
  // in place, is the same form, and everything scoped to "this form" (in-flight
  // validation, a pending submit, per-field debounce timers keyed on
  // `formInstanceKey`) must survive the chunk that carried it. A swap replaces
  // it.
  //
  // Derived DURING RENDER (React's adjust-state-during-render pattern, which
  // re-renders before committing) rather than in an effect: the same render
  // that carries a swapped config must already hand children the new identity,
  // or a child keyed on `formInstanceKey` would render one frame against the
  // previous form's identity.
  const [identityState, setIdentityState] = useState(() => ({
    shape: configShape,
    signature: configSignature,
    identity: configSignature,
  }));
  let formIdentity = identityState.identity;
  if (identityState.signature !== configSignature) {
    // Growth, retype AND a torn-id rename are the same form continuing; only
    // a swap replaces it.
    formIdentity =
      classifyShapeChange(identityState.shape, configShape) === 'swap'
        ? configSignature
        : identityState.identity;
    setIdentityState({ shape: configShape, signature: configSignature, identity: formIdentity });
  }

  const prevConfigSignatureRef = useRef(configSignature);
  const prevIdentityRef = useRef(formIdentity);
  // The shape as of the LAST COMMITTED reset-or-growth pass — the growth path
  // diffs against it to seed exactly what appeared since.
  const prevShapeRef = useRef(configShape);

  // Brackets the form-id reset so the values subscription can tell a wholesale
  // form swap (every previous key disappears at once) from a genuine user
  // removal. Zustand fires subscribers synchronously inside `set`, so the flag
  // reliably covers exactly the reset's own notification.
  const isResettingRef = useRef(false);

  // Brackets the growth/retype pass's own store write, exactly as
  // `isResettingRef` brackets the swap reset, so the values subscription can
  // tell the provider seeding a default from the user (or an effect) writing a
  // value. Separate flags because their consumers differ: this one must NOT
  // suppress `onFieldsRemove` — a retype deleting a stale key is something the
  // host's mirror must learn about.
  const isApplyingConfigRef = useRef(false);

  // Every field id whose VALUE changed outside the provider's own writes since
  // the mounted form last swapped — a keystroke, a programmatic set, an
  // effect's write. This is the interaction record `isUpgradableDefault` needs
  // beyond `touched` (which only a blur sets) and beyond baseline identity
  // (which cannot see a primitive edited back onto its own value): once the
  // user has interacted with a field, a late-completing streamed default must
  // never rewrite the text under their cursor, even when the current value
  // coincidentally equals the torn prefix it recovered as.
  const userEditedFieldsRef = useRef(new Set<string>());

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
  //
  // ORDERING IS NOT OWNERSHIP, and this comment used to imply it was. Running
  // first only decides what the engine's effects OBSERVE *if* the engine is
  // rebuilt at all; it says nothing about WHICH form the engine belongs to. The
  // engine below keyed only on `formConfig.effectsMap`, so when two steps were
  // handed the same built config it was never rebuilt on the crossing — and the
  // previous step's engine stayed live, un-aborted, writing into this step. The
  // same blind spot covered every other thing this seam holds that outlives a
  // render: an in-flight validation run, a pending debounced run, an in-flight
  // submit. All four now key on `configSignature` — the one value here that
  // knows a swap happened.
  useIsomorphicLayoutEffect(() => {
    if (prevIdentityRef.current !== formIdentity) {
      prevIdentityRef.current = formIdentity;
      prevConfigSignatureRef.current = configSignature;
      prevShapeRef.current = configShape;

      // A swap mounts a DIFFERENT form: nothing the user did to the previous
      // one is an interaction with this one.
      userEditedFieldsRef.current = new Set();

      // Stop the OUTGOING form's effect engine BEFORE `_reset` notifies. The
      // engine's own teardown+rebuild is a PASSIVE effect (below), which React
      // runs one commit LATER — after this layout reset has already fired its
      // store notification. Left subscribed, the previous step's engine observes
      // the new step's reset values as watched changes and fires its effects
      // onto this step's freshly seeded targets, overwriting their defaults.
      // Grading the reset as a provider write cannot help: the swap clears every
      // ownership signal (`userEditedFields` above, `touched` in `_reset`), so
      // the new step's targets are not user-owned and the engine's user-owned
      // guard is a no-op. The passive effect below rebuilds the engine for THIS
      // step and runs its initial effects against the post-reset values.
      effectEngineRef.current?.stop();
      effectEngineRef.current = null;

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
      return;
    }

    // GROWTH / RETYPE — the signature moved but the identity did not: the same
    // form gained fields, or corrected a torn streamed `type` in place (a
    // streaming schema being progressively mounted). Register the newcomers —
    // and re-register the retyped fields — incrementally; NEVER reset. Every
    // key the store already holds is the user's — a keystroke landing between
    // two chunks included — and only ids absent from the last committed shape,
    // or retyped since it, may be seeded.
    //
    // A field's `default` may also arrive late, in two forms, and the default's
    // chunk moves NO signature either way — defaults are deliberately not in
    // the shape, a default orphans no value. APPEARING: the default lands one
    // chunk after the field's core (id/type/props), detected as a key new to
    // the committed `_defaultValues` baseline, and seeded under the
    // never-overwrite guard — only a field the user has neither typed into
    // (`hasOwn(values, ...)`) nor TOUCHED (the store's own blur tracking) may
    // be filled. UPGRADING: a composite default arrived TORN (an array cut
    // mid-stream recovers as its prefix), seeded, became the baseline — and
    // the chunk that completes it finds the field existing WITH a baseline, so
    // only a VALUE diff against that baseline can see it; see
    // `isUpgradableDefault` for the (stricter) guard that gates it.
    //
    // The guard is part of the DETECTION, not only of the seeding: a workflow
    // host echoes the values it captured back through `defaultValues`, so a
    // key that is new to the baseline but already held (or touched) — or one
    // whose held value is no longer the baseline's own identity — is the
    // user's own work coming back around, not a late default — treating it as
    // one would rewrite `_defaultValues` with user-authored state and corrupt
    // the dirty-flag reference and every later no-arg `reset()`.
    const signatureMoved = prevConfigSignatureRef.current !== configSignature;
    const currentState = store.getState();
    const defaultsBaseline = currentState._defaultValues;
    const hasLateDefault = formConfig.allFields.some((field) => {
      if (!hasOwn(defaultValues, field.id)) return false;
      if (!hasOwn(defaultsBaseline, field.id)) {
        // APPEARING — new to the baseline, and not the user's own key.
        return !hasOwn(currentState.values, field.id) && !getOwn(currentState.touched, field.id);
      }
      // UPGRADING — already in the baseline, completed to a different value.
      return isUpgradableDefault(
        field.id,
        getOwn(defaultValues, field.id),
        defaultsBaseline,
        currentState.values,
        currentState.touched,
        userEditedFieldsRef.current
      );
    });
    if (signatureMoved || hasLateDefault) {
      const prevShape = prevShapeRef.current;
      prevConfigSignatureRef.current = configSignature;
      prevShapeRef.current = configShape;

      // RENAME — the identity survived a changed field-id set, which the
      // classifier only ever allows for a torn field id completing (see
      // `detectTornIdCompletion` — recomputed here from the same committed
      // shape pair the render-phase classification used, so the two cannot
      // disagree). The field's whole state carries from the torn id to the
      // completed one further down.
      const rename = signatureMoved ? detectTornIdCompletion(prevShape, configShape) : null;

      const repeatableConfigs = formConfig.repeatableFields ?? {};

      // The grown templates replace the previous ones wholesale: an EXISTING
      // repeatable's template may itself have grown a field, and appends after
      // this chunk must pad rows from the current template. A late default
      // alone moves no template, so the install stays growth-gated.
      if (signatureMoved) {
        store.setState({ _repeatableConfigs: repeatableConfigs });
      }

      // Baseline of the GROWN shape — the source seeded from, and the new
      // dirty-flag reference (`value !== _defaultValues[fieldId]`), which must
      // know the appended fields' — and the late-arriving — defaults, so a
      // later no-arg `reset()` restores them instead of "".
      const {
        values: grownDefaults,
        order: grownOrder,
        nextKeys: grownNextKeys,
      } = initializeRepeatableState(defaultValues, repeatableConfigs, defaultRepeatableOrder);

      // The rewritten baseline must not RE-CLONE an entry the store still
      // holds PRISTINE. The per-field dirty flag and `isUpgradableDefault`
      // both compare the live value to the baseline BY IDENTITY, and every
      // compile clones its `defaultValues` — so installing the fresh clone for
      // a field whose value never moved would sever that identity permanently:
      // after one growth chunk, an untouched field would read dirty, and a
      // default legitimately completing on a LATER chunk would be silently
      // lost. Re-point each entry whose live value IS the committed baseline
      // (identity — any user write replaced it; a user value merely EQUAL to
      // the default never qualifies) and whose newly compiled default did not
      // move IN VALUE. An entry whose default DID move is left as the fresh
      // clone: it is exactly the upgrade the seeding pass below installs.
      for (const key of Object.keys(grownDefaults)) {
        // Under a rename, the completed id's baseline and live value still
        // live under the TORN id — the carry below runs after this rewrite.
        const sourceKey = rename !== null && key === rename.to ? rename.from : key;
        if (!hasOwn(defaultsBaseline, sourceKey) || !hasOwn(currentState.values, sourceKey)) {
          continue;
        }
        const held = getOwn(currentState.values, sourceKey);
        if (held !== getOwn(defaultsBaseline, sourceKey)) continue;
        if (plainDataEquals(held, getOwn(grownDefaults, key))) {
          defineOwn(grownDefaults, key, held);
        }
      }
      store.getState()._setDefaultValues(grownDefaults);

      const state = store.getState();
      const values = { ...state.values };
      const errors = { ...state.errors };
      const validationStates = { ...state.validationStates };
      const touched = { ...state.touched };
      const order = { ...state._repeatableOrder };
      const nextKeys = { ...state._repeatableNextKey };
      let seeded = false;

      // RETYPE — drop exactly the retyped fields' state, nothing else. Their
      // held values were typed into (or seeded for) the WRONG control, so the
      // completed componentId orphans them the way a swap would — but only
      // them: every sibling keeps its keystrokes, which is the whole point of
      // not resetting. Errors, validation state and touched go with the value:
      // the field is a fresh registration of a new control. The value-key
      // deletion is deliberately NOT bracketed by `isResettingRef` — the host's
      // mirror must learn via `onFieldsRemove` that the stale value is gone.
      const retyped = signatureMoved
        ? collectRetypedFields(prevShape, configShape, Object.keys(state.values))
        : { fieldIds: [], storeKeys: [] };
      let retypeCleared = false;
      for (const key of retyped.storeKeys) {
        if (
          hasOwn(values, key) ||
          hasOwn(errors, key) ||
          hasOwn(validationStates, key) ||
          hasOwn(touched, key)
        ) {
          retypeCleared = true;
          delete values[key];
          delete errors[key];
          delete validationStates[key];
          delete touched[key];
        }
        // A retyped field is a fresh registration of a NEW control: what the
        // user typed into the wrong control was dropped with the value, so the
        // interaction record goes with it — exactly as `touched` does.
        userEditedFieldsRef.current.delete(key);
      }

      // RENAME — carry the field's whole per-field state from the torn id to
      // the completed one: value, errors, validation state, touched and the
      // interaction record all belong to the SAME field, two characters of
      // whose id just finished streaming. The value's key change is
      // deliberately NOT bracketed by `isResettingRef`: the host's mirror must
      // learn via `onFieldsRemove` that the torn key is gone, and via
      // `onFieldChange` where its value went.
      let renamed = false;
      if (rename !== null) {
        renamed = carryTableEntry(values, rename.from, rename.to) || renamed;
        renamed = carryTableEntry(errors, rename.from, rename.to) || renamed;
        renamed = carryTableEntry(validationStates, rename.from, rename.to) || renamed;
        renamed = carryTableEntry(touched, rename.from, rename.to) || renamed;
        if (userEditedFieldsRef.current.delete(rename.from)) {
          userEditedFieldsRef.current.add(rename.to);
        }
      }

      // Retyped ids are excluded from the committed shape below so they seed
      // again as newcomers — from the NEW compile's defaults, which the fresh
      // `_setDefaultValues` baseline above already carries for the dirty flag.
      const prevFieldIds = new Set(prevShape.fields.keys());
      for (const fieldId of retyped.fieldIds) prevFieldIds.delete(fieldId);
      const prevRepeatableIds = new Set(prevShape.repeatables.keys());

      // Seed defaults for the plain fields that APPEARED — and for the fields
      // whose DEFAULT appeared (or completed) only now. `hasOwn` guards the
      // live store even for a brand-new id: nothing the user holds is ever
      // overwritten, and a touched field is the user's even while empty (the
      // local `touched` copy: a just-retyped field is untouched by construction).
      for (const field of formConfig.allFields) {
        if (getOwn(touched, field.id)) continue;
        if (!hasOwn(grownDefaults, field.id)) continue;
        if (hasOwn(values, field.id)) {
          // A held value blocks seeding UNLESS it is the committed baseline
          // default itself, untouched, being UPGRADED by a torn default that
          // completed — see `isUpgradableDefault`.
          if (
            !isUpgradableDefault(
              field.id,
              getOwn(grownDefaults, field.id),
              defaultsBaseline,
              values,
              touched,
              userEditedFieldsRef.current
            )
          ) {
            continue;
          }
        } else if (prevFieldIds.has(field.id) && hasOwn(defaultsBaseline, field.id)) {
          // A field the committed baseline already covered keeps its state:
          // only a newcomer (id absent from the last committed shape), a
          // retyped field (excluded above), or a newly arrived default (id
          // absent from the committed baseline) seeds.
          continue;
        }
        defineOwn(values, field.id, getOwn(grownDefaults, field.id));
        seeded = true;
      }

      // Install rows for the repeatables that APPEARED (min-padding included).
      // Existing repeatables keep their live rows untouched — a template that
      // grew a field simply renders the new field empty on the rows the user
      // already has. That holds even when the grown template's `defaultValue`
      // covers the new field: a LATE repeatable-template default never
      // re-seeds existing rows, because this loop skips every repeatable the
      // previous shape already had. Documented family — the structural price
      // of the never-touch-live-rows rule; rows added AFTER the growth pad
      // from the current template and do receive the new defaults.
      for (const repeatableId of Object.keys(repeatableConfigs)) {
        if (prevRepeatableIds.has(repeatableId) || hasOwn(order, repeatableId)) continue;
        const rowKeys = getOwn(grownOrder, repeatableId);
        if (rowKeys === undefined) continue;
        defineOwn(order as Record<string, unknown>, repeatableId, rowKeys);
        defineOwn(
          nextKeys as Record<string, unknown>,
          repeatableId,
          getOwn(grownNextKeys, repeatableId)
        );
        for (const [key, value] of Object.entries(grownDefaults)) {
          if (parseCompositeKey(key)?.repeatableId === repeatableId && !hasOwn(values, key)) {
            defineOwn(values, key, value);
          }
        }
        seeded = true;
      }

      // A rename moved entries across the per-field tables exactly as a retype
      // clears them: both must join the write below.
      const tablesMoved = retypeCleared || renamed;
      if (seeded || tablesMoved) {
        // The error/validation/touched tables only join the write when a
        // retype actually cleared something (or a rename carried it) — a pure
        // growth pass must not replace their references (and wake their
        // subscribers) for nothing.
        // Bracketed so the values subscription attributes this write to the
        // provider: a seeded default is nobody's interaction.
        isApplyingConfigRef.current = true;
        try {
          store.setState(
            tablesMoved
              ? {
                  values,
                  errors,
                  validationStates,
                  touched,
                  _repeatableOrder: order,
                  _repeatableNextKey: nextKeys,
                }
              : { values, _repeatableOrder: order, _repeatableNextKey: nextKeys }
          );
        } finally {
          isApplyingConfigRef.current = false;
        }
        // A cleared error may have been the last thing wedging the global
        // isValid; recompute it from the surviving tables.
        if (tablesMoved) store.getState()._updateIsValid();
      }
    }
  }, [
    configSignature,
    formIdentity,
    configShape,
    formConfig.repeatableFields,
    formConfig.allFields,
    store,
    defaultValues,
    defaultRepeatableOrder,
  ]);

  // The effect engine is STEP-SCOPED STATE, even though it looks like plumbing:
  // it owns a live subscription to the store and the abort handles of the
  // in-flight async effects the CURRENT form's user set off. So it must be torn
  // down and rebuilt on exactly the event the reset above fires on — a form swap
  // — and `configSignature` is the only value here that knows about one.
  //
  // `formConfig.effectsMap` alone was NOT enough, and the gap was precisely the
  // case `instanceId` exists for. `StepDefinition.formConfig` is typed
  // `FormConfiguration | form`, and only the BUILDER arm gets `.build()` called
  // per step — hand the same already-BUILT config to two `addStep` calls and both
  // steps share ONE object. `effectsMap` is then reference-identical across the
  // crossing, this effect never fired, and the engine mounted for the previous
  // step stayed subscribed with its in-flight effects un-aborted: their writes
  // landed in the NEW step's values and were submitted as the new step's data.
  //
  // Both deps are load-bearing and neither implies the other: `formIdentity`
  // catches a swap that reuses one config object, `stableEffectsMap` catches
  // effects that change under an identical shape (a re-emitted schema — the
  // signature deliberately ignores everything that orphans no value, and
  // effects are not in it). Growth deliberately rides NEITHER half:
  // `stableEffectsMap` is the CONTENT identity of the effects index (see its
  // declaration above), so a growth chunk whose effects did not change keeps
  // the running engine — its in-flight async effects and, above all, the
  // one-shot nature of `runInitialEffects`, which re-fired against the user's
  // already-typed answers on every rebuild. When a rebuild IS genuine (new or
  // re-curried effects mid-stream), `runInitialEffects` runs with the store
  // already holding user answers: the engine's initial-run guard (see
  // `isUserOwnedField`) is what keeps those re-fires off user-owned fields.
  //
  // `formIdentity` is deliberately a dependency the BODY does not read: it
  // exists to make this effect tear the engine down and rebuild it on a swap. The
  // rule below reasons about what a body READS; here the engine's LIFETIME is the
  // point, not its inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lifetime trigger, not an input
  useEffect(() => {
    effectEngineRef.current?.stop();
    effectEngineRef.current = null;

    if (stableEffectsMap && Object.keys(stableEffectsMap).length > 0) {
      const engine = new EffectEngine({
        effectsMap: stableEffectsMap,
        store,
        revalidateField: (fieldId) => {
          void validateFieldRef.current?.(fieldId);
        },
        // The provider's interaction record — every field whose value changed
        // outside the provider's own writes since the last swap. Backs the
        // engine's initial-run guard beyond `touched` (which only a blur
        // sets): an answer typed under a still-streaming schema must survive
        // the rebuild the next chunk causes.
        isUserOwnedField: (fieldId) => userEditedFieldsRef.current.has(fieldId),
        // The growth/retype/default-upgrade seeding bracket. The engine's own
        // values subscription otherwise sees a seeded default as a USER-grade
        // watched change and fires its effect over a user-owned target (the
        // provider's subscription reads the same bracket at line ~1107 for the
        // same attribution). Zustand notifies synchronously inside `set`, so
        // whichever engine is subscribed when the seed lands — this one, or a
        // predecessor one commit away from its passive rebuild — observes the
        // bracket exactly.
        isProviderWrite: () => isApplyingConfigRef.current,
      });
      engine.start();
      engine.runInitialEffects();
      effectEngineRef.current = engine;
    }

    return () => {
      effectEngineRef.current?.stop();
      effectEngineRef.current = null;
    };
  }, [formIdentity, stableEffectsMap, store]);

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
        // Anything not bracketed as the provider's own write (the swap reset,
        // the growth/retype seeding) is an interaction with the field — a
        // keystroke, a programmatic set, an effect's write — and permanently
        // disqualifies it from late-default upgrading. Zustand notifies
        // synchronously inside `set`, so the brackets are exact.
        const isProviderWrite = isResettingRef.current || isApplyingConfigRef.current;
        for (const fieldId of Object.keys(values)) {
          if (values[fieldId] !== prevValues[fieldId]) {
            if (!isProviderWrite) {
              userEditedFieldsRef.current.add(fieldId);
            }
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
  const conditionEvaluationValues = useMemo(
    () => mergeExternalConditionValues(conditionValues, ownFieldIds, formValues),
    [conditionValues, formValues, ownFieldIds]
  );

  // The SAME merge, read LIVE for the submit payload's visibility filter. The
  // memo above is a render snapshot; a submit runs after awaits, and the
  // filter deciding what ships must see visibility exactly as the user last
  // did — evaluated against the store as it is NOW, external values layered
  // underneath, or a field visible through a cross-step reference would be
  // dropped from the payload the user just confirmed.
  const conditionValuesRef = useRef(conditionValues);
  conditionValuesRef.current = conditionValues;
  const ownFieldIdsRef = useRef(ownFieldIds);
  ownFieldIdsRef.current = ownFieldIds;
  const getSubmitConditionValues = useCallback(
    () =>
      mergeExternalConditionValues(
        conditionValuesRef.current,
        ownFieldIdsRef.current,
        store.getState().values as Record<string, unknown>
      ),
    [store]
  );

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
    // A validation run in flight is state OF the form that started it. The store
    // is reset on a swap but is the same object throughout, so nothing keyed on
    // it notices; `formIdentity` is what a swap changes — and what growth
    // deliberately does NOT change, so a run in flight survives the chunk that
    // appended a field to the same form.
    instanceKey: formIdentity,
  });
  // Expose the latest validator to the effect engine (see validateFieldRef).
  validateFieldRef.current = validateField;

  // Initialize submission with store
  const { submit } = useFormSubmissionWithStore({
    store,
    onSubmit,
    validateForm,
    defaultSubmitOptions: formConfig.submitOptions,
    // A submit in flight is work started ON this form; a swap abandons it.
    instanceKey: formIdentity,
    // The payload visibility filter: a currently-hidden field's value must not
    // ship, mirroring validation's "invisible = nonexistent" contract.
    formConfig,
    getConditionValues: getSubmitConditionValues,
  });

  // Memoize form config context
  const formConfigContextValue = useMemo(
    () => ({
      formConfig,
      conditionsHelpers,
      validateField,
      validateForm,
      submit,
      formInstanceKey: formIdentity,
    }),
    [formConfig, conditionsHelpers, validateField, validateForm, submit, formIdentity]
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
