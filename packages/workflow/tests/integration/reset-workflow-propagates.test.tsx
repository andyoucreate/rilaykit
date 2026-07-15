import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * `useFlow().resetWorkflow()` wipes the WORKFLOW store (allData, stepData,
 * repeatable orders) but nothing propagated that to the mounted FormProvider,
 * which only reset its own store on a `formConfig.id` change — and the id did
 * not change. The inputs kept showing the old values while the workflow store
 * believed it was empty: the two stores silently diverged, and a later
 * edit/submit mixed cleared workflow data with stale form values.
 */

function createRil() {
  return ril.create().component('input', { name: 'Text Input', renderer: MockInput });
}

function ResetButton() {
  const { resetWorkflow, currentStep } = useFlow();
  return (
    <>
      <div data-testid="step">{currentStep?.id ?? 'none'}</div>
      <button type="button" data-testid="reset" onClick={() => resetWorkflow()}>
        Reset
      </button>
    </>
  );
}

describe('resetWorkflow propagates to the mounted form store', () => {
  it('clears the visible inputs and restores the step defaults', async () => {
    const config = createRil();
    const onWorkflowComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'one',
        title: 'One',
        formConfig: form
          .create(config)
          .add({ id: 'name', type: 'input', props: { label: 'Name' } }),
      })
      .addStep({
        id: 'two',
        title: 'Two',
        formConfig: form
          .create(config)
          .add({ id: 'note', type: 'input', props: { label: 'Note' } }),
      })
      .build();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        // The flow's compiled defaults, exactly as `compileFlow` hands them back.
        defaultValues={{ one: { name: 'seed' } }}
        onWorkflowComplete={onWorkflowComplete}
      >
        <ResetButton />
        <FlowBody />
        <NextButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('input-name')).toHaveValue('seed'));

    // Fill step one.
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'typed' } });
    expect(screen.getByTestId('input-name')).toHaveValue('typed');

    // Reset the workflow.
    fireEvent.click(screen.getByTestId('reset'));

    // The reset must be VISIBLE: the input goes back to the step's compiled
    // default, exactly as the initial mount seeds it.
    await waitFor(() => expect(screen.getByTestId('input-name')).toHaveValue('seed'));

    // …and the two stores must agree: completing the flow now yields the
    // defaults, not the stale pre-reset values.
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('two'));
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));
    // `two` is empty because its field was never touched and declares no
    // default — the point here is `one`, which carries the restored default and
    // NOT the pre-reset 'typed'.
    expect(onWorkflowComplete.mock.calls[0][0]).toEqual({
      one: { name: 'seed' },
      two: {},
    });
  });

  it('returns to the first step and clears a later step filled before the reset', async () => {
    const config = createRil();

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'one',
        title: 'One',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'two',
        title: 'Two',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <ResetButton />
        <FlowBody />
        <NextButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('one'));
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'A!' } });
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('two'));
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'B!' } });

    fireEvent.click(screen.getByTestId('reset'));

    // Back on step one, with nothing carried over from before the reset.
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('one'));
    expect(screen.getByTestId('input-a')).toHaveValue('');

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('two'));
    expect(screen.getByTestId('input-b')).toHaveValue('');
  });
});
