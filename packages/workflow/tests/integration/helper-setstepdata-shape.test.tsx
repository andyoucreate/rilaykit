import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * The THIRD door of the shape mismatch: `StepDataHelper`.
 *
 * The store speaks ONE shape — flat composite keys — so that a removed
 * repeatable row has keys to delete. Every host-authored write must therefore
 * flatten on the way in. `handleSubmit` does; the `StepDataHelper` mutators
 * handed to `onAfterValidation` were wired to the RAW store action, so a
 * server-driven prefill of a later step's repeatable landed the authored array
 * next to the flat keys — and the row the user then deleted was submitted.
 *
 * The helper writes commonly target ANOTHER step, so the normaliser must
 * resolve the TARGET step's repeatable config, not the current step's.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
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
      <output data-testid="lines-order">{items.map((item) => item.key).join(',')}</output>
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

function Harness() {
  const { currentStep, submitWorkflow, workflowState } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <output data-testid="alldata">{JSON.stringify(workflowState.allData)}</output>
      <button type="submit" data-testid="form-next">
        form next
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      {currentStep?.id === 'items' ? <LinesProbe /> : null}
      <FlowBody />
    </div>
  );
}

const ITEMS_STEP = {
  id: 'items',
  title: 'Items',
  formConfig: form
    .create(catalog, 'items-form')
    .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
};

function buildFlow(onAfterValidation: (data: any, helper: any) => void) {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'intro',
      title: 'Intro',
      formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
      onAfterValidation,
    })
    .addStep(ITEMS_STEP)
    .build();
}

async function advanceToItems() {
  fireEvent.click(screen.getByTestId('form-next'));
  await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));
}

function readSlice(stepId: string): Record<string, unknown> {
  const all = JSON.parse(screen.getByTestId('alldata').textContent ?? '{}');
  return (all[stepId] ?? {}) as Record<string, unknown>;
}

describe('StepDataHelper prefill of a repeatable — the store keeps ONE shape', () => {
  it.each([
    [
      'setStepData',
      (_data: unknown, helper: any) => {
        helper.setStepData('items', { lines: [{ label: 'alpha' }, { label: 'beta' }] });
      },
    ],
    [
      'setStepFields',
      (_data: unknown, helper: any) => {
        helper.setStepFields('items', { lines: [{ label: 'alpha' }, { label: 'beta' }] });
      },
    ],
    [
      'setNextStepFields',
      (_data: unknown, helper: any) => {
        helper.setNextStepFields({ lines: [{ label: 'alpha' }, { label: 'beta' }] });
      },
    ],
  ])('%s lands the target step slice FLAT, never the authored array', async (_name, after) => {
    render(
      <WorkflowProvider workflowConfig={buildFlow(after)}>
        <Harness />
      </WorkflowProvider>
    );

    await advanceToItems();
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());

    const slice = readSlice('items');
    expect(Object.keys(slice)).not.toContain('lines');
    expect(slice['lines[k0].label']).toBe('alpha');
    expect(slice['lines[k1].label']).toBe('beta');
  });

  it('never submits a prefilled row the user deleted', async () => {
    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider
        workflowConfig={buildFlow((_data, helper) => {
          helper.setStepData('items', { lines: [{ label: 'alpha' }, { label: 'beta' }] });
        })}
        onWorkflowComplete={onWorkflowComplete}
      >
        <Harness />
      </WorkflowProvider>
    );

    await advanceToItems();
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());

    fireEvent.click(screen.getByTestId('remove-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, any>;
    expect(JSON.stringify(payload)).not.toContain('beta');
    expect(payload.items.lines).toEqual([{ label: 'alpha' }]);
  });
});
