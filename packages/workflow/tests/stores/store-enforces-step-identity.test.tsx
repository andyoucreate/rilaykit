import type { StepConfig } from '@rilaykit/core';
import { getOwn, ril } from '@rilaykit/core';
import { form, parseCompositeKey } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UseFlowActionsResult, WorkflowStore, WorkflowStoreState } from '../../src';
import { FlowBody, WorkflowProvider, createWorkflowStore, useFlow, useFlowActions } from '../../src';
import { flow } from '../../src/builders/flow';
import { structureStepSlice, structureWorkflowData } from '../../src/utils/structureWorkflowData';

/**
 * THE FOURTH INVARIANT KEYED OFF STEP IDENTITY — and the enumeration of the
 * WHOLE CLASS.
 *
 * The class, stated once: the store keys state off step ids, and the step set is
 * LIVE — `createWorkflowStore` takes `getSteps()`, an accessor, precisely so a
 * host recompiling a FlowSchema is honoured at once. So a step id in the store's
 * state is NOT a guaranteed member of `getSteps()`. Every previous member of
 * this class was a guard that quietly assumed it was:
 *
 *   1+2. the flat-shape normaliser — `store-enforces-flat-shape.test.tsx`
 *   3.   the `stepData` mirror owner (`_currentStepId`) — derived from the index
 *   4.   the order mirror (`_repeatableOrders`) — `store-enforces-order-mirror`
 *
 * THIS ONE — `structureWorkflowData` iterated the STEPS and structured the slice
 * each one named, seeding its output with `new Map(Object.entries(allData))`. A
 * slice whose step is no longer live was therefore never visited, and passed
 * through VERBATIM — carrying the store's INTERNAL flat composite keys
 * (`lines[k0].label`) into the completion payload, into `onAfterValidation`, and
 * into `WorkflowContext.allData`. The exported door is `useFlowActions()
 * .setStepData(data, stepId)` plus any recompile that drops or renames a step
 * that already holds data — a persisted session restored into a newer schema is
 * the same shape.
 *
 * It is the same failure as the four before it: a loop justified by "the steps
 * ARE the slices", true of a store whose step set never moves and false of the
 * one this package actually ships.
 *
 * THE FIX IS THE LESSON — derive, don't ask. The read boundary no longer asks
 * the config which keys are a repeatable's rows; a flat composite key is
 * SELF-DESCRIBING (`lines[k0].label` names the repeatable, the row and the
 * field), so the boundary derives that from the data it is handed and structures
 * every slice it is given. A config, when there is one, only orders the fields
 * WITHIN a row. There is no longer a slice the boundary can decline to visit,
 * because it no longer consults a list of steps to decide.
 */

const catalog = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

/**
 * Step ids deliberately unlike any field id in the flow: the enumeration below
 * DERIVES which state members are keyed by step identity by looking for live
 * step ids among their keys, and a field id colliding with a step id would make
 * `stepData` (keyed by FIELD id) read as step-keyed.
 */
const ALPHA = 'step-alpha';
const BRAVO = 'step-bravo';

