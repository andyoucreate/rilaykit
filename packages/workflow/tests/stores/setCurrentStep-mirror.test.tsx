import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { UseFlowActionsResult, WorkflowStore } from '../../src';
import { FlowBody, WorkflowProvider, useFlow, useFlowActions, useFlowStoreApi } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * THE SIXTH DOOR — the SECOND invariant keyed off step identity.
 *
 * `_currentStepId` names the step `stepData` mirrors, and `mirrorIfCurrent()`
 * withholds the mirror for any write naming a DIFFERENT step. The provider's
 * `setCurrentStep` always named its step; the PUBLIC `useFlowActions()
 * .setCurrentStep` — the same action, exported from `@rilaykit/workflow` and
 * re-exported by the all-in-one — dropped the id. The docstring asserted the
 * false premise outright: "Every write through WorkflowProvider names its step."
 *
 * The consequence is permanent: nothing else re-names the step, so after one
 * public `setCurrentStep(1)` the mirror is stuck on the previous step and EVERY
 * later write to the real current step is misread as a cross-step write. The
 * user is served another step's values as `stepData` — verbatim the failure
 * `workflowStore.crossStepWrite.test.ts` exists to prevent — and `stepData` is
 * also the condition override layer, so field conditions resolve bare names
 * against the wrong step.
 *
 * WHY THE FLAT-SHAPE CLOSURE COULD NOT SEE IT: store-enforces-flat-shape
 * classifies `setCurrentStep: null` — "nothing to normalise". That is TRUE for
 * the shape invariant (setCurrentStep carries no slice) and it is exactly why
 * that enumeration is blind here. The store has TWO invariants keyed off step
 * identity; the second one gets its own enumeration below.
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

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'W')
    .addStep({
      id: 'one',
      title: 'One',
      formConfig: form.create(catalog, 'f1').add({ id: 'a', type: 'text', props: {} }),
    })
    .addStep({
      id: 'two',
      title: 'Two',
      formConfig: form.create(catalog, 'f2').add({ id: 'b', type: 'text', props: {} }),
    })
    .build();
}

type Door = 'goToStep' | 'setCurrentStep';

function Harness({ door }: { door: Door }) {
  const { currentStep, goToStep, workflowState } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <output data-testid="stepdata">{JSON.stringify(workflowState.stepData)}</output>
      <button
        type="button"
        data-testid="jump"
        onClick={() => (door === 'goToStep' ? void goToStep(1) : actions.setCurrentStep(1))}
      >
        jump
      </button>
      <button
        type="button"
        data-testid="seed"
        onClick={() => actions.setStepData({ a: 'ONE' }, 'one')}
      >
        seed
      </button>
      <button
        type="button"
        data-testid="write"
        onClick={() => actions.setStepData({ b: 'typed' }, 'two')}
      >
        write
      </button>
      <FlowBody />
    </div>
  );
}

const DOORS: Door[] = ['goToStep', 'setCurrentStep'];

describe('the stepData mirror follows navigation through EVERY public door', () => {
  it.each(DOORS)('a write to the current step after a %s jump reaches stepData', async (door) => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <Harness door={door} />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('one'));

    fireEvent.click(screen.getByTestId('jump'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('two'));

    fireEvent.click(screen.getByTestId('write'));

    await waitFor(() =>
      expect(screen.getByTestId('stepdata').textContent).toBe(JSON.stringify({ b: 'typed' }))
    );
  });

  it.each(DOORS)(
    'the current step is never served another step values after a %s jump',
    async (door) => {
      render(
        <WorkflowProvider workflowConfig={buildFlow()}>
          <Harness door={door} />
        </WorkflowProvider>
      );

      await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('one'));

      fireEvent.click(screen.getByTestId('seed'));
      await waitFor(() =>
        expect(screen.getByTestId('stepdata').textContent).toBe(JSON.stringify({ a: 'ONE' }))
      );

      fireEvent.click(screen.getByTestId('jump'));
      await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('two'));

      expect(screen.getByTestId('stepdata').textContent).not.toBe(JSON.stringify({ a: 'ONE' }));
    }
  );
});

// =================================================================
// THE SECOND INVARIANT, CLOSED BY ENUMERATION RATHER THAN BY PROSE
// =================================================================

/**
 * THE PARALLEL CLOSURE.
 *
 * `store-enforces-flat-shape.test.tsx` closes invariant #1 (a slice is always
 * flat) by classifying EVERY public action. This closes invariant #2: after any
 * public action that moves navigation, `_currentStepId` names
 * `steps[currentStepIndex].id` — the mirror's owner is the step the user is on.
 *
 * A new navigating action added to `useFlowActions()` without an entry here
 * fails the enumeration assertion; an entry that moves the index without
 * re-naming the mirror fails the ownership assertion. Prose cannot be the thing
 * that holds this — prose is what held it, and prose was wrong.
 */
