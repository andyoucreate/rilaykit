import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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

/**
 * The default FormList chrome renders no remove/move control, so drive the
 * repeatable through its public hook instead. `remove` takes an item KEY.
 */
function LinesProbe() {
  const { items, remove, move } = useRepeatableField('lines');
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
      <button type="button" data-testid="move-0-1" onClick={() => move(0, 1)}>
        move 0 to 1
      </button>
    </div>
  );
}

function Harness() {
  const { goNext, goPrevious, currentStep, submitWorkflow } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="back" onClick={() => goPrevious()}>
        back
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <LinesProbe />
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

/**
 * A row the user DELETED must be gone everywhere: out of the submitted payload,
 * out of the step's captured data, and gone on re-entry. The workflow mirrors
 * the form's values through `onFieldChange`; a mirror that only ever merges is
 * a mirror that resurrects deleted rows.
 */
describe('step re-entry — repeatable removals', () => {
  async function fillTwoRowsAndDeleteSecond() {
    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('lines[k0].label'), { target: { value: 'keep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('lines[k1].label'), { target: { value: 'drop-me' } });

    fireEvent.click(screen.getByTestId('remove-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());
  }

  it('never submits a repeatable row the user deleted', async () => {
    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider workflowConfig={buildFlow()} onWorkflowComplete={onWorkflowComplete}>
        <Harness />
      </WorkflowProvider>
    );

    await fillTwoRowsAndDeleteSecond();

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    const stepData = payload.items as Record<string, unknown>;
    expect(stepData['lines[k0].label']).toBe('keep');
    expect(Object.keys(stepData)).not.toContain('lines[k1].label');
  });

  it('does not resurrect a deleted repeatable row on step re-entry', async () => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <Harness />
      </WorkflowProvider>
    );

    await fillTwoRowsAndDeleteSecond();

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    expect(screen.queryByTestId('lines[k1].label')).toBeNull();
    expect((screen.getByTestId('lines[k0].label') as HTMLInputElement).value).toBe('keep');
  });

  it('preserves a user reorder across step re-entry', async () => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('lines[k0].label'), { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.change(screen.getByTestId('lines[k1].label'), { target: { value: 'second' } });

    fireEvent.click(screen.getByTestId('move-0-1'));
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0');
  });
});
