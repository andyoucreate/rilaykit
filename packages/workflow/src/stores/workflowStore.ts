import type { StepConfig } from '@rilaykit/core';
import { ConfigurationError, getOwn, hasOwn } from '@rilaykit/core';
import { parseCompositeKey } from '@rilaykit/forms';
import { subscribeWithSelector } from 'zustand/middleware';
// `zustand/vanilla`, NOT `zustand`: the main entry pulls React (its `create`/
// `useStore` hooks), which would reintroduce React into this isomorphic module.
import { createStore } from 'zustand/vanilla';
import {
  admissibleStepOrder,
  flattenAuthoredSlice,
  normalizeRepeatableSlices,
  reconcileRepeatableOrders,
  sameRowKeys,
} from '../utils/normalizeRepeatableSlices';

// =================================================================
// STORE STATE & ACTIONS
// =================================================================

export interface WorkflowStoreState {
  // Navigation state
  currentStepIndex: number;
  isTransitioning: boolean;
  isInitializing: boolean;

  // Data state
  allData: Record<string, unknown>;
  /**
   * A VIEW of `allData[_currentStepId]`, and nothing else — never an independent
   * fact, never a value a caller supplies.
   *
   * THE INVARIANT, and it is unconditional: at every instant this store is
   * observable, `stepData === allData[_currentStepId] ?? {}` BY IDENTITY. It
   * holds after every action, including the ones that have nothing to do with
   * data, because it is not maintained by the actions at all — see
   * {@link createWorkflowStore}'s wrapped `set`, the ONE place `stepData` is
   * ever written.
   *
   * DERIVED AT THE WRITE BOUNDARY, NOT PUBLISHED BY EACH WRITER. This used to be
   * a value every slice-writing action remembered to publish alongside the slice
   * (`mirrorIfCurrent`), and the enumeration of who published it had SEVEN
   * entries — which is seven chances to forget, and `_setAllData` was the one
   * that did. It wrote the current step's slice into `allData` and left the
   * mirror on the superseded values. That is not a stale payload: `stepData` is
   * spread LAST in `combineWorkflowDataForConditions`, so it OVERRODE the fresh
   * `allData` it was supposed to be a view of, and every field condition on the
   * step evaluated against values the host had just replaced. Nothing healed it
   * — only another write naming the step re-published the mirror, and the host
   * believed it had just made that write.
   *
   * The fix is not an eighth entry in the table. A table of publishers is a
   * question asked of each writer ("did you remember?"); a derivation asks
   * nobody. The table is GONE, and with it the possibility of an action being
   * added tomorrow that writes a slice and forgets its view.
   */
  stepData: Record<string, unknown>;

  // Progress tracking
  visitedSteps: Set<string>;
  passedSteps: Set<string>;

  // Submission state
  isSubmitting: boolean;