describe('the store enforces its mirror-ownership invariant with NO exempt action', () => {
  const STEP_IDS = buildFlow().steps.map((step) => step.id);

  /**
   * Every action `useFlowActions()` exports, and how to make it MOVE navigation.
   * `null` classifies an action that cannot move `currentStepIndex` — data
   * writes, flags, progress marks — so it owes the mirror nothing.
   *
   * `reset` moves the index (back to its default) and IS enumerated: it renames
   * the mirror to the default step's id.
   *
   * `loadPersistedState` is enumerated for the reason this enumeration exists:
   * it is PUBLIC and its `Partial<WorkflowStoreState>` carries
   * `currentStepIndex`, so it moves navigation as surely as `setCurrentStep`
   * does. The provider's own restore path remembers to pass `_currentStepId`
   * alongside it; a host calling the exported action does not — the same
   * caller-must-remember shape as the bug above, one door over.
   */
  const NAVIGATION_DRIVERS: Record<
    keyof UseFlowActionsResult,
    ((actions: UseFlowActionsResult) => void) | null
  > = {
    setCurrentStep: (actions) => actions.setCurrentStep(1),
    setStepData: null,
    setAllData: null,
    setFieldValue: null,
    setSubmitting: null,
    setTransitioning: null,
    setInitializing: null,
    markStepVisited: null,
    markStepPassed: null,
    reset: (actions) => actions.reset(),
    loadPersistedState: (actions) => actions.loadPersistedState({ currentStepIndex: 1 }),
  };

  let capturedActions: UseFlowActionsResult;
  let capturedStore: WorkflowStore;

  function ActionsProbe() {
    capturedActions = useFlowActions();
    capturedStore = useFlowStoreApi();
    return null;
  }

  function renderProbe() {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <ActionsProbe />
      </WorkflowProvider>
    );
  }

  it('classifies EVERY action the public surface exports', () => {
    renderProbe();

    expect(Object.keys(capturedActions).sort()).toEqual(Object.keys(NAVIGATION_DRIVERS).sort());
  });

  const navigators = Object.entries(NAVIGATION_DRIVERS).filter(
    ([, driver]) => driver !== null
  ) as Array<[keyof UseFlowActionsResult, (actions: UseFlowActionsResult) => void]>;

  it.each(navigators)(
    'useFlowActions().%s leaves the mirror owned by the step the user is on',
    (_name, driver) => {
      renderProbe();

      act(() => driver(capturedActions));

      const state = capturedStore.getState();
      expect(state._currentStepId).toBe(STEP_IDS[state.currentStepIndex]);
    }
  );
});

// =================================================================
// THE SAME INVARIANT, ONE STEP FURTHER IN — THE MIRROR ITSELF
// =================================================================

/**
 * THE OWNER WAS ONLY HALF OF IT.
 *
 * Everything above enumerates who OWNS the mirror. Nothing enumerated what the
 * mirror is allowed to CONTAIN — and the reasoning that left that gap is the one
 * this whole campaign kills: `stepData` is published from `allData[owner]`, every
 * slice in `allData` is flat, therefore the mirror is flat. True of every action
 * that reads the slice. Silent about the one that is HANDED it.
 *
 * `_loadPersistedState` merges `{...state, ...persistedState}`, and
 * `persistedState` is a `Partial<WorkflowStoreState>` — `stepData` included. The
 * `allData` beside it was normalised on the way in; `stepData` was not. It landed
 * verbatim, the single value in that action the normaliser did not reach.
 *
 * And it was reachable without a host doing anything unusual, because
 * `WorkflowProvider` computed the mirror ITSELF and handed it over:
 * `mergeStepSlices(_defaultValues, persisted)[stepId]` — the merge one step
 * BEFORE the store normalises it. `_defaultValues` holds what the host AUTHORED
 * (it must; that is the fix one commit back), so restoring a session into a step
 * whose defaults declare rows the snapshot never recorded published
 * `{lines:[{...}]}` as the mirror while `allData` held `lines[k0].label`. The two
 * disagreed about the same step's values.
 *
 * WHY THAT IS A SCREEN AND NOT A PAYLOAD. `stepData` is the OVERRIDE layer in
 * `combineWorkflowDataForConditions` — it is spread last, over `allData`. A
 * mirror in a shape the store does not speak does not hand a host a surprise, it
 * answers the flow's own `visible` / `required` / `disabled` conditions with
 * `undefined` for every row value they name.
 *
 * THE FIX IS THE ONE ABOVE, APPLIED WHERE IT WAS ALREADY HALF-APPLIED. That
 * action ALREADY refuses to accept `_currentStepId` from a snapshot, and derives
 * it from the restored index instead, on the grounds that a snapshot has no
 * standing to assert where the user is. `stepData` is the view that owner names.
 * It has exactly as little standing, and is now derived exactly as hard — from
 * `allData[owner]`, AFTER `allData` has been normalised. The provider's own copy
 * of that computation is deleted rather than corrected: a caller that cannot
 * supply the value cannot supply a wrong one.
 */

