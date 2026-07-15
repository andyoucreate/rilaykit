import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * The three `WorkflowAnalytics` data callbacks are ONE contract.
 *
 * `onWorkflowComplete` hands the host the AUTHORED shape. `onStepComplete` and
 * `onWorkflowAbandon` read the store's slice raw, so once the store normalised
 * to flat composite keys they started handing bracket keys to a host that had
 * been written against nested arrays — two shapes on one interface. They are
 * host boundaries like any other: they structure on the way out.
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

function Harness() {
  const { currentStep, submitWorkflow } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="submit" data-testid="form-next">
        form next
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <FlowBody />
    </div>
  );
}

function buildFlow(analytics: Record<string, unknown>) {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .addStep({
      id: 'review',
      title: 'Review',
      formConfig: form.create(catalog, 'review-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .configure({ analytics: analytics as never })
    .build();
}

const DEFAULT_VALUES = { items: { lines: [{ label: 'alpha' }] } };
const AUTHORED_SLICE = { lines: [{ label: 'alpha' }] };

describe('WorkflowAnalytics — every data callback speaks the AUTHORED shape', () => {
  it('hands onStepComplete the structured slice, matching onWorkflowComplete', async () => {
    const onStepComplete = vi.fn();
    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider
        workflowConfig={buildFlow({ onStepComplete, onWorkflowComplete })}
        defaultValues={DEFAULT_VALUES}
      >
        <Harness />
      </WorkflowProvider>
    );

    // The REAL chrome: the form's own submit drives the advance.
    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    fireEvent.click(screen.getByTestId('form-next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));

    expect(onStepComplete).toHaveBeenCalledTimes(1);
    expect(onStepComplete.mock.calls[0][0]).toBe('items');
    expect(onStepComplete.mock.calls[0][2]).toEqual(AUTHORED_SLICE);

    // The same interface, the same shape.
    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));
    expect(onWorkflowComplete.mock.calls[0][2]).toEqual({ items: AUTHORED_SLICE, review: {} });
  });

  it('hands onWorkflowAbandon the structured workflow data', async () => {
    const onWorkflowAbandon = vi.fn();

    const view = render(
      <WorkflowProvider
        workflowConfig={buildFlow({ onWorkflowAbandon })}
        defaultValues={DEFAULT_VALUES}
      >
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    view.unmount();

    expect(onWorkflowAbandon).toHaveBeenCalledTimes(1);
    expect(onWorkflowAbandon.mock.calls[0][2]).toEqual({ items: AUTHORED_SLICE });
  });
});
