import { getOwn, ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { WorkflowStore, WorkflowStoreState } from '../../src';
import { createWorkflowStore } from '../../src';
import { flow } from '../../src/builders/flow';
import {
  FlowBody,
  WorkflowProvider,
  useFlow,
  useFlowActions,
  useFlowStoreApi,
} from '../../src/react';
import type { UseFlowActionsResult } from '../../src/stores/workflowStore';

/**
 * THE SWEEP FOR IN-FLIGHT WORK — the one the step-identity campaign never ran.
 *
 * The workflow altitude has been swept for STATE (`stepIdentityMembers()` in
 * `store-enforces-step-identity`), never for IN-FLIGHT WORK. Every leak of the
 * P2 stabilization campaign's final round was in-flight work crossing a step
 * swap, and HITL resolve (P3) is in-flight work at THIS altitude — where
 * `instanceId`/`formInstanceKey` do not reach. This suite is that sweep.
 *
 * THE INVARIANT: in-flight work started for a step lands on that step, or is
 * abandoned — never on another step.
 *
 * WHAT THE SWEEP FOUND, stated plainly so nobody re-runs it by folklore:
 *
 *   1. The store itself exposes NO asynchronous or deferred path. Every action
 *      settles synchronously inside its own `set`; there is no timer, no
 *      promise, no subscription the store starts and later resolves (the store
 *      source contains no `async`, `await`, `Promise`, or timer at all). So
 *      "in-flight work at the workflow altitude" has exactly one shape: a
 *      CALLER's promise whose settle calls one of the actions enumerated below.
 *      The actions ARE the settle doors, exhaustively.
 *
 *   2. Every settle door that addresses a step's slice addresses it by a step
 *      id taken AS A PARAMETER — the id the work captured when it STARTED —
 *      never by "the current step" resolved at settle time. No slice write
 *      consults `currentStepIndex` or `_currentStepId`; the only members that
 *      derive from the index (`_currentStepId`, `stepData`) are written
 *      exclusively at the store's write boundary (`withDerived`), from the
 *      LIVE index. A settle that crosses a navigation therefore cannot drag
 *      the mirror, because the settle has no way to name the current step and
 *      the mirror has no way to be named by an action.
 *
 * WHICH IS TO SAY: the sweep found NOTHING TO FIX. For the doors that exist
 * today the invariant is UNREPRESENTABLE, not proved-today — a settle cannot
 * land on "wherever the user is now" because no slice-writing action has an
 * expression for that place. What IS proved-today, and is this file's reason
 * to exist, is the ENUMERATION: the settle-door table below is asserted equal
 * to the store's runtime-derived action list, so the action HITL resolve adds
 * (Task 8/13) fails this suite until it is classified and driven through the
 * same differential. That is the tripwire this task was gated on.
 *
 * THE DIFFERENTIAL — the frame that found four of the last five bugs, restated
 * for work instead of state: WHEN the work settles must not be observable.
 * A store where the work settled BEFORE the navigation and a store where it
 * settled AFTER must be indistinguishable, member by member, with the member
 * list read off the real stores at runtime.
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

const ALPHA = 'step-alpha';
const XRAY = 'step-xray';

/** The rows the in-flight work resolves — authored, as a HITL batch would be. */
const RESOLVED_ROWS = [{ label: 'alpha' }, { label: 'beta' }];
/** The same rows in the store's own shape, which is what must land. */
const RESOLVED_FLAT = { 'lines[k0].label': 'alpha', 'lines[k1].label': 'beta' };

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: ALPHA,
      title: 'Alpha',
      formConfig: form
        .create(catalog, 'alpha-form')
        .add({ id: 'who', type: 'text', props: {} })
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .addStep({
      id: XRAY,
      title: 'Xray',
      formConfig: form.create(catalog, 'xray-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .build();
}

/** A promise the test settles by hand, so "in flight" is a state, not a race. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// =================================================================
// THE REPRO — THE SHAPE HITL RESOLVE WILL HAVE, THROUGH THE REAL PROVIDER
// =================================================================

describe('the workflow store abandons or lands in-flight work on the step it was started for', () => {
  it('a resolution begun on step alpha does not land on step xray', async () => {
    // Drive a real provider. Start async work naming step alpha (the shape HITL
    // resolve will have: a batch write while the user sits on a step), navigate
    // to xray BEFORE it settles, then let it settle.
    let store: WorkflowStore | undefined;
    let actions: UseFlowActionsResult | undefined;
    function Harness() {
      const { goNext, currentStep } = useFlow();
      store = useFlowStoreApi();
      actions = useFlowActions();
      return (
        <div>
          <span data-testid="current-step">{currentStep?.id ?? 'none'}</span>
          <button type="button" data-testid="go-next" onClick={() => void goNext()}>
            next
          </button>
          <FlowBody />
        </div>
      );
    }
    render(
      <WorkflowProvider workflowConfig={buildFlow()} defaultValues={{ [XRAY]: { note: 'kept' } }}>
        <Harness />
      </WorkflowProvider>
    );
    expect(store).toBeDefined();
    expect(actions).toBeDefined();
    if (!store || !actions) return; // unreachable after the assertions; satisfies TS narrowing
    const capturedActions = actions;

    // The work begins ON alpha, capturing its step at start — through the
    // PUBLIC action, the door a host resolving a batch actually uses.
    const work = deferred();
    const resolution = work.promise.then(() =>
      capturedActions.setStepData({ lines: RESOLVED_ROWS }, ALPHA)
    );

    // The user leaves before it answers.
    fireEvent.click(screen.getByTestId('go-next'));
    await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe(XRAY));

    // GUARD ON THE REPRO: the work must actually still be in flight here, or
    // everything below passes vacuously as a settled-then-navigated test.
    const alphaBeforeSettle = getOwn(store.getState().allData, ALPHA) as
      | Record<string, unknown>
      | undefined;
    expect(getOwn(alphaBeforeSettle ?? {}, 'lines[k0].label')).toBe(undefined);
    const xrayBeforeSettle = store.getState().allData[XRAY];
    expect(xrayBeforeSettle).toEqual({ note: 'kept' });

    // The settle, after the crossing.
    await act(async () => {
      work.resolve();
      await resolution;
    });

    const state = store.getState();
    // The work landed on the step it was started for — normalised at settle
    // time against the step it NAMES, not the step the user is on.
    expect(state.allData[ALPHA]).toEqual(RESOLVED_FLAT);
    // Xray's slice is untouched — by IDENTITY, not just by value.
    expect(state.allData[XRAY]).toBe(xrayBeforeSettle);
    // And the mirror still belongs to the step the user is actually on: the
    // cross-step settle could not drag it, because no settle can name it.
    expect(state._currentStepId).toBe(XRAY);
    expect(state.stepData).toBe(state.allData[XRAY]);
  });
});

// =================================================================
// THE ENUMERATION — EVERY SETTLE DOOR THE STORE EXPOSES
// =================================================================

const STEPS = buildFlow().steps;

/**
 * A store as the provider builds one, mid-flow: alpha holds rows (so deletes
 * and reorders have something to address), xray holds a default (so "the other
 * step's slice" has an identity to preserve), the user starts on alpha.
 */
function createHarnessStore(): WorkflowStore {
  return createWorkflowStore({
    getSteps: () => STEPS,
    defaultValues: { [ALPHA]: { who: 'ada', lines: RESOLVED_ROWS }, [XRAY]: { note: 'kept' } },
    defaultStepIndex: 0,
  });
}

/**
 * EVERY action the store exposes — every door a caller's promise can settle
 * through — and how in-flight work started ON ALPHA settles through it.
 *
 * `null` classifies a door whose settle is not step-scoped work at all:
 *   - `_setCurrentStep` is the navigation itself — the other half of every
 *     differential below, not a settle door;
 *   - `_reset` and `_loadPersistedState` REPLACE the whole store and MOVE the
 *     user (the default index / the snapshot's index), so "the step it started
 *     for" does not apply — the whole store is the landing zone. That reading
 *     is PROVED below, not asserted in a comment: each is driven after a
 *     navigation and the index it lands on is pinned exactly.
 *
 * A new action added to the store without an entry here — HITL resolve is the
 * one this table is waiting for — fails the enumeration assertion rather than
 * shipping unswept.
 */
const SETTLE_DOORS: Record<string, ((store: WorkflowStore) => void) | null> = {
  _setCurrentStep: null,
  _reconcileStepSet: (store) => store.getState()._reconcileStepSet(),
  _setStepData: (store) => store.getState()._setStepData({ lines: [{ label: 'late' }] }, ALPHA),
  _setAllData: (store) =>
    store.getState()._setAllData({
      ...store.getState().allData,
      [ALPHA]: { lines: [{ label: 'late' }] },
    }),
  _setFieldValue: (store) => store.getState()._setFieldValue('who', 'late', ALPHA),
  _removeFieldValues: (store) => store.getState()._removeFieldValues(['lines[k0].label'], ALPHA),
  _setRepeatableOrder: (store) =>
    store.getState()._setRepeatableOrder(ALPHA, { lines: ['k1', 'k0'] }),
  _setSubmitting: (store) => store.getState()._setSubmitting(true),
  _setTransitioning: (store) => store.getState()._setTransitioning(true),
  _setInitializing: (store) => store.getState()._setInitializing(false),
  _markStepVisited: (store) => store.getState()._markStepVisited(ALPHA),
  _markStepPassed: (store) => store.getState()._markStepPassed(ALPHA),
  _markStepSkipped: (store) => store.getState()._markStepSkipped(ALPHA),
  _reset: null,
  _loadPersistedState: null,
};

/** Data members of a real store's state — actions are not state. */
function dataMembers(state: WorkflowStoreState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function')
  );
}

describe('EVERY settle door the store exposes is classified and swept', () => {
  it('enumerates EVERY action a settle can come through, derived at runtime', () => {
    const store = createHarnessStore();
    const state = store.getState();
    const actionKeys = Object.keys(state)
      .filter((key) => typeof state[key as keyof WorkflowStoreState] === 'function')
      .sort();

    // THE TRIPWIRE. The action HITL resolve adds (Task 8/13) lands here with
    // no entry in SETTLE_DOORS, and fails until it is classified and driven
    // through the settled-before/settled-after differential below.
    expect(actionKeys).toEqual(Object.keys(SETTLE_DOORS).sort());
  });

  const settleDoors = Object.entries(SETTLE_DOORS).filter(([, drive]) => drive !== null) as Array<
    [string, (store: WorkflowStore) => void]
  >;

  /**
   * THE DIFFERENTIAL. The same work, started on alpha, settling through the
   * same door — once BEFORE the user navigates to xray, once AFTER. If the two
   * stores differ in ANY member, the settle observed the navigation: work
   * keyed to the step it was started for behaved differently because of where
   * the user happened to be standing when it landed. The member list is read
   * off the real stores at runtime, so a member added tomorrow is compared
   * without anyone remembering to.
   */
  it.each(settleDoors)('%s settles the same before and after the navigation', (_name, drive) => {
    const settledBefore = createHarnessStore();
    drive(settledBefore);
    settledBefore.getState()._setCurrentStep(1);

    const settledAfter = createHarnessStore();
    settledAfter.getState()._setCurrentStep(1);
    drive(settledAfter);

    const before = dataMembers(settledBefore.getState());
    const after = dataMembers(settledAfter.getState());

    // Same members — a member present in one arm only is itself a difference.
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const member of Object.keys(after).sort()) {
      expect({ member, value: after[member] }).toEqual({ member, value: before[member] });
    }

    // And in BOTH arms the mirror belongs to the step the user is on — the
    // settle landed on alpha (or nowhere), never on the mirror.
    for (const state of [settledBefore.getState(), settledAfter.getState()]) {
      expect(state._currentStepId).toBe(XRAY);
      expect(state.stepData).toBe(state.allData[XRAY]);
    }
  });

  /**
   * THE `null` CLASSIFICATIONS, PROVED — the check `_reset` never had in the
   * two tables that mis-filed it. These two settles ARE navigations: each one
   * moves the user, so asserting they "land on the step they started for"
   * would be asserting the wrong contract. What is pinned instead is exactly
   * where they land, so a change to that contract is a decision, not a drift.
   */
  it('_reset settles as a navigation: the user lands on the default step', () => {
    const store = createHarnessStore();
    store.getState()._setCurrentStep(1);

    store.getState()._reset();

    const state = store.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state._currentStepId).toBe(ALPHA);
    expect(state.stepData).toBe(state.allData[ALPHA]);
    expect(state.allData[ALPHA]).toEqual({ who: 'ada', ...RESOLVED_FLAT });
  });

  it('_loadPersistedState settles as a navigation: the user lands where the snapshot says', () => {
    const store = createHarnessStore();
    store.getState()._setCurrentStep(1);

    store.getState()._loadPersistedState({
      currentStepIndex: 0,
      allData: { [ALPHA]: { who: 'restored' } },
    });

    const state = store.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state._currentStepId).toBe(ALPHA);
    expect(state.stepData).toBe(state.allData[ALPHA]);
    expect(state.allData).toEqual({ [ALPHA]: { who: 'restored' } });
  });
});
