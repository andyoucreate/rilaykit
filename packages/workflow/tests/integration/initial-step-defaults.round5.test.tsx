import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * The INITIAL step's defaults must survive the user's first edit.
 *
 * `createWorkflowStore` seeds `allData` from the defaults but leaves `stepData`
 * empty; only a NAVIGATION seeds `stepData` from `allData[stepId]`, and the
 * initial step never navigates into itself. A `_setFieldValue` that merges into
 * the (still empty) `stepData` and then overwrites `allData[stepId]` with the
 * result therefore destroys every default the user has not yet touched.
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
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Profile')
    .addStep({
      id: 'one',
      title: 'One',
      formConfig: form
        .create(catalog, 'one-form')
        .add({ id: 'name', type: 'text', props: {} })
        .add({ id: 'country', type: 'text', props: {} }),
    })
    .addStep({
      id: 'two',
      title: 'Two',
      formConfig: form.create(catalog, 'two-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .build();
}

const DEFAULT_VALUES = { one: { name: 'Ada', country: 'FR' } };

describe('initial step — untouched defaults survive the first edit', () => {
  it('keeps an untouched default of the initial step across a round trip', async () => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()} defaultValues={DEFAULT_VALUES}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Ada'));
    expect((screen.getByTestId('country') as HTMLInputElement).value).toBe('FR');

    // Touch ONLY `name`.
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Grace' } });

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('two'));
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('one'));

    expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Grace');
    expect((screen.getByTestId('country') as HTMLInputElement).value).toBe('FR');
  });

  it('submits the untouched default of the initial step', async () => {
    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider
        workflowConfig={buildFlow()}
        defaultValues={DEFAULT_VALUES}
        onWorkflowComplete={onWorkflowComplete}
      >
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Ada'));
    fireEvent.change(screen.getByTestId('name'), { target: { value: 'Grace' } });

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.one).toEqual({ name: 'Grace', country: 'FR' });
  });
});