function buildFlow(includeBravo: boolean) {
  const base = flow.create(catalog, 'wf', 'Order').addStep({
    id: ALPHA,
    title: 'Alpha',
    formConfig: form.create(catalog, 'alpha-form').add({ id: 'who', type: 'text', props: {} }),
  });
  if (!includeBravo) return base.build();
  return base
    .addStep({
      id: BRAVO,
      title: 'Bravo',
      formConfig: form
        .create(catalog, 'bravo-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

const ALL_STEPS = buildFlow(true).steps;
const ALPHA_ONLY = buildFlow(false).steps;

/** The rows a host authors, and the shape it must read back. */
const AUTHORED = [{ label: 'alpha' }, { label: 'beta' }];

// =================================================================
// THE READ BOUNDARIES, CALLED THE WAY PRODUCTION CALLS THEM
// =================================================================

/** `allData` as a host receives it — the call `useWorkflowSubmission` makes. */
function hostAllData(store: WorkflowStore, liveSteps: ReadonlyArray<StepConfig>) {
  const state = store.getState();
  return structureWorkflowData(state.allData, liveSteps, state._repeatableOrders);
}

/**
 * `stepData` as a host receives it — the call `WorkflowProvider`'s context
 * makes, including its CLAMP: an index past the end of a shrunken step list
 * resolves to the last live step, so the configs handed here are that step's,
 * never the dead step the mirror actually holds.
 */
function hostStepData(store: WorkflowStore, liveSteps: ReadonlyArray<StepConfig>) {
  const state = store.getState();
  const index = Math.min(Math.max(0, state.currentStepIndex), liveSteps.length - 1);
  const step = liveSteps[index];
  return structureStepSlice(
    state.stepData,
    step?.formConfig?.repeatableFields,
    step ? getOwn(state._repeatableOrders, step.id) : undefined
  );
}

/**
 * No key anywhere in a host-facing payload is one of the store's internal flat
 * composite keys. The exact-shape assertions beside each use of this say what
 * the host DOES get; this says what it never gets, on every slice at once, so a
 * leak in a slice the test did not think to name still fails.
 */
function expectNoInternalKeys(payload: Record<string, unknown>): void {
  for (const slice of Object.values(payload)) {
    if (typeof slice !== 'object' || slice === null || Array.isArray(slice)) continue;
    for (const key of Object.keys(slice)) {
      expect(parseCompositeKey(key)).toBeNull();
    }
  }
}

// =================================================================
// THE REPRO — A RECOMPILE THAT DROPS A FILLED STEP
// =================================================================

function RecompileHarness() {
  const { submitWorkflow } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <button
        type="button"
        data-testid="host-write"
        onClick={() => actions.setStepData({ lines: AUTHORED }, BRAVO)}
      >
        write
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <FlowBody />
    </div>
  );
}

describe('a step dropped by a recompile does not leak the store internals it left behind', () => {
  it('the completion payload speaks the authored shape for a step that is gone', async () => {
    // A server-driven host: the flow is compiled with `step-bravo`, the host
    // prefills it through the PUBLIC action, and a recompile then drops the
    // step — the headline use case `createWorkflowStore`'s `getSteps` accessor
    // exists for. The slice `step-bravo` left behind is the store's internal
    // flat keys, and the host is about to ship it to its own backend.
    const onWorkflowComplete = vi.fn();
    const { rerender } = render(
      <WorkflowProvider workflowConfig={buildFlow(true)} onWorkflowComplete={onWorkflowComplete}>
        <RecompileHarness />
      </WorkflowProvider>
    );

    fireEvent.click(screen.getByTestId('host-write'));

    rerender(
      <WorkflowProvider workflowConfig={buildFlow(false)} onWorkflowComplete={onWorkflowComplete}>
        <RecompileHarness />
      </WorkflowProvider>
    );

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    // The host authored these rows. It gets them back — in its own shape.
    expect(payload[BRAVO]).toEqual({ lines: AUTHORED });
    expectNoInternalKeys(payload);
  });
});

// =================================================================
// THE ENUMERATION — EVERY PIECE OF STATE KEYED BY STEP IDENTITY
// =================================================================

/**
 * DERIVED FROM THE STORE, NOT LISTED BY HAND. A hand-written list of "the maps
 * keyed by step id" is a comment with a test runner attached: it goes stale the
 * moment someone adds the next one, which is exactly the event this enumeration
 * exists to catch. So the list is read off a REAL store's own state at runtime —
 * a member is keyed by step identity when it NAMES a live step: its value is a
 * step id, or its keys include one, or its set holds one.
 *
 * The seeding below therefore matters as much as the assertion: every step-keyed
 * member must actually hold a step id when the derivation runs, or it hides.
 */
function stepIdentityMembers(state: WorkflowStoreState, liveStepIds: string[]): string[] {
  const namesAStep = (value: unknown): boolean => {
    if (typeof value === 'string') return liveStepIds.includes(value);
    if (value instanceof Set) return liveStepIds.some((id) => value.has(id));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return liveStepIds.some((id) => getOwn(value as Record<string, unknown>, id) !== undefined);
  };

  return Object.keys(state)
    .filter((key) => namesAStep(state[key as keyof WorkflowStoreState]))
    .sort();
}

/**
 * A store whose step set is LIVE, the way `WorkflowProvider` builds it (its
 * `getSteps` is a ref read of `workflowConfig.steps`). `dropBravo` is a
 * recompile: no store API is involved, and that is the point — the store cannot
 * be notified, so nothing it holds keyed off `step-bravo` gets a chance to be
 * cleaned up.
 */
function createLiveHarness(defaultValues?: Record<string, unknown>) {
  let liveSteps: ReadonlyArray<StepConfig> = ALL_STEPS;
  const store = createWorkflowStore({
    getSteps: () => liveSteps,
    defaultValues,
    // `step-bravo` is the current step, so `_currentStepId` names it.
    defaultStepIndex: 1,
  });
  return {
    store,
    dropBravo: () => {
      liveSteps = ALPHA_ONLY;
    },
    getLiveSteps: () => liveSteps,
  };
}

/**
 * How an orphan gets into one step-identity-keyed member, and what the host must
 * see once it is there.
 *
 * `null` classifies a member that CANNOT carry a store internal — it holds step
 * ids and nothing else, and a step id is host-authored data, not an internal
 * representation. The classification is checked, not asserted: see the test
 * below the table.
 */
interface OrphanProbe {
  /** Put an orphan in this member, with `step-bravo` still live. */
  readonly seed: (store: WorkflowStore) => void;
  /** Drive this member's read boundary and assert the host sees the contract. */
  readonly assertHostSeesContract: (
    store: WorkflowStore,
    liveSteps: ReadonlyArray<StepConfig>
  ) => void;
  /** Defaults the store must be created with for `seed` to mean anything. */
  readonly defaultValues?: Record<string, unknown>;
}

describe('EVERY piece of store state keyed by step identity handles a step that is gone', () => {
  const STEP_IDENTITY_STATE: Record<string, OrphanProbe | null> = {
    /**
     * The payload itself. A slice for a dead step is the whole bug: it holds
     * whatever the store put there while the step was live — flat composite
     * keys — and the read boundary used to skip it because no live step named it.
     */
    allData: {
      seed: (store) => store.getState()._setStepData({ lines: AUTHORED }, BRAVO),
      assertHostSeesContract: (store, liveSteps) => {
        const payload = hostAllData(store, liveSteps);
        expect(payload[BRAVO]).toEqual({ lines: AUTHORED });
        expectNoInternalKeys(payload);
      },
    },

    /**
     * The seed `_reset` restores — the flow's defaults, AS THE HOST AUTHORED
     * THEM. `_reset` derives the seed from them against the steps live at the
     * moment of the reset, so a `reset()` after a recompile plants a slice for
     * a step that is gone exactly as `_setStepData` would. Its read boundary is
     * therefore `allData`'s. The write side of this member — the reason it is
     * authored rather than normalised at mount — is the enumeration below.
     */
    _defaultValues: {
      defaultValues: { [BRAVO]: { lines: AUTHORED } },
      seed: (store) => store.getState()._reset(),
      assertHostSeesContract: (store, liveSteps) => {
        const payload = hostAllData(store, liveSteps);
        expect(payload[BRAVO]).toEqual({ lines: AUTHORED });
        expectNoInternalKeys(payload);
      },
    },

    /**
     * The user's arrangement. It is unreconstructable from the values, so a
     * boundary that skips the dead step's slice does not merely leak keys — it
     * also drops the only record of the drag. Both halves are asserted: the
     * rows come out authored AND in the order the user put them in.
     */
    _repeatableOrders: {
      seed: (store) => {
        store.getState()._setStepData({ lines: AUTHORED }, BRAVO);
        store.getState()._setRepeatableOrder(BRAVO, { lines: ['k1', 'k0'] });
      },
      assertHostSeesContract: (store, liveSteps) => {
        const payload = hostAllData(store, liveSteps);
        expect(payload[BRAVO]).toEqual({ lines: [{ label: 'beta' }, { label: 'alpha' }] });
        expectNoInternalKeys(payload);
      },
    },

    /**
     * The `stepData` mirror's owner. Dropping the step the user is ON leaves
     * this naming a dead step while `WorkflowProvider` CLAMPS its `currentStep`
     * into the shrunken list — so the mirror holds `step-bravo`'s rows and the
     * boundary is handed `step-alpha`'s configs, which declare no repeatable at
     * all. The mismatch is unavoidable (the owner cannot be re-derived without
     * a store call the recompile never makes), so the BOUNDARY must not need
     * the configs to be right.
     */
    _currentStepId: {
      seed: (store) => store.getState()._setStepData({ lines: AUTHORED }, BRAVO),
      assertHostSeesContract: (store, liveSteps) => {
        const stepData = hostStepData(store, liveSteps);
        expect(stepData).toEqual({ lines: AUTHORED });
        expectNoInternalKeys({ slice: stepData });
      },
    },

    // Progress marks: a Set of step ids and nothing more. There is no slice, no
    // shape and no internal representation for an orphan id to carry — the id
    // itself is the host's own. Checked below.
    visitedSteps: null,
    passedSteps: null,
  };

  it('enumerates EVERY piece of store state keyed by step identity', () => {
    // Seed every step-keyed member so none can hide from the derivation: a
    // member holding no step id when this runs is a member this enumeration
    // silently does not cover.
    const { store, getLiveSteps } = createLiveHarness({ [ALPHA]: { who: 'x' } });
    const state = store.getState();
    state._setStepData({ lines: AUTHORED }, BRAVO);
    state._setRepeatableOrder(BRAVO, { lines: ['k1', 'k0'] });
    state._markStepVisited(ALPHA);
    state._markStepPassed(ALPHA);

    const liveStepIds = getLiveSteps().map((step) => step.id);

    // A NEW map keyed by step id, added without an entry above, lands here.
    // That is the tripwire: P3 is about to add public API, and every step-keyed
    // map it adds owes this table an answer for a step that is gone.
    expect(stepIdentityMembers(store.getState(), liveStepIds)).toEqual(
      Object.keys(STEP_IDENTITY_STATE).sort()
    );
  });

  const orphanCarriers = Object.entries(STEP_IDENTITY_STATE).filter(
    ([, probe]) => probe !== null
  ) as Array<[string, OrphanProbe]>;

  it.each(orphanCarriers)(
    '%s hands the host the authored shape for a step that is no longer live',
    (_name, probe) => {
      const { store, dropBravo, getLiveSteps } = createLiveHarness(probe.defaultValues);

      probe.seed(store);
      // The recompile. Nothing tells the store; nothing can.
      dropBravo();

      probe.assertHostSeesContract(store, getLiveSteps());
    }
  );

  it('visitedSteps and passedSteps hold step ids and never a slice', () => {
    const { store, dropBravo, getLiveSteps } = createLiveHarness();

    store.getState()._markStepVisited(BRAVO);
    store.getState()._markStepPassed(BRAVO);
    dropBravo();

    // An orphan id is the host's own string. It reaches the host as itself,
    // carries no representation, and cannot leak one.
    const state = store.getState();
    expect([...state.visitedSteps]).toEqual([BRAVO]);
    expect([...state.passedSteps]).toEqual([BRAVO]);
    expect(hostAllData(store, getLiveSteps())).toEqual({});
  });
});

// =================================================================
// THE ENUMERATION — THE WRITE SIDE, WHEN A STEP IS BORN
// =================================================================

/**
 * THE SAME CLASS, MIRRORED. The enumeration above asks what the HOST READS when
 * a step DIES. This asks what the STORE WRITES when a step is BORN — and it is
 * the same failure with the arrow reversed.
 *
 * THE INSTANCE. `_defaultValues` used to hold what `normalizeRepeatableSlices`
 * returned at store CREATION. A normalisation is a function of the defaults AND
 * THE STEPS, and the steps are LIVE — so that cached answer was only ever
 * correct against the step set of the instant it was computed:
 *
 *   1. a default for `step-bravo`, which the MOUNT config does not declare, is
 *      stored AUTHORED — the store cannot know `lines` names a repeatable,
 *      because the step declaring it is not there to ask;
 *   2. a recompile ADDS `step-bravo`;
 *   3. `_reset` — `useFlowActions().reset()`, `useFlow().resetWorkflow()` —
 *      spreads the stale cache back into `allData`, and `lines: [{...}]` lands
 *      as a LIVE step's slice.
 *
 * That is the flat-shape invariant broken with a row `_removeFieldValues` cannot
 * reach: the user removes the row, the delete matches no key, the row comes
 * back and is submitted. The original CRITICAL, re-entering through the one
 * value nobody had asked whether it was a derivation.
 *
 * THE FIX IS THE LESSON, AGAIN — derive, don't ask, and never cache an answer
 * that depends on a mutable input. `_defaultValues` now holds the defaults in
 * the shape the HOST authored them, which no step set can invalidate, and the
 * seed is derived from them at the moment of use. There is no cached
 * normalisation left for a recompile to invalidate, because there is no cached
 * normalisation.
 *
 * WHAT THIS ENUMERATION IS. Not "reset re-normalises now" — that is the
 * instance, and the instance is the cheap half. Every action on both surfaces is
 * CLASSIFIED as one that addresses a step's slice or one that does not, and:
 *
 *   - every action that addresses a slice must leave every LIVE step's slice
 *     flat, with the step set having MOVED since mount;
 *   - every action classified as addressing no slice must be PROVED to address
 *     none — `allData` keeps its identity — rather than asserted to in a
 *     comment. That is the half that would have caught this one: `_reset` was
 *     `null` in two existing tables, and both justifications were true of what
 *     it wrote and silent about what it read.
 *
 * A member normalised at mount against live steps cannot survive this: it can
 * only reach `allData` through an action, and every action is here.
 */

/** The rows a host authors for a step the MOUNT config does not declare. */
const BORN_DEFAULTS = { [BRAVO]: { lines: AUTHORED } };

/** The same rows the store's way: flat composite keys, one per field per row. */
const BORN_FLAT = { 'lines[k0].label': 'alpha', 'lines[k1].label': 'beta' };

/**
 * `step-bravo`, renamed by a recompile. A rename is a death and a birth in one
 * re-render, so it is the mutation that exercises both halves of the class at
 * once: `step-bravo`'s slice is orphaned and `step-charlie` is born.
 */
const CHARLIE = 'step-charlie';

function buildRenamedFlow() {
  return buildFlow(false).steps.concat({
    id: CHARLIE,
    title: 'Charlie',
    formConfig: form
      .create(catalog, 'charlie-form')
      .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
  });
}

/**
 * No LIVE step's slice holds a repeatable's rows as an authored array under its
 * bare id — the flat-shape invariant, asserted from the CONFIGS rather than a
 * list of step ids, so a step this test never names still fails.
 *
 * The assertion carries the step and the field so a failure says WHICH slice
 * broke rather than `expected true to be false`.
 */
function expectLiveSlicesFlat(
  state: WorkflowStoreState,
  liveSteps: ReadonlyArray<StepConfig>
): void {
  for (const step of liveSteps) {
    const slice = getOwn(state.allData, step.id);
    if (typeof slice !== 'object' || slice === null || Array.isArray(slice)) continue;
    for (const repeatableId of Object.keys(step.formConfig?.repeatableFields ?? {})) {
      const authored = getOwn(slice as Record<string, unknown>, repeatableId);
      expect({ step: step.id, repeatable: repeatableId, authoredArray: authored }).toEqual({
        step: step.id,
        repeatable: repeatableId,
        authoredArray: undefined,
      });
    }
  }
}

/**
 * A store that mounted WITHOUT `step-bravo` while holding a default for it, the
 * way `WorkflowProvider` builds one: `getSteps` is a live read, `defaultValues`
 * is captured once at creation and never re-seeded.
 *
 * `mutate` is a recompile. No store API is involved — the store cannot be
 * notified, which is precisely why nothing it computed at mount is allowed to
 * depend on the step set.
 */
function createBornHarness(mutate: () => ReadonlyArray<StepConfig>) {
  let liveSteps: ReadonlyArray<StepConfig> = ALPHA_ONLY;
  const store = createWorkflowStore({
    getSteps: () => liveSteps,
    defaultValues: BORN_DEFAULTS,
  });
  return {
    store,
    recompile: () => {
      liveSteps = mutate();
    },
    getLiveSteps: () => liveSteps,
  };
}

const STEP_SET_MUTATIONS: Record<string, () => ReadonlyArray<StepConfig>> = {
  'a step is born': () => ALL_STEPS,
  'a step dies': () => ALPHA_ONLY.slice(),
  'a step is renamed': buildRenamedFlow,
};

describe('NO step-identity-keyed member is a normalisation cached against the MOUNT steps', () => {
  /**
   * `_defaultValues` is the member this enumeration exists for, and this is its
   * whole contract: it is HOST-AUTHORED DATA, so there is nothing in it for a
   * step set to invalidate. A flat composite key in here is a normalisation
   * someone cached — the bug itself, caught at the member rather than at the
   * door it happened to leak through.
   */
  it.each(Object.entries(STEP_SET_MUTATIONS))(
    '_defaultValues holds the AUTHORED defaults, so %s cannot invalidate it',
    (_name, mutate) => {
      const { store, recompile } = createBornHarness(mutate);
      recompile();

      expect(store.getState()._defaultValues).toEqual(BORN_DEFAULTS);
      for (const slice of Object.values(store.getState()._defaultValues)) {
        for (const key of Object.keys(slice as Record<string, unknown>)) {
          expect(parseCompositeKey(key)).toBeNull();
        }
      }
    }
  );

  /**
   * THE INSTANCE, through the exported door. `useFlowActions().reset()` and
   * `useFlow().resetWorkflow()` are the same `_reset`.
   */
  it('reset() after a recompile that ADDS a step seeds the flat shape, not the authored array', () => {
    const { store, recompile } = createBornHarness(STEP_SET_MUTATIONS['a step is born']);
    recompile();

    store.getState()._reset();

    // The row the host authored, in the shape that gives it keys to delete.
    expect(store.getState().allData[BRAVO]).toEqual(BORN_FLAT);
  });

  it('a row seeded by reset() into a step born by a recompile can be removed', () => {
    // The CRITICAL, stated as the user experiences it: the row `_removeFieldValues`
    // cannot reach is the row that survives the user's delete and is submitted.
    const { store, recompile } = createBornHarness(STEP_SET_MUTATIONS['a step is born']);
    recompile();
    store.getState()._reset();

    store.getState()._removeFieldValues(['lines[k0].label'], BRAVO);

    expect(store.getState().allData[BRAVO]).toEqual({ 'lines[k1].label': 'beta' });
  });
});

/**
 * EVERY ACTION, ON BOTH SURFACES, AGAINST A STEP SET THAT MOVED.
 *
 * The public surface and the internal one are enumerated together here because
 * the property is the same for both and the internal surface is where the
 * exported doors land. A new action on either without an entry fails.
 */
describe('EVERY action leaves every LIVE step flat when the step set moved since mount', () => {
  /**
   * Every action the store exposes, and how to make it address a step's slice.
   *
   * `null` classifies an action that addresses NO slice — navigation, flags,
   * progress marks. The classification is PROVED below (`allData` keeps its
   * identity), never asserted: `_reset` sat in the `null` bucket of two other
   * tables on exactly this reasoning, and it was reading `_defaultValues` the
   * whole time.
   */
  const SLICE_ADDRESSERS: Record<string, ((store: WorkflowStore) => void) | null> = {
    _setCurrentStep: null,
    _setStepData: (store) => store.getState()._setStepData({ lines: AUTHORED }, BRAVO),
    _setAllData: (store) => store.getState()._setAllData({ [BRAVO]: { lines: AUTHORED } }),
    _setFieldValue: (store) => store.getState()._setFieldValue('lines', AUTHORED, BRAVO),
    // It only deletes — and it used to trust the slice to already be flat, which
    // is what made the born step's authored array untouchable. It normalises
    // against the live steps like every other action now, so it addresses a
    // slice and owes this property an answer.
    _removeFieldValues: (store) => store.getState()._removeFieldValues(['lines[k0].label'], BRAVO),
    _setRepeatableOrder: null,
    _setSubmitting: null,
    _setTransitioning: null,
    _setInitializing: null,
    _markStepVisited: null,
    _markStepPassed: null,
    _reset: (store) => store.getState()._reset(),
    _loadPersistedState: (store) =>
      store.getState()._loadPersistedState({ allData: { [BRAVO]: { lines: AUTHORED } } }),
  };

  /** How to drive each `null`-classified action, to PROVE it writes no slice. */
  const NON_ADDRESSERS: Record<string, (store: WorkflowStore) => void> = {
    _setCurrentStep: (store) => store.getState()._setCurrentStep(0),
    _setRepeatableOrder: (store) => store.getState()._setRepeatableOrder(BRAVO, { lines: ['k0'] }),
    _setSubmitting: (store) => store.getState()._setSubmitting(true),
    _setTransitioning: (store) => store.getState()._setTransitioning(true),
    _setInitializing: (store) => store.getState()._setInitializing(false),
    _markStepVisited: (store) => store.getState()._markStepVisited(BRAVO),
    _markStepPassed: (store) => store.getState()._markStepPassed(BRAVO),
  };

  it('classifies EVERY action the store exposes', () => {
    const { store } = createBornHarness(STEP_SET_MUTATIONS['a step is born']);
    const state = store.getState();
    const actionKeys = Object.keys(state)
      .filter((key) => typeof state[key as keyof WorkflowStoreState] === 'function')
      .sort();

    expect(actionKeys).toEqual(Object.keys(SLICE_ADDRESSERS).sort());
  });

  it('classifies EVERY action the PUBLIC surface exports', () => {
    // The exported doors are the same actions under shorter names. An action
    // added to `useFlowActions()` that this enumeration has never driven fails
    // here.
    let capturedActions: UseFlowActionsResult | undefined;
    function ActionsProbe() {
      capturedActions = useFlowActions();
      return null;
    }
    render(
      <WorkflowProvider workflowConfig={buildFlow(true)}>
        <ActionsProbe />
      </WorkflowProvider>
    );

    expect(Object.keys(capturedActions ?? {}).sort()).toEqual(
      Object.keys(SLICE_ADDRESSERS)
        .filter((key) => key !== '_removeFieldValues' && key !== '_setRepeatableOrder')
        .map((key) => `${key[1].toLowerCase()}${key.slice(2)}`)
        .sort()
    );
  });

  it('every action classified as addressing no slice actually addresses none', () => {
    // The classification, PROVED. An action that starts writing `allData` while
    // sitting in the `null` bucket lands here — which is the check the two
    // existing tables' `reset: null` entries never had.
    expect(Object.keys(NON_ADDRESSERS).sort()).toEqual(
      Object.entries(SLICE_ADDRESSERS)
        .filter(([, driver]) => driver === null)
        .map(([name]) => name)
        .sort()
    );

    for (const [name, driver] of Object.entries(NON_ADDRESSERS)) {
      const { store, recompile } = createBornHarness(STEP_SET_MUTATIONS['a step is born']);
      recompile();
      const before = store.getState().allData;

      driver(store);

      expect({ action: name, allData: store.getState().allData }).toEqual({
        action: name,
        allData: before,
      });
      expect(store.getState().allData).toBe(before);
    }
  });

  const addressers = Object.entries(SLICE_ADDRESSERS).filter(([, driver]) => driver !== null) as
    Array<[string, (store: WorkflowStore) => void]>;

  const cases = Object.entries(STEP_SET_MUTATIONS).flatMap(([mutation, mutate]) =>
    addressers.map(([name, driver]) => [mutation, name, mutate, driver] as const)
  );

  it.each(cases)(
    'when %s, %s leaves every live step flat',
    (_mutation, _action, mutate, driver) => {
      const { store, recompile, getLiveSteps } = createBornHarness(mutate);
      recompile();

      driver(store);

      expectLiveSlicesFlat(store.getState(), getLiveSteps());
    }
  );
});

// =================================================================
// THE SAME CLASS, ONE LEVEL DOWN — A REPEATABLE THAT IS GONE
// =================================================================

/**
 * Step identity is not the only identity the read boundary used to take from the
 * config. It also asked the config which ids were repeatables, and a recompile
 * that RENAMES a repeatable inside a step that is still live leaves the same
 * orphan one level down: the step is visited, its `lines` config is gone, and
 * `lines[k0].label` passed through verbatim.
 *
 * Deriving the repeatable ids from the slice's own keys closes both at once —
 * which is the point of deriving rather than asking.
 */
describe('a repeatable dropped by a recompile leaks nothing either', () => {
  it('a live step structures rows whose repeatable the config no longer declares', () => {
    let liveSteps: ReadonlyArray<StepConfig> = ALL_STEPS;
    const store = createWorkflowStore({ getSteps: () => liveSteps, defaultStepIndex: 1 });

    store.getState()._setStepData({ lines: AUTHORED }, BRAVO);
    // The step survives the recompile; its repeatable does not.
    liveSteps = buildFlow(false).steps.concat({
      id: BRAVO,
      title: 'Bravo',
      formConfig: form.create(catalog, 'bravo-form').add({ id: 'who', type: 'text', props: {} }),
    });

    const payload = hostAllData(store, liveSteps);
    expect(payload[BRAVO]).toEqual({ lines: AUTHORED });
    expectNoInternalKeys(payload);
  });
});
