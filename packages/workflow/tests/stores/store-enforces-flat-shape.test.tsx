import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow, useFlowActions } from '../../src';
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
            : actions.setAllData({ ...workflowState.allData, items: { ...AUTHORED } })
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