const ROWS = [{ label: 'alpha' }, { label: 'beta' }];

function buildRepeatableFlow() {
  return flow
    .create(catalog, 'wf', 'W')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'f-items')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

/**
 * The mirror holds no repeatable's rows as an authored array under its bare id —
 * read from the step's CONFIGS rather than a list of field names, so a repeatable
 * this test never names still fails.
 */
function expectMirrorFlat(store: WorkflowStore): void {
  const state = store.getState();
  const step = buildRepeatableFlow().steps.find((s) => s.id === state._currentStepId);
  for (const repeatableId of Object.keys(step?.formConfig?.repeatableFields ?? {})) {
    expect({ repeatable: repeatableId, authoredArray: state.stepData[repeatableId] }).toEqual({
      repeatable: repeatableId,
      authoredArray: undefined,
    });
  }
}

describe('the mirror never speaks the authored shape, whichever action publishes it', () => {
  /**
   * Every action `useFlowActions()` exports, driven with AUTHORED rows.
   *
   * `null` classifies an action that cannot publish the mirror at all. That
   * classification is PROVED below — `stepData` keeps its identity — never
   * asserted, because "it does not touch the mirror" is precisely the sentence
   * that was true of `_loadPersistedState`'s `allData` and false of its
   * `stepData`.
   */
  const MIRROR_PUBLISHERS: Record<
    keyof UseFlowActionsResult,
    ((actions: UseFlowActionsResult) => void) | null
  > = {
    setCurrentStep: (actions) => actions.setCurrentStep(0),
    setStepData: (actions) => actions.setStepData({ lines: ROWS }, 'items'),
    // NOT a publisher — it writes the slice and leaves the mirror where it was.
    // That is a real asymmetry with `setStepData`, and it is recorded here as a
    // fact this enumeration CHECKS rather than as one it endorses.
    setAllData: null,
    setFieldValue: (actions) => actions.setFieldValue('lines', ROWS, 'items'),
    setSubmitting: null,
    setTransitioning: null,
    setInitializing: null,
    markStepVisited: null,
    markStepPassed: null,
    reset: (actions) => actions.reset(),
    loadPersistedState: (actions) =>
      actions.loadPersistedState({
        currentStepIndex: 0,
        allData: { items: { lines: ROWS } },
        // What `WorkflowProvider` used to hand this action, and what any host
        // reaching for the exported door hands it: the slice in the shape it
        // authored. The store must not care.
        stepData: { lines: ROWS },
      }),
  };

  let actions: UseFlowActionsResult;
  let store: WorkflowStore;

  function Probe() {
    actions = useFlowActions();
    store = useFlowStoreApi();
    return null;
  }

  function renderRepeatableProbe() {
    render(
      <WorkflowProvider
        workflowConfig={buildRepeatableFlow()}
        defaultValues={{ items: { lines: ROWS } }}
      >
        <Probe />
      </WorkflowProvider>
    );
  }

  it('classifies EVERY action the public surface exports', () => {
    renderRepeatableProbe();

    expect(Object.keys(actions).sort()).toEqual(Object.keys(MIRROR_PUBLISHERS).sort());
  });

  /** How to drive each `null`-classified action, to PROVE it publishes nothing. */
  const NON_PUBLISHERS: Record<string, (a: UseFlowActionsResult) => void> = {
    setAllData: (a) => a.setAllData({ items: { lines: ROWS } }),
    setSubmitting: (a) => a.setSubmitting(true),
    setTransitioning: (a) => a.setTransitioning(true),
    setInitializing: (a) => a.setInitializing(false),
    markStepVisited: (a) => a.markStepVisited('items'),
    markStepPassed: (a) => a.markStepPassed('items'),
  };

  it('every action classified as publishing no mirror actually publishes none', () => {
    expect(Object.keys(NON_PUBLISHERS).sort()).toEqual(
      Object.entries(MIRROR_PUBLISHERS)
        .filter(([, driver]) => driver === null)
        .map(([name]) => name)
        .sort()
    );

    for (const [name, driver] of Object.entries(NON_PUBLISHERS)) {
      renderRepeatableProbe();
      const before = store.getState().stepData;

      act(() => driver(actions));

      expect({ action: name, stepData: store.getState().stepData }).toEqual({
        action: name,
        stepData: before,
      });
      expect(store.getState().stepData).toBe(before);
    }
  });

  const publishers = Object.entries(MIRROR_PUBLISHERS).filter(
    ([, driver]) => driver !== null
  ) as Array<[keyof UseFlowActionsResult, (actions: UseFlowActionsResult) => void]>;

  it.each(publishers)('useFlowActions().%s publishes a FLAT mirror', (_name, driver) => {
    renderRepeatableProbe();

    act(() => driver(actions));

    expectMirrorFlat(store);
  });
});
