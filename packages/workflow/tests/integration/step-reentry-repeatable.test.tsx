import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * Navigating away from a step and back must restore exactly what the user
 * typed — including repeatable rows.
 *
 * A repeatable's values live in the form store under COMPOSITE keys
 * (`items[k0].name`), and that is the shape the workflow captures. Re-entry
 * rebuilds the step's form from the captured data, so anything that shape gets
 * lost on the way back is silently destroyed user input.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: ({ id, field }) => (
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
      />
    ),
  });
}

const catalog = makeCatalog();

function Harness() {
  const { goNext, goPrevious, currentStep } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="back" onClick={() => goPrevious()}>
        back
      </button>
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .add({ id: 'customer', type: 'text', props: {} })
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} }).min(1)),
    })
    .addStep({
      id: 'review',
      title: 'Review',
      formConfig: form.create(catalog, 'review-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .build();
}

describe('step re-entry — repeatable values', () => {
  it('restores repeatable rows and their values after navigating away and back', async () => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <Harness />
      </WorkflowProvider>
    );

    // `min: 1` gives one row; add a second and fill both, plus a plain field.
    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('customer'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByTestId('lines[k0].label'), { target: { value: 'Widget' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('lines[k1].label'), { target: { value: 'Gadget' } });

    // Away...
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));

    // ...and back.
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    // The plain field survives (it always did) — and so must BOTH rows.
    expect((screen.getByTestId('customer') as HTMLInputElement).value).toBe('Ada');
    expect((screen.getByTestId('lines[k0].label') as HTMLInputElement).value).toBe('Widget');
    expect((screen.getByTestId('lines[k1].label') as HTMLInputElement).value).toBe('Gadget');
  });
});
