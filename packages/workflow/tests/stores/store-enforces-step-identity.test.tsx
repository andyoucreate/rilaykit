import type { StepConfig } from '@rilaykit/core';
import { getOwn, ril } from '@rilaykit/core';
import { form, parseCompositeKey } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowStore, WorkflowStoreState } from '../../src';
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
     * The seed `_reset` restores. Normalised ONCE, at store creation, against
     * the steps live at that moment — so a default for a step that is live then
     * is flat, and a `reset()` after a recompile plants those flat keys straight
     * back into `allData`. Its read boundary is therefore `allData`'s.
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
