import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';
import { NextButton, SkipButton } from '../_helpers/nav-buttons';

/**
 * A flow whose FINAL step is optional (an "extras" step) renders an ENABLED
 * Skip button. Clicking it must finish the flow: `skipStep` finds no next
 * visible step, and nothing else was handling that — the button was inert, and
 * the workflow could never complete through it.
 *
 * This is the skip-side of the terminal-advance contract already fixed for
 * Next (`handleSubmit`'s `!advanced && !canGoNext()` fall-through).
 */

function createRil() {
  return ril.create().component('input', { name: 'Text Input', renderer: MockInput });
}

function StepLabel() {
  const { currentStep } = useFlow();
  return <div data-testid="step">{currentStep?.id ?? 'none'}</div>;
}

describe('skipping the LAST visible step completes the workflow', () => {
  it('fires onWorkflowComplete exactly once with the collected payload', async () => {
    const config = createRil();
    const onWorkflowComplete = vi.fn();
    const onStepComplete = vi.fn();
    const onStepSkip = vi.fn();

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'details',
        title: 'Details',
        formConfig: form
          .create(config)
          .add({ id: 'name', type: 'input', props: { label: 'Name' }, defaultValue: 'Ada' }),
      })
      .addStep({
        id: 'extras',
        title: 'Extras',
        allowSkip: true,
        formConfig: form.create(config).add({ id: 'note', type: 'input', props: { label: 'Note' } }),
      })
      .build();

    render(
      <WorkflowProvider
        workflowConfig={{ ...workflowConfig, analytics: { onStepComplete, onStepSkip } }}
        onWorkflowComplete={onWorkflowComplete}
      >
        <StepLabel />
        <FlowBody />
        <NextButton />
        <SkipButton />
      </WorkflowProvider>
    );

    // Advance to the final (skippable) step.
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('details'));
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('extras'));

    // The Skip button is offered AND enabled on the last step.
    expect(screen.getByTestId('skip')).toBeEnabled();

    // ONE click must finish the flow.
    fireEvent.click(screen.getByTestId('skip'));

    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));
    expect(onWorkflowComplete).toHaveBeenCalledWith({ details: { name: 'Ada' }, extras: {} });

    // A skip stays a skip for analytics: the skipped step is reported skipped,
    // never completed.
    expect(onStepSkip).toHaveBeenCalledTimes(1);
    expect(onStepSkip).toHaveBeenCalledWith('extras', 'user_skip', expect.anything());
    expect(onStepComplete).not.toHaveBeenCalledWith(
      'extras',
      expect.any(Number),
      expect.anything(),
      expect.anything()
    );
  });

  it('does not complete when a MIDDLE step is skipped — it just navigates', async () => {
    const config = createRil();
    const onWorkflowComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'A',
        title: 'A',
        allowSkip: true,
        formConfig: form.create(config).add({ id: 'fa', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'fb', type: 'input', props: { label: 'B' } }),
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <StepLabel />
        <SkipButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));
    fireEvent.click(screen.getByTestId('skip'));

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));
    expect(onWorkflowComplete).not.toHaveBeenCalled();
  });

  it('does not complete when the last step is NOT skippable', async () => {
    const config = createRil();
    const onWorkflowComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'only',
        title: 'Only',
        formConfig: form.create(config).add({ id: 'f', type: 'input', props: { label: 'F' } }),
      })
      .build();

    function ManualSkip() {
      const { skipStep } = useFlow();
      return (
        <button type="button" data-testid="manual-skip" onClick={() => void skipStep()}>
          Skip
        </button>
      );
    }

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <StepLabel />
        <ManualSkip />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('only'));

    // A host calling skipStep() on a step that forbids skipping must be a no-op,
    // NOT a back door that completes the workflow.
    fireEvent.click(screen.getByTestId('manual-skip'));

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('only'));
    expect(onWorkflowComplete).not.toHaveBeenCalled();
  });
});