  // Internal state
  /**
   * The flow's defaults AS THE HOST AUTHORED THEM — repeatables as arrays under
   * their bare id — never the store's internal flat keys.
   *
   * NOT NORMALISED, AND THAT IS THE POINT. This used to hold the value
   * `normalizeRepeatableSlices` produced at store CREATION, and `_reset` spread
   * it straight into `allData`. A normalisation is a function of the defaults
   * AND THE STEPS, and the steps are LIVE (see
   * {@link CreateWorkflowStoreOptions.getSteps}) — so the cached answer was
   * correct only against the step set of the instant it was computed. A default
   * for a step the mount config did not declare could not be recognised as
   * holding a repeatable, so it stayed an authored array; a recompile that ADDED
   * that step then made the array a LIVE step's slice, and every `reset()`
   * re-planted it — a row with no flat keys, so no keys for `_removeFieldValues`
   * to delete. The user removes the row, the row comes back.
   *
   * It is the mirror image of the four failures before it, which were all a
   * value read against a step set that had SHRUNK. A value normalised at t=0
   * against mutable inputs is the bug, not its symptom — so the store keeps the
   * defaults in the shape the host handed them, which no step set can invalidate,
   * and derives the seed from them at the moment of use. See {@link seedAllData}.
   *
   * `WorkflowProvider` reads this as the merge base under a persistence
   * snapshot, which is correct on the same terms: authored is the shape a
   * snapshot speaks, and `_loadPersistedState` normalises the merge on the way
   * in against the steps live THEN.
   *
   * IT GROWS, ADDITIVELY AND GUARDED, when a recompile delivers a default the
   * creation never saw — a born step's form declares one, and it arrives
   * through `getDefaultValues()`, the store's second live input. The
   * reconciliation admits it in this same authored shape (see
   * `admitLateDefaults`), so a later `_reset` re-seeds the born step exactly
   * as a store created with the full compile would. Only keys NEW to this
   * baseline and unwritten in `allData` ever enter: a host echoing captured
   * values back through `defaultValues` cannot rewrite it with user-authored
   * state.
   */
  _defaultValues: Record<string, unknown>;
  _defaultStepIndex: number;
  /**
   * The id of the step `stepData` mirrors, or `null` when nobody has told the
   * store which step is current.
   *
   * `stepData` is a live view of the CURRENT step; `allData` is the source of
   * truth for every step. A write naming another step (`onAfterValidation`
   * calling `helper.setStepFields('one', ...)` from step 'two') must land in
   * `allData` alone — publishing it as `stepData` hands the current step
   * another step's values, and `stepData` is both host-visible and the override
   * layer for field conditions.
   *
   * `null` means the store cannot name a current step at all — the case of a
   * store created without `steps`. There is then no slice for the mirror to be
   * a view OF, so the mirror is left exactly where it is.
   *
   * THE INVARIANT, and it is unconditional in the same way `stepData`'s is: at
   * every instant this store is observable, `_currentStepId ===
   * getSteps()[currentStepIndex]?.id ?? null`. The step that owns the mirror is
   * the step the user is RENDERED — `WorkflowProvider` renders
   * `getSteps()[currentStepIndex]`, and there is no second opinion about where
   * the user is.
   *
   * DERIVED, NEVER PASSED IN. This used to be a value each caller handed the
   * store alongside the index, justified by "every write through
   * WorkflowProvider names its step" — true of the provider and false of the
   * PUBLIC `useFlowActions().setCurrentStep` / `.loadPersistedState`, which
   * moved the index and left the mirror behind. The desync was permanent:
   * nothing else re-named the step, so every later write to the real current
   * step was misread as a cross-step write and withheld forever.
   *
   * AND THEN IT WAS A DERIVATION EACH INDEX-MOVING ACTION PERFORMED FOR ITSELF,
   * WHICH IS A TABLE OF PUBLISHERS IN A DERIVATION'S CLOTHES. Three actions
   * re-derived it, and they were exhaustive over the ways the INDEX moves — so
   * the table looked complete, and was, over the wrong domain. This is a
   * function of TWO inputs and the other one is `getSteps()`, which is LIVE:
   * a model inserts a step at index 0, `currentStepIndex` is untouched and now
   * names a different step, the provider renders that different step, and this
   * still named the step the user never left. Zero actions ran, so no table
   * could have had an entry for it. The mirror then derived the WRONG step's
   * slice — correctly, freshly, from the wrong owner — and
   * `combineWorkflowDataForConditions` spreads it LAST, so it beat the right
   * values sitting in `allData` and a field's visibility came out wrong on the
   * screen.
   *
   * So it is not a parameter and not an action's chore: it is derived at the
   * store's WRITE BOUNDARY (see `createWorkflowStore`'s `withDerived`), from
   * both its inputs, on every write — and re-derived by
   * {@link WorkflowStoreState._reconcileStepSet}, which is the only
   * announcement the second input ever makes. No caller can be the one who
   * forgot, because no caller is asked to remember.
   */
  _currentStepId: string | null;
  /**
   * Live repeatable row order per step, mirrored from each step's form.
   *
   * Deliberately NOT part of `allData`: `allData` is the payload handed to the
   * host on completion, and a bookkeeping key has no business in it. The order
   * is unreconstructable from the values (a move rewrites the order only), so
   * re-entering a step would silently revert the user's reorder without it.
   *
   * THE THIRD INVARIANT: where this names a repeatable's rows, it names the row
   * keys THIS STORE'S OWN SLICE for that step holds — never the keys of the rows
   * they replaced. An entry is a claim about rows that exist; its ABSENCE is not
   * an empty claim but no claim at all, which the read boundary answers by
   * reconstructing insertion order from the flat keys.
   *
   * RECONCILED, NEVER LEFT BEHIND. The mirror is consulted on the way in
   * (`flattenAuthoredSlice`'s `liveOrder`, so a host re-authoring the rows the
   * mirror describes does not re-key them out from under it) and applied on the
   * way out (`structureStepSlice`'s `mirroredOrder`, the only path a user's
   * reorder has to the completion payload). Those two used to disagree about
   * when it was trustworthy: the write side declined a mirror whose length did
   * not match and re-keyed the rows `k0..kn`, while the read side applied that
   * same mirror to the new keys regardless — so a host's array came back
   * re-sequenced by an arrangement belonging to rows that were gone. A write
   * that re-keys rows now hands the mirror the keys it wrote, so there is no
   * stale claim left for the read side to trust. See
   * {@link reconcileRepeatableOrders}.
   */
  _repeatableOrders: Record<string, Record<string, string[]>>;
  /**
   * Bumped every time this store's data is REPLACED wholesale underneath the
   * mounted form — a `_reset`, or a `_loadPersistedState` restore.
   *
   * The mounted form is a SEPARATE store that this one cannot write into: it
   * re-seeds itself when the form it renders is swapped, and neither a reset nor
   * a restore swaps a form (same step, same form id), so without a signal the
   * inputs would keep showing the old values while this store held new ones —
   * two stores silently diverging. WorkflowProvider folds this counter into the
   * FormProvider's key, so a replacement re-seeds the form exactly the way the
   * initial mount does.
   *
   * WHY A REPLACEMENT AND NOT "INITIALIZATION FINISHED": the key used to carry
   * `isInitializing`, which flipped when the adapter's `load()` RESOLVED —
   * whether or not it restored anything. The provider renders an interactive
   * form during that window, so a slow adapter let the user type, then remounted
   * the subtree under them: the validation error they were looking at vanished
   * and their focus was ejected to the body mid-keystroke, for a load that had
   * nothing to restore. A remount is the re-seed mechanism, so it is owed to a
   * new seed and to nothing else.
   *
   * A counter rather than a flag: consecutive replacements must each be
   * observable, and it lives in the STORE rather than in the provider because
   * every entry point (`useFlow().resetWorkflow`, `useFlowActions().reset`,
   * `useFlowActions().loadPersistedState`, the provider's own restore) must
   * propagate.
   */
  _seedGeneration: number;

