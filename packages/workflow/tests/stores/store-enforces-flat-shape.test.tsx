import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UseFlowActionsResult, WorkflowStore } from '../../src';
import {
  FlowBody,
  WorkflowProvider,
  createWorkflowStore,
  useFlow,
  useFlowActions,
  useFlowStoreApi,
} from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * THE FOURTH DOOR — found by enumerating, not by a bug report.
 *
 * `useFlowActions()` is PUBLIC API (the all-in-one re-exports it) and it hands
 * a host the raw store actions: `setStepData(data, stepId)` and
 * `setAllData(data)`. Both are host-authored writes, and both bypassed the
 * provider's `writeStepSlice` — so a host prefilling a repeatable through them
 * reproduced the exact CRITICAL that `onAfterValidation` did: the authored
 * array lands beside the flat keys, `_removeFieldValues` cannot reach the row
 * the user deletes, and the deleted row is submitted.
 *
 * This is the lesson: guarding the doors we happen to know about is what failed
 * twice. The invariant belongs INSIDE the store — it is the store's invariant,
 * so the store enforces it, and no caller can be the one who forgot.
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

function LinesProbe() {
  const { items, remove } = useRepeatableField('lines');
  return (
    <div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-testid={`remove-${item.key}`}
          onClick={() => remove(item.key)}
        >
          {`remove ${item.key}`}
        </button>
      ))}
    </div>
  );
}

const AUTHORED = { lines: [{ label: 'alpha' }, { label: 'beta' }] };

function Harness({ write }: { write: 'setStepData' | 'setAllData' }) {
  const { currentStep, submitWorkflow, workflowState, goNext } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <output data-testid="alldata">{JSON.stringify(workflowState.allData)}</output>
      {/* A host prefilling a LATER step through the public raw actions — the
          same shape as the documented StepDataHelper prefill, one door over.
          Targeting a later step is what makes it observable: a mounted form is
          a separate store this one cannot write into, so only the step the user
          has yet to reach re-seeds from the slice. */}
      <button
        type="button"
        data-testid="host-write"
        onClick={() =>
          write === 'setStepData'
            ? actions.setStepData({ ...AUTHORED }, 'items')
            : actions.setAllData({
                ...workflowState.allData,
                items: { ...AUTHORED },
              })
        }
      >
        write
      </button>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      {currentStep?.id === 'items' ? <LinesProbe /> : null}
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'intro',
      title: 'Intro',
      formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
    })
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

async function writeThenAdvance() {
  fireEvent.click(screen.getByTestId('host-write'));
  fireEvent.click(screen.getByTestId('next'));
  await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));
}

describe('the store enforces its own flat-shape invariant', () => {
  it.each(['setStepData', 'setAllData'] as const)(
    'useFlowActions().%s flattens a host-authored repeatable array',
    async (write) => {
      render(
        <WorkflowProvider workflowConfig={buildFlow()}>
          <Harness write={write} />
        </WorkflowProvider>
      );

      await writeThenAdvance();

      // The rows are live in the form — reachable, therefore deletable.
      await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
      const slice = JSON.parse(screen.getByTestId('alldata').textContent ?? '{}').items;
      expect(Object.keys(slice)).not.toContain('lines');
      expect(slice['lines[k0].label']).toBe('alpha');
      expect(slice['lines[k1].label']).toBe('beta');
    }
  );

  it('never submits a row the user deleted after a raw host write', async () => {
    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider workflowConfig={buildFlow()} onWorkflowComplete={onWorkflowComplete}>
        <Harness write="setStepData" />
      </WorkflowProvider>
    );

    await writeThenAdvance();
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());

    fireEvent.click(screen.getByTestId('remove-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(JSON.stringify(onWorkflowComplete.mock.calls[0][0])).not.toContain('beta');
    expect(onWorkflowComplete.mock.calls[0][0].items.lines).toEqual([{ label: 'alpha' }]);
  });
});

// =================================================================
// THE INVARIANT, WITHOUT AN EXCEPTION
// =================================================================

/**
 * THE FIFTH DOOR — `setFieldValue`, the one action the r6 refactor left exempt.
 *
 * The exemption read "`_setFieldValue`/`_removeFieldValues` — flat by nature:
 * the form reports composite key ids". That is true of the FORM's calls and
 * false of the PUBLIC action's: `useFlowActions().setFieldValue` is documented
 * host API, and a host prefilling the natural way —
 * `setFieldValue('lines', [{label:'ghost'}], 'items')` — planted an authored
 * array the form could not render and the user could not delete, which was then
 * submitted to the backend.
 *
 * An invariant with an exception is not an invariant.
 */
describe('the store enforces its invariant with NO exempt action', () => {
  const STEPS = buildFlow().steps;

  it('_setFieldValue flattens a host-authored repeatable array', () => {
    const store = createWorkflowStore({ steps: STEPS, currentStepId: 'items' });

    store.getState()._setFieldValue('lines', [{ label: 'a' }], 'items');

    expect(Object.keys(store.getState().allData.items as Record<string, unknown>)).toEqual([
      'lines[k0].label',
    ]);
  });

  /**
   * THE CLOSURE. Not "these boundaries are guarded" — that is the reasoning that
   * let the class back in four times — but "EVERY action on the public surface
   * is classified, and each one that can carry a slice normalises it".
   *
   * A new action added to `useFlowActions()` without an entry here fails the
   * enumeration assertion; an entry that writes a slice without normalising
   * fails the shape assertion. There is no way to add a sixth exemption quietly.
   */
  const AUTHORED_ARRAY = [{ label: 'ghost' }];

  /**
   * Every action `useFlowActions()` exports, and how to hand it a host-authored
   * repeatable array. `null` classifies an action that carries no step slice at
   * all — navigation, flags, progress marks, reset — so there is nothing for it
   * to normalise.
   */
  const ACTION_DRIVERS: Record<
    keyof UseFlowActionsResult,
    ((actions: UseFlowActionsResult) => void) | null
  > = {
    setCurrentStep: null,
    setStepData: (actions) => actions.setStepData({ lines: AUTHORED_ARRAY }, 'items'),
    setAllData: (actions) => actions.setAllData({ items: { lines: AUTHORED_ARRAY } }),
    setFieldValue: (actions) => actions.setFieldValue('lines', AUTHORED_ARRAY, 'items'),
    setSubmitting: null,
    setTransitioning: null,
    setInitializing: null,
    markStepVisited: null,
    markStepPassed: null,
    reset: null,
    loadPersistedState: (actions) =>
      actions.loadPersistedState({
        allData: { items: { lines: AUTHORED_ARRAY } },
      }),
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

    expect(Object.keys(capturedActions).sort()).toEqual(Object.keys(ACTION_DRIVERS).sort());
  });

  const sliceWriters = Object.entries(ACTION_DRIVERS).filter(
    ([, driver]) => driver !== null
  ) as Array<[keyof UseFlowActionsResult, (actions: UseFlowActionsResult) => void]>;

  it.each(sliceWriters)(
    'useFlowActions().%s leaves the store in ONE shape when handed an authored array',
    (_name, driver) => {
      renderProbe();

      act(() => driver(capturedActions));

      const slice = capturedStore.getState().allData.items as Record<string, unknown>;
      expect(Object.keys(slice)).not.toContain('lines');
      expect(slice['lines[k0].label']).toBe('ghost');
    }
  );
});
