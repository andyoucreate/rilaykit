import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * Bug: a terminal advance whose `onAfterValidation` hides the remaining step(s)
 * was a dead click. On stepB the last raw step (stepC) is still visible, so
 * `isLastStep` is false and the button shows "Next". Clicking routes through
 * `handleSubmit` → `goNext()`; `goNext` runs `onAfterValidation` (which hides
 * stepC), marks stepB passed, then `findNextVisibleStep` returns null because
 * stepC is now hidden-live — so `goNext` returns false ("let the submission hook
 * handle this") but nothing handled it. Net: a no-op requiring a SECOND click to
 * complete. The terminal advance must complete in ONE click.
 */

let config: ReturnType<typeof buildRil>;

function buildRil() {
  return ril.create().component('input', {
    name: 'Text Input',
    renderer: MockInput,
  });
}

function StepIndicator() {
  const { currentStep, workflowState } = useFlow();
  return (
    <div>
      <div data-testid="current-step-id">{currentStep?.id ?? 'none'}</div>
      <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
    </div>
  );
}

describe('Workflow - terminal advance when onAfterValidation hides the last step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config = buildRil();
  });

  it('completes in a SINGLE click when onAfterValidation hides the remaining last step', async () => {
    const workflowConfig = flow
      .create(config, 'terminal-hide-flow', 'Terminal Hide Flow')
      .addStep({
        id: 'stepA',
        title: 'Step A',
        formConfig: form.create(config).add({
          id: 'alpha',
          type: 'input',
          props: { label: 'Alpha' },
        }),
      })
      .addStep({
        id: 'stepB',
        title: 'Step B',
        formConfig: form.create(config).add({
          id: 'beta',
          type: 'input',
          props: { label: 'Beta' },
        }),
        // Hides the remaining last step (stepC) at advance time.
        onAfterValidation: (_data, helper) => {
          helper.setStepData('stepB', { hideThird: 'yes' });
        },
      })
      .addStep({
        id: 'stepC',
        title: 'Step C',
        // Visible by default; hidden once stepB.hideThird === 'yes'.
        conditions: {
          visible: when('stepB.hideThird').notEquals('yes'),
        },
        formConfig: form.create(config).add({
          id: 'gamma',
          type: 'input',
          props: { label: 'Gamma' },
        }),
      })
      .build();

    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <StepIndicator />
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    // Start on stepA.
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepA');
    });

    // Normal advance stepA -> stepB (stepC still visible, so this is not last).
    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepB');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
    });

    // At click time stepC is still visible: this is NOT flagged as the last step.
    expect(onWorkflowComplete).not.toHaveBeenCalled();

    // The SINGLE terminal click: onAfterValidation hides stepC, leaving no next
    // visible step. This must complete the workflow, not dead-end.
    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const completionData = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(completionData.stepB).toEqual({ hideThird: 'yes' });
    expect(completionData).toHaveProperty('stepA');
  });

  it('does NOT complete prematurely: a normal 3-visible-step flow needs the last-step click', async () => {
    const workflowConfig = flow
      .create(config, 'normal-three-step-flow', 'Normal Three Step Flow')
      .addStep({
        id: 'stepA',
        title: 'Step A',
        formConfig: form.create(config).add({
          id: 'alpha',
          type: 'input',
          props: { label: 'Alpha' },
        }),
      })
      .addStep({
        id: 'stepB',
        title: 'Step B',
        formConfig: form.create(config).add({
          id: 'beta',
          type: 'input',
          props: { label: 'Beta' },
        }),
      })
      .addStep({
        id: 'stepC',
        title: 'Step C',
        formConfig: form.create(config).add({
          id: 'gamma',
          type: 'input',
          props: { label: 'Gamma' },
        }),
      })
      .build();

    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <StepIndicator />
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepA');
    });

    // stepA -> stepB: plain advance, no completion.
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepB');
    });
    expect(onWorkflowComplete).not.toHaveBeenCalled();

    // stepB -> stepC: plain advance, still no completion (stepC is visible).
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('stepC');
    });
    expect(onWorkflowComplete).not.toHaveBeenCalled();

    // Only the last-step click completes, exactly once.
    fireEvent.click(screen.getByTestId('next-button'));
    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });
  });
});