  // Actions (internal - prefixed with _)
  _setCurrentStep: (stepIndex: number) => void;
  _reconcileStepSet: () => void;
  _setStepData: (data: Record<string, unknown>, stepId: string) => void;
  _setAllData: (data: Record<string, unknown>) => void;
  _setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  _removeFieldValues: (fieldIds: string[], stepId: string) => void;
  _setRepeatableOrder: (stepId: string, order: Record<string, string[]>) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _setTransitioning: (isTransitioning: boolean) => void;
  _setInitializing: (isInitializing: boolean) => void;
  _markStepVisited: (stepId: string) => void;
  _markStepPassed: (stepId: string) => void;
  _reset: () => void;
  _loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Value equality for a step's repeatable order map, so a re-report of the same
 * order does not publish a fresh state object (and re-render every consumer).
 */
function isSameRepeatableOrder(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const aIds = Object.keys(a);
  if (aIds.length !== Object.keys(b).length) return false;
  return aIds.every((id) => {
    const aKeys = getOwn(a, id);
    const bKeys = getOwn(b, id);
    return !!aKeys && !!bKeys && sameRowKeys(aKeys, bKeys);
  });
}

/**
 * A step with no slice has an EMPTY one, and it is always the SAME empty one.
 *
 * The mirror is re-derived on every write, including writes that have nothing to
 * do with data. A fresh `{}` each time would give `stepData` a new identity on
 * every `setSubmitting`, waking every consumer that selects it and every
 * `useMemo` keyed on it — the condition evaluation among them. Identity is the
 * whole reason the derivation is free.
 */
const EMPTY_SLICE: Record<string, unknown> = Object.freeze({});

/**
 * The authoritative captured data of one step.
 *
 * `allData` is the source of truth — it is seeded from the defaults at store
 * creation and is the payload handed to the host on completion. `stepData` is
 * only a live view of it, so it is READ from it and never accumulated
 * separately. A per-field write that merged into `stepData` and then published
 * the result as `allData[stepId]` overwrote the initial step's whole slice with
 * a single key on the user's very first edit, destroying every default they had
 * not yet touched — in the form and in the completion payload.
 *
 * Reading the slice back out of `allData` keeps the invariant one-directional:
 * `allData[stepId]` is written, `stepData` follows it. See
 * {@link WorkflowStoreState.stepData}.
 *
 * It returns the slice's OWN identity, so re-deriving the mirror from an
 * unchanged `allData` yields the very same object.
 */
function readStepSlice(allData: Record<string, unknown>, stepId: string): Record<string, unknown> {
  const slice = getOwn(allData, stepId);
  return typeof slice === 'object' && slice !== null && !Array.isArray(slice)
    ? (slice as Record<string, unknown>)
    : EMPTY_SLICE;
}

/**
 * A state patch as an action writes it, before the derived members are written
 * onto it.
 */
type StatePatch = Partial<WorkflowStoreState>;

/**
 * The `set` every action in this store is handed. See
 * {@link WorkflowStoreState.stepData} for why it is not the raw one.
 */
type DerivingSet = (patch: StatePatch | ((state: WorkflowStoreState) => StatePatch)) => void;

// =================================================================
// STORE FACTORY
// =================================================================

export type WorkflowStore = ReturnType<typeof createWorkflowStore>;

export interface CreateWorkflowStoreOptions {
  defaultValues?: Record<string, unknown>;
  defaultStepIndex?: number;
  /**
   * The flow's steps AS THEY ARE NOW, for the repeatable configs the store
   * normalises against and the step ids it names its mirror's owner from.
   * Omitted, the store cannot recognise an authored array and stores whatever it
   * is handed.
   *
   * AN ACCESSOR, NOT AN ARRAY. The store used to close over the steps at
   * creation, and `WorkflowProvider` creates it ONCE per mount while reading
   * `workflowConfig.steps` LIVE everywhere else — so a provider handed a
   * recompiled config honoured it for rendering and navigation while the store
   * kept normalising against MOUNT-TIME steps, and a step whose repeatable the
   * mount config had not declared went back to storing the authored array. A
   * server-driven host recompiling a FlowSchema is the headline use case, so the
   * store is not entitled to a snapshot: it asks for the steps at every read.
   *
   * Cheap by construction — this runs on every slice write, and the provider's
   * accessor is a ref read.
   *
   * IF THIS ANSWER CAN CHANGE, THE OWNER OF THE STEPS OWES THE STORE
   * {@link WorkflowStoreState._reconcileStepSet} WHEN IT DOES. Every write
   * normalises against the steps live at that write, so no caller can be the one
   * who forgot — but a step being BORN is not a write. It is this accessor
   * starting to answer differently, and the store cannot observe that on its
   * own: nothing calls it. `WorkflowProvider` — the only thing that owns both a
   * live step set and a store — discharges this at the seam where
   * `workflowConfig.steps` reaches the accessor above, on every render. A store
   * built directly, against steps that move, has the same obligation and no one
   * else to meet it.
   */
  getSteps?: () => ReadonlyArray<StepConfig>;
  /**
   * The flow's defaults AS THEY ARE NOW — the second live input, and the exact
   * mirror of {@link getSteps}. Omitted, the accessor answers with the
   * `defaultValues` the store was created with, which is the truth for a store
   * whose defaults never move.
   *
   * WHY THE DEFAULTS ARE LIVE TOO. A recompiled FlowSchema does not only move
   * the STEP SET — a step born by the recompile brings the defaults its form
   * declares, and they arrive in the same new compile the steps do. The steps
   * had a seam (`getSteps` + `_reconcileStepSet`) while the defaults were
   * captured once, at creation — so the born step rendered empty and the
   * completion payload carried `{}` where a fresh mount of the SAME schema
   * prefills. The store's own docstring assumed "a born step's default slice is
   * already in `allData`", which is true only of defaults the store was CREATED
   * holding, and false of the ones the recompile itself delivers.
   *
   * Read by `_reconcileStepSet` at the same seam the steps enter, and admitted
   * under the untouched-only guard family — see the reconciliation itself for
   * the guard.
   */
  getDefaultValues?: () => Record<string, unknown>;
  initialVisitedSteps?: Set<string>;
  initialPassedSteps?: Set<string>;
}

export function createWorkflowStore(options: CreateWorkflowStoreOptions = {}) {
  const {
    defaultValues = {},
    defaultStepIndex = 0,
    getSteps = () => [],
    getDefaultValues = () => defaultValues,
    initialVisitedSteps = new Set<string>(),
    initialPassedSteps = new Set<string>(),
  } = options;

  /**
   * THE SECOND INVARIANT, enforced the same way as the first.
   *
   * The step that owns the `stepData` mirror is the step the user is ON — a
   * function of the index, never a value a caller supplies. See
   * {@link WorkflowStoreState._currentStepId}. An out-of-range index or a store
   * created without `steps` yields `null`: the store cannot name an owner, so
   * `mirrorIfCurrent` publishes rather than withholds.
   */
  const ownerOf = (stepIndex: number): string | null => getSteps()[stepIndex]?.id ?? null;

  /**
   * THE INVARIANT, enforced where it belongs.
   *
   * A step slice inside this store is ALWAYS flat composite keys for
   * repeatables — that is what gives a removed row keys to delete. Host-authored
   * data arrives in the AUTHORED shape (`lines: [{label:'a'}]`), and it has
   * arrived through four different doors so far: the compiled defaults, the
   * provider's form-submit/`setStepData`/`StepDataHelper` writes, a persistence
   * restore, and the PUBLIC `useFlowActions()` actions. Each time the shape
   * class re-entered, it was through the door nobody had enumerated.
   *
   * So the guard is not at the doors, it is here: every write normalises on the
   * way in and no caller can be the one who forgot. The live row order is read
   * from the store's own mirror, which is strictly better than any caller could
   * do — it keeps the row KEYS stable across a re-author.
   *
   * AND THE THIRD INVARIANT, in the same breath, because it is the same write.
   * The mirror the normalisation consulted is also the mirror the normalisation
   * can invalidate — a re-author that re-keys the rows leaves every claim the
   * mirror made about them false — so the write reports the mirror it leaves
   * behind rather than leaving a caller to notice. See
   * {@link WorkflowStoreState._repeatableOrders}.
   */
  const normalizeSlice = (
    state: WorkflowStoreState,
    data: Record<string, unknown>,
    stepId: string
  ): { slice: Record<string, unknown>; orders: Record<string, Record<string, string[]>> } => {
    const flat = flattenAuthoredSlice(
      data,
      getSteps().find((step) => step.id === stepId)?.formConfig?.repeatableFields,
      getOwn(state._repeatableOrders, stepId)
    );
    return {
      slice: flat.slice,
      orders: reconcileRepeatableOrders(state._repeatableOrders, stepId, flat.rowKeys),
    };
  };

  /**
   * The seed, DERIVED AT THE MOMENT OF USE from the authored defaults and the
   * steps live RIGHT NOW.
   *
   * There are two moments — store creation and `_reset` — and they used to be
   * one: creation computed the value and `_reset` spread the cached copy. That
   * made the reset's answer a function of the step set at MOUNT, and a store
   * whose steps are live has no business caching an answer that depends on them.
   * See {@link WorkflowStoreState._defaultValues}.
   *
   * The mirror is empty at both moments — a reset clears it in the same `set`,
   * and nothing has been arranged yet at creation — so there is no arrangement
   * to keep honest and the reconciled orders come back `{}` by construction.
   * They are read back rather than assumed so that this is the same one
   * normaliser every other door uses.
   *
   * Idempotent: `flattenAuthoredSlice` returns an already-flat slice's own
   * identity, so re-deriving from the same defaults against the same steps
   * yields the same value. Nothing here can feed itself.
   *
   * IT TAKES THE DEFAULTS RATHER THAN CLOSING OVER THEM, because the two
   * moments read different owners: creation seeds from the `defaultValues`
   * handed in, and `_reset` seeds from `state._defaultValues` — the SAME values
   * plus every late default the reconciliation has admitted since. A reset
   * closing over the creation copy would restore a flow the recompile had
   * already replaced.
   */
  const seedAllData = (defaults: Record<string, unknown>) =>
    normalizeRepeatableSlices({ ...defaults }, getSteps(), {});

  /**
   * A step slice is a plain object keyed by field id — the only shape the
   * late-default admission below may reason about. Anything else is carried
   * through untouched, exactly as `normalizeRepeatableSlices` treats it.
   */
  const isSliceRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  /**
   * THE DEFAULTS MOVED — admit the ones that arrived LATE, and only those.
   *
   * `getDefaultValues()` is the store's second live input (see
   * {@link CreateWorkflowStoreOptions.getDefaultValues}): a recompile that adds
   * a step delivers that step's declared defaults in the same new compile, and
   * a store seeded once at creation never sees them. This derives, at the same
   * seam the steps enter, what the creation seed WOULD have held had the
   * defaults been there — and nothing more.
   *
   * THE GUARD IS THE UNTOUCHED-ONLY FAMILY the form level proved against the
   * workflow echo, stated at this store's granularity. A `(stepId, fieldId)`
   * pair is admitted only when BOTH:
   *
   *   - the field is NEW TO THE BASELINE — `_defaultValues` makes no claim
   *     about it. A key the baseline already holds is a default this store has
   *     already answered for; a re-emit of the same compile must be a no-op,
   *     and a changed VALUE for a known key is indistinguishable from a host
   *     echoing state around, so neither re-seeds.
   *   - NOTHING HAS WRITTEN THE FIELD — the step's slice holds neither the
   *     bare id nor any composite key belonging to it. A value in the slice is
   *     the user's (or a host write's), and a late default never rewrites it.
   *     This is also what blocks the echo path: a host echoing captured values
   *     back through `defaultValues` echoes keys the slice by definition
   *     already holds, so nothing is admitted and — as important — nothing
   *     enters the baseline, which is what keeps a later `_reset` restoring
   *     the flow's own defaults rather than the user's typed state.
   *
   * WHAT IT RETURNS IS AUTHORED, ON BOTH SURFACES. The admitted values merge
   * into `allData` in the shape the host declared them and are normalised by
   * the same `normalizeRepeatableSlices` pass every other write goes through —
   * the flat-shape invariant does not bend for this door. The baseline gains
   * the same authored values, because `_defaultValues` is host-authored data
   * that no step set can invalidate (see its docstring), and `_reset` derives
   * the seed from it at the moment of use.
   *
   * `null` when nothing is admitted, so the reconcile's publishes-nothing
   * discipline is untouched: a live defaults object recreated on every render
   * with the same content admits nothing and writes nothing.
   *
   * The accumulators are Maps: step ids and field ids are author data, and a
   * plain `out['__proto__'] = slice` reassigns the prototype instead of
   * recording the key.
   */
  const admitLateDefaults = (
    state: WorkflowStoreState
  ): { allData: Record<string, unknown>; defaultValues: Record<string, unknown> } | null => {
    const live = getDefaultValues();
    if (live === state._defaultValues) return null;

    let admitted = false;
    const nextData = new Map<string, unknown>(Object.entries(state.allData));
    const nextDefaults = new Map<string, unknown>(Object.entries(state._defaultValues));

    for (const [stepId, liveSlice] of Object.entries(live)) {
      if (!isSliceRecord(liveSlice)) continue;

      const baselineSlice = getOwn(state._defaultValues, stepId);
      if (baselineSlice !== undefined && !isSliceRecord(baselineSlice)) continue;

      const heldRaw = getOwn(state.allData, stepId);
      if (heldRaw !== undefined && !isSliceRecord(heldRaw)) continue;
      const held = heldRaw ?? {};

      // The repeatables this slice already captures — as flat composite keys,
      // which is the shape a written repeatable actually holds. A composite key
      // is self-describing, so this asks the data, never a config.
      const heldRepeatables = new Set<string>();
      for (const key of Object.keys(held)) {
        const parsed = parseCompositeKey(key);
        if (parsed) heldRepeatables.add(parsed.repeatableId);
      }

      const accepted = new Map<string, unknown>();
      for (const [fieldId, value] of Object.entries(liveSlice)) {
        if (baselineSlice && hasOwn(baselineSlice, fieldId)) continue;
        if (hasOwn(held, fieldId)) continue;
        if (heldRepeatables.has(fieldId)) continue;
        accepted.set(fieldId, value);
      }
      if (accepted.size === 0) continue;

      admitted = true;
      nextData.set(stepId, Object.fromEntries(new Map([...Object.entries(held), ...accepted])));
      nextDefaults.set(
        stepId,
        Object.fromEntries(new Map([...Object.entries(baselineSlice ?? {}), ...accepted]))
      );
    }

    if (!admitted) return null;
    return {
      allData: Object.fromEntries(nextData),
      defaultValues: Object.fromEntries(nextDefaults),
    };
  };

  const initial = seedAllData(defaultValues);
  const initialOwner = ownerOf(defaultStepIndex);

  return createStore<WorkflowStoreState>()(
    subscribeWithSelector((rawSet, get) => {
      /**
       * EVERYTHING THIS STORE DERIVES, WRITTEN ONTO A PATCH — the one and only
       * place `_currentStepId` and `stepData` are ever written.
       *
       * Every action below is handed this (through `set`), so neither the mirror
       * nor its owner is something an action publishes: they are something that
       * happens to an action's patch on the way out. The owner is a function of
       * `(currentStepIndex, getSteps())` and the mirror is a function of
       * `(allData, owner)` — every input is in the patch's own result or is read
       * live, so both are computable from it, with no help from and no
       * cooperation by the action that produced it.
       *
       * WHY THE OWNER IS HERE AND NOT IN THE THREE ACTIONS THAT USED TO PUBLISH
       * IT. `_currentStepId` was already a DERIVATION — nobody passed it in, it
       * was `ownerOf(index)` — but it was a derivation each index-moving action
       * performed for itself, which is a table of publishers wearing a
       * derivation's clothes. It had three entries (`_setCurrentStep`, `_reset`,
       * `_loadPersistedState`) and they were, between them, exhaustive over the
       * ways the INDEX moves. They were silent about the other way the pair can
       * come apart: the STEPS moving under a fixed index. A model inserts a step
       * at index 0, `currentStepIndex` is untouched and now names a DIFFERENT
       * step, the provider renders that different step — and the owner, which no
       * action was asked to re-derive because no action ran, stayed on the step
       * the user had left without moving. The mirror then faithfully,
       * freshly derived the WRONG step's slice, and spread it last over the
       * conditions. See {@link WorkflowStoreState._currentStepId}.
       *
       * So the owner is not re-derived when an action happens to move the index;
       * it is re-derived whenever anything is written at all, from the index and
       * the steps live at that instant. The table is gone, exactly as
       * `MIRROR_PUBLISHERS` before it, and for the same reason: a question asked
       * of each writer has an answer each writer can get wrong.
       *
       * THE MIRROR FOLLOWED FOR FREE, and that is the whole point of the
       * ordering: `stepData` is derived from the owner in the same expression,
       * one line later, so fixing the owner fixed the view without the view
       * being mentioned.
       *
       * IT DERIVES FROM `allData`, WHICH IS WHY IT SUBSUMES THE CROSS-STEP RULE
       * FOR FREE. A write naming another step changes `allData[other]` and
       * leaves `allData[owner]` alone, so the derived mirror comes back with the
       * CURRENT step's slice — its own former identity, unchanged and
       * unpublished. The old rule ("withhold the mirror for a write naming a
       * different step") was a special case of the derivation all along; it is
       * now a consequence rather than a clause.
       *
       * A `null` owner is the one thing it cannot answer: the index names no
       * step (there are none, or it is out of range), so there is no slice for
       * the mirror to be a view OF and the mirror is left exactly where it is.
       */
      const withDerived = (state: WorkflowStoreState, written: StatePatch): StatePatch => {
        const next = { ...state, ...written };
        const owner = ownerOf(next.currentStepIndex);
        if (owner === null) return { ...written, _currentStepId: null };
        return {
          ...written,
          _currentStepId: owner,
          stepData: readStepSlice(next.allData, owner),
        };
      };

      /**
       * The `set` every action is handed. See {@link withDerived}.
       */
      const set: DerivingSet = (patch) => {
        rawSet((state) => withDerived(state, typeof patch === 'function' ? patch(state) : patch));
      };

      return {
        // Initial state
        currentStepIndex: defaultStepIndex,
        isTransitioning: false,
        isInitializing: true,
        allData: initial.data,
        // Derived at t=0 on exactly the terms every later instant is derived on.
        // This used to be `{}` — the mirror of a step whose slice was sitting
        // right there in `allData`, on the theory that "nothing seeds it except
        // a navigation, and the initial step never navigates into itself". That
        // made the very first state the one state in the store's life where the
        // invariant did not hold, and left the mirror's correctness owed to the
        // combine layer noticing it was empty.
        stepData: initialOwner === null ? EMPTY_SLICE : readStepSlice(initial.data, initialOwner),
        visitedSteps: new Set(initialVisitedSteps),
        passedSteps: new Set(initialPassedSteps),
        isSubmitting: false,

        // Internal state
        _defaultValues: defaultValues,
        _defaultStepIndex: defaultStepIndex,
        _currentStepId: initialOwner,
        _repeatableOrders: initial.orders,
        _seedGeneration: 0,

        // Actions
        /**
         * Move navigation — and say NOTHING about the mirror or its owner. Both
         * follow on their own: the owner is a function of the index this writes,
         * and the mirror is a view of the slice the owner names.
         *
         * It used to re-derive the owner itself (`_currentStepId:
         * ownerOf(stepIndex)`), which was one of three actions doing so and
         * looked exhaustive — those three ARE every way the index moves. The way
         * the pair actually came apart was the steps moving under an index that
         * did not, which no action here could have been asked about. See
         * {@link withDerived}.
         *
         * `goToStep` used to re-seed `stepData` itself ("to prevent leaking
         * fields from the previous step"), which is the store's invariant
         * enforced at one caller: the public `useFlowActions().setCurrentStep`
         * is the same action without the re-seed, and it leaked exactly the
         * fields that comment names.
         */
        _setCurrentStep: (stepIndex) => {
          set({ currentStepIndex: stepIndex });
        },

        _setStepData: (data, stepId) => {
          set((state) => {
            const { slice, orders } = normalizeSlice(state, data, stepId);
            return {
              allData: {
                ...state.allData,
                [stepId]: slice,
              },
              _repeatableOrders: orders,
            };
          });
        },

        /**
         * Replace the WHOLE data set — every step's slice at once.
         *
         * THE SEVENTH DOOR, and the one the mirror's table of publishers left
         * out. This writes `allData` wholesale, which of course includes the
         * current step's slice, and it published no `stepData`: a host resolving
         * a batch onto the step the user is sitting on left every field
         * condition on that step reading the values it had just superseded. It
         * needs no fix of its own — it never mentioned the mirror, and the
         * mirror is no longer something an action mentions. See
         * {@link WorkflowStoreState.stepData}.
         */
        _setAllData: (data) => {
          set((state) => {
            const normalized = normalizeRepeatableSlices(data, getSteps(), state._repeatableOrders);
            return { allData: normalized.data, _repeatableOrders: normalized.orders };
          });
        },

        /**
         * THE STEP SET MOVED — re-derive every LIVE step's slice against it.
         *
         * THE HOLE THIS FILLS. Every other write normalises the slice it
         * ADDRESSES, so no caller can be the one who forgot. But a step is born
         * with NO CALLER: a host recompiles a FlowSchema and re-renders, and
         * `getSteps()` starts answering with a step it never answered with
         * before. Zero actions ran. The slice that step now owns was written —
         * or seeded from the defaults at creation — while the store could not
         * see the step, so it could not know `lines` named a repeatable, and it
         * is sitting in `allData` as an authored array under a LIVE step's id.
         * That is the flat-shape invariant broken with nothing to hang a guard
         * on, because nothing happened.
         *
         * So the guard hangs on the only event there is: the step set itself
         * changing. `WorkflowProvider` calls this where `workflowConfig.steps`
         * enters the store, so the store re-derives at the moment its mutable
         * input moves, rather than at the moment some caller happens to write.
         *
         * IT RE-SHAPES WHAT THE STORE HOLDS, AND ADMITS WHAT IT WAS NEVER
         * HANDED — the two ways a born step's defaults reach it, and they are
         * different events. A default the store was CREATED holding is already
         * in `allData` (creation seeded it, authored, because the step was not
         * there to ask), so re-shaping it IS seeding it: no notion of which
         * slices are the user's is needed, because re-shaping an already-flat
         * slice is the identity — `flattenAuthoredSlice` hands back the slice
         * it was given, and there is no branch that could clobber. But a
         * default that arrives WITH the recompile — a born step's form declares
         * it, and it enters through `getDefaultValues()`, the store's second
         * live input — is in NEITHER `allData` nor the baseline, and re-shaping
         * cannot conjure it. That half IS a seed, so it is the guarded half:
         * see `admitLateDefaults` for the untouched-only admission that keeps
         * "a step holding the user's input is left alone" true of it.
         *
         * IT RE-DERIVES THE MIRROR'S OWNER TOO, AND IT IS THE ONLY THING THAT
         * CAN. `_currentStepId` is a function of `(currentStepIndex, getSteps())`
         * and this action is the only announcement the second input ever makes.
         * Every OTHER way the pair can come apart is an action moving the index,
         * and the write boundary re-derives the owner on any write at all — but a
         * step being INSERTED BEFORE the user is not a write. `currentStepIndex`
         * is untouched and now names a different step; the provider renders that
         * different step; nothing else in this store's life will ever notice,
         * because the user is exactly where they were and only a move used to
         * ask. This action does not mention the owner either — it just writes,
         * and the boundary derives — but it is the reason there is a write at
         * all. See {@link withDerived}.
         *
         * IDEMPOTENT, AND IT MUST BE — it runs on every render of the provider,
         * unguarded, because a guard on "did the steps change?" is one more thing
         * a caller can get wrong and this class is made of exactly those. So it
         * PUBLISHES NOTHING when nothing moved: no `set`, no notification, no
         * render loop. A second call computes the same identities and returns.
         *
         * AND IT ASKS THAT OF THE DERIVED PATCH, NOT OF THE TWO KEYS IT WRITES
         * BY HAND. "Did anything move?" used to compare `allData` and
         * `_repeatableOrders` — the members this action names — which was a
         * correct answer to the wrong question: what this action PUBLISHES is
         * whatever the write boundary derives onto what it writes, and the owner
         * moving is invisible in the two keys above. So the check is applied to
         * the boundary's own output, and a member the boundary starts deriving
         * tomorrow is covered here for the same reason it is covered
         * everywhere else — nobody had to remember it.
         */
        _reconcileStepSet: () => {
          const state = get();
          // The OTHER live input, read at the same seam. A recompile that adds
          // a step delivers the defaults its form declares, and they are not
          // in `allData` — creation could not seed what it was never handed.
          // Admission is guarded (untouched fields, new-to-baseline keys only —
          // see `admitLateDefaults`), so "a step holding the user's input is
          // left alone" survives this addition unchanged; the admitted values
          // then flow through the same normalisation as everything else, so a
          // late repeatable default lands flat like any other.
          const late = admitLateDefaults(state);
          const normalized = normalizeRepeatableSlices(
            late ? late.allData : state.allData,
            getSteps(),
            state._repeatableOrders
          );
          const patch = withDerived(state, {
            allData: normalized.data,
            _repeatableOrders: normalized.orders,
            // The baseline learns the admitted defaults in the AUTHORED shape,
            // so a later `_reset` re-seeds the born step exactly as a store
            // created with the full compile would.
            ...(late ? { _defaultValues: late.defaultValues } : {}),
          });
          const moved = Object.keys(patch).some(
            (key) =>
              !Object.is(patch[key as keyof StatePatch], state[key as keyof WorkflowStoreState])
          );
          if (!moved) return;

          set(patch);
        },

        /**
         * The form reports composite key ids, so its own calls are already flat.
         * The PUBLIC `useFlowActions().setFieldValue` is the same action, and a
         * host reaching for it prefills the way it authors everything else —
         * `setFieldValue('lines', [{label:'a'}], 'items')`. Exempting this action
         * because ONE of its callers happens to speak flat is how the shape class
         * re-entered a fifth time. It normalises like every other write.
         */
        _setFieldValue: (fieldId, value, stepId) => {
          set((state) => {
            const { slice, orders } = normalizeSlice(
              state,
              { ...readStepSlice(state.allData, stepId), [fieldId]: value },
              stepId
            );
            return {
              allData: {
                ...state.allData,
                [stepId]: slice,
              },
              _repeatableOrders: orders,
            };
          });
        },

        /**
         * Delete field ids from a step's captured data.
         *
         * The mirror of `_setFieldValue`, and the reason the step slice is not
         * merge-only: a repeatable row the user removed has no value to write, it
         * has keys that must cease to exist. Deleting the reported keys (rather
         * than replacing the whole slice with the form's values) keeps every
         * non-form writer of the slice — prefill bindings, `onAfterValidation` —
         * authoritative for the keys it owns.
         *
         * IT NORMALISES FIRST, like every other action that touches a slice, and
         * "it only deletes, so it cannot re-shape anything" is exactly why it did
         * not. That was true of the SHAPE it writes and false of the shape it
         * READS: a slice that entered while its step was not live is an authored
         * array (the store could not know `lines` named a repeatable), and a
         * recompile that adds the step makes that array a live step's slice with
         * no `lines[k0].label` for this delete to find. The user removes the row,
         * the delete matches nothing, the row comes back — the very failure the
         * flat shape exists to prevent, arriving through the one door that trusted
         * the slice to already be flat instead of deriving it against the steps
         * live NOW.
         */
        _removeFieldValues: (fieldIds, stepId) => {
          set((state) => {
            const current = readStepSlice(state.allData, stepId);
            const { slice, orders } = normalizeSlice(state, current, stepId);
            const kept = { ...slice };
            let removed = false;
            for (const fieldId of fieldIds) {
              if (hasOwn(kept, fieldId)) {
                delete kept[fieldId];
                removed = true;
              }
            }
            // `normalizeSlice` hands back the slice's own identity when there was
            // nothing authored to flatten, so this asks whether the normalisation
            // itself changed anything. A delete that matched nothing AND reshaped
            // nothing publishes nothing, and no subscriber is woken.
            if (!removed && slice === current) return {};

            return {
              allData: {
                ...state.allData,
                [stepId]: kept,
              },
              _repeatableOrders: orders,
            };
          });
        },

        /**
         * The mirror's ONE write boundary — see {@link admissibleStepOrder} for
         * why it derives what this step may claim instead of storing the pair it
         * is handed.
         *
         * The caller is `WorkflowProvider`, pairing a form's order report with
         * `currentStep?.id` read at CALL TIME. The two halves of that pair come
         * from different places and are only reliably about the same step
         * because the mounted form is normally reset in the same commit that
         * moves `currentStep` — an incidental synchronisation, not a guarantee.
         * When it does not hold (two steps sharing a form id and a shape are ONE
         * form to `FormProvider`, which therefore never resets between them), the
         * outgoing step's form reports its arrangement and this action files it
         * under the incoming step's id. So the pair is checked against the one
         * thing that cannot be mistaken about which rows exist: the step's own
         * slice.
         */
        _setRepeatableOrder: (stepId, order) => {
          set((state) => {
            const admitted = admissibleStepOrder(readStepSlice(state.allData, stepId), order);
            const current = getOwn(state._repeatableOrders, stepId);

            // Nothing this step can bear out. An absent entry is not an empty
            // claim but no claim at all, so there is nothing to write — and
            // nothing to retract either: an entry already here describes rows
            // this report simply says nothing about.
            if (!admitted) return {};
            if (current && isSameRepeatableOrder(current, admitted)) return {};

            return {
              _repeatableOrders: { ...state._repeatableOrders, [stepId]: admitted },
            };
          });
        },

        _setSubmitting: (isSubmitting) => {
          set({ isSubmitting });
        },

        _setTransitioning: (isTransitioning) => {
          set({ isTransitioning });
        },

        _setInitializing: (isInitializing) => {
          set({ isInitializing });
        },

        _markStepVisited: (stepId) => {
          set((state) => ({
            visitedSteps: new Set([...state.visitedSteps, stepId]),
          }));
        },

        _markStepPassed: (stepId) => {
          set((state) => ({
            passedSteps: new Set([...state.passedSteps, stepId]),
          }));
        },

        _reset: () => {
          const state = get();
          // The seed is DERIVED here, against the steps live at this instant —
          // not spread from a copy the store normalised at mount. A recompile
          // that ADDED a step the defaults speak for is honoured by this reset;
          // the cached copy could only ever answer for the mount's step set, and
          // re-planted the authored array of a step that had since been born.
          // See {@link WorkflowStoreState._defaultValues}.
          //
          // FROM THE STATE'S OWN BASELINE, not the creation copy: the baseline
          // carries every late default the reconciliation admitted since mount,
          // and a reset that read the creation copy would restore a flow the
          // recompile had already replaced.
          const seed = seedAllData(state._defaultValues);
          set({
            currentStepIndex: state._defaultStepIndex,
            allData: seed.data,
            // The index returns to its default, so the mirror's owner does too —
            // and the mirror itself follows the owner, as ever, without this
            // action saying anything about either. It used to blank `stepData`
            // here, which was the same "a fresh session has an empty mirror"
            // theory the initial state held, and just as wrong: the user lands on
            // the default step, and that step's slice is the freshly seeded
            // defaults.
            // Derived in the same breath as the slice it describes, from an empty
            // mirror, so the two cannot disagree about the rows.
            _repeatableOrders: seed.orders,
            visitedSteps: new Set(),
            passedSteps: new Set(),
            isSubmitting: false,
            isTransitioning: false,
            isInitializing: false,
            // A new seed: signal it to the mounted form, a separate store.
            _seedGeneration: state._seedGeneration + 1,
          });
        },

        _loadPersistedState: (persistedState) => {
          set((state) => {
            const restored = { ...state, ...persistedState };
            // A snapshot is host-authored data like any other: it may have been
            // written by a build that stored authored arrays, or by a host that
            // saved its own. It comes in through the same guard — and the mirror
            // that guard consults is the RESTORED one, because a snapshot carrying
            // an arrangement carries it for the very rows it is restoring
            // alongside. Reaching for the live mirror instead would sequence the
            // incoming session's rows by the outgoing session's arrangement.
            const normalized = persistedState.allData
              ? normalizeRepeatableSlices(
                  persistedState.allData,
                  getSteps(),
                  restored._repeatableOrders
                )
              : undefined;
            return {
              ...restored,
              ...(normalized
                ? { allData: normalized.data, _repeatableOrders: normalized.orders }
                : {}),
              // A restore MOVES the index — `currentStepIndex` is part of the
              // snapshot — and the mirror's owner is re-derived from where the
              // restore actually landed WITHOUT this action saying so, at the
              // write boundary, from the index restored above. A
              // `_currentStepId` in the snapshot arrives through the
              // `{...state, ...persistedState}` spread and is overwritten there:
              // it is the index that says where the user is, and a snapshot
              // carrying a stale pair has no standing to reinstate the desync
              // the derivation exists to forbid — and now no way to.
              //
              // AND THE MIRROR IT OWNS IS NOT MENTIONED HERE EITHER, ON THE SAME
              // TERMS AND THEN SOME. A `stepData` in the snapshot arrives through
              // the `{...state, ...persistedState}` spread above and is
              // OVERWRITTEN on the way out by the derivation at this store's write
              // boundary — from the `allData` restored beside it, after the
              // normalisation. `WorkflowProvider` used to compute the mirror
              // itself and hand it over as `mergeStepSlices(_defaultValues,
              // persisted)[stepId]`: the same slice one step too early, before the
              // normaliser had seen it. A snapshot has no standing to assert a
              // view, and now no way to. See {@link WorkflowStoreState.stepData}.
              isInitializing: false,
              // A restore REPLACES the seed the mounted form was built from, so
              // the form owes itself a re-seed. This is the only thing that earns
              // a remount here: the load merely RESOLVING earns nothing, and used
              // to cost the user their validation errors and their focus.
              _seedGeneration: state._seedGeneration + 1,
            };
          });
        },
      };
    })
  );
}
