import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';

/**
 * Round-3 analytics/navigation contracts:
 * - BUG 5: onStepComplete fires only on FORWARD navigation, never backward.
 * - BUG 7: onWorkflowAbandon fires on unmount of a started-but-not-completed
 *   workflow, and NOT on unmount of a completed one.
 * - BUG 8: two synchronous skipStep() calls emit onStepSkip exactly once.
 */
describe('Workflow analytics/navigation (round 3)', () => {
  let config: ril<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  it('BUG 5: backward navigation does not fire onStepComplete for the retreated step', async () => {
    const onStepComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'back-flow', 'Back Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .addStep({
        id: 'C',
        title: 'C',
        formConfig: form.create(config).add({ id: 'c', type: 'input', props: { label: 'C' } }),
      })
      .configure({ analytics: { onStepComplete } })
      .build();

    const Probe = () => {
      const { currentStep, goNext, goPrevious } = useFlow();
      return (
        <div>
          <div data-testid="step">{currentStep?.id ?? 'none'}</div>
          <button type="button" data-testid="next" onClick={() => goNext()}>
            next
          </button>
          <button type="button" data-testid="prev" onClick={() => goPrevious()}>
            prev
          </button>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
        <FlowBody />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    // Forward A -> B fills and submits: onStepComplete('A') fires.
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'foo' } });
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    await waitFor(() => expect(onStepComplete).toHaveBeenCalledTimes(1));
    expect(onStepComplete.mock.calls[0][0]).toBe('A');

    // Backward B -> A must NOT fire onStepComplete for 'B'.
    fireEvent.click(screen.getByTestId('prev'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    // Still exactly one completion, and it was never for 'B'.
    expect(onStepComplete).toHaveBeenCalledTimes(1);
    expect(onStepComplete.mock.calls.some((call) => call[0] === 'B')).toBe(false);
  });

  it('BUG 7: onWorkflowAbandon fires on unmount of a started-but-incomplete workflow', async () => {
    const onWorkflowAbandon = vi.fn();

    const workflowConfig = flow
      .create(config, 'abandon-flow', 'Abandon Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ analytics: { onWorkflowAbandon } })
      .build();

    const Probe = () => {
      const { currentStep, goNext } = useFlow();
      return (
        <div>
          <div data-testid="step">{currentStep?.id ?? 'none'}</div>
          <button type="button" data-testid="next" onClick={() => goNext()}>
            next
          </button>
        </div>
      );
    };

    const { unmount } = render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
        <FlowBody />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    // Advance partway (A -> B) but do NOT complete the workflow.
    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'foo' } });
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    unmount();

    expect(onWorkflowAbandon).toHaveBeenCalledTimes(1);
    expect(onWorkflowAbandon.mock.calls[0][0]).toBe('abandon-flow');
    // current step id at abandonment
    expect(onWorkflowAbandon.mock.calls[0][1]).toBe('B');
    // data snapshot includes what the user entered
    expect(onWorkflowAbandon.mock.calls[0][2]).toMatchObject({ A: { a: 'foo' } });
  });

  it('BUG 7: a completed workflow does not fire onWorkflowAbandon on unmount', async () => {
    const onWorkflowAbandon = vi.fn();
    const onWorkflowComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'complete-no-abandon', 'Complete No Abandon')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .configure({ analytics: { onWorkflowAbandon } })
      .build();

    const Probe = () => {
      const { currentStep, submitWorkflow } = useFlow();
      return (
        <div>
          <div data-testid="step">{currentStep?.id ?? 'none'}</div>
          <button type="button" data-testid="submit" onClick={() => submitWorkflow()}>
            submit
          </button>
        </div>
      );
    };

    const { unmount } = render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <Probe />
        <FlowBody />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    fireEvent.click(screen.getByTestId('submit'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    unmount();

    expect(onWorkflowAbandon).not.toHaveBeenCalled();
  });

  it('BUG 8: two synchronous skipStep() calls emit onStepSkip exactly once', async () => {
    const onStepSkip = vi.fn();

    const workflowConfig = flow
      .create(config, 'double-skip-flow', 'Double Skip Flow')
      .addStep({
        id: 'A',
        title: 'A',
        allowSkip: true,
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ analytics: { onStepSkip } })
      .build();

    let skipRef: (() => Promise<boolean>) | null = null;
    const Probe = () => {
      const { currentStep, skipStep } = useFlow();
      skipRef = skipStep;
      return <div data-testid="step">{currentStep?.id ?? 'none'}</div>;
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    // Two synchronous skip calls within the same tick / same step.
    await act(async () => {
      skipRef?.();
      skipRef?.();
    });

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    expect(onStepSkip).toHaveBeenCalledTimes(1);
    expect(onStepSkip.mock.calls[0][0]).toBe('A');
  });
});
