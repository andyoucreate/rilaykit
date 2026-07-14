import { type ril, ril as rilFactory, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';

/**
 * BUG 1: onStepChange stale visibility when onAfterValidation flips a later
 * step's visibility mid-navigation. Step visibility must be evaluated against
 * LIVE data (the freshly written store), not the render-time snapshot, so the
 * transition targets the correct next visible step directly (no phantom visit
 * to a step hidden by the just-written data).
 */
describe('Workflow - live step visibility during navigation', () => {
  const StepProbe = () => {
    const { currentStep, workflowState, goNext } = useFlow();
    return (
      <div>
        <div data-testid="current-step-id">{currentStep?.id ?? 'none'}</div>
        <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
        <button type="button" data-testid="go-next" onClick={() => goNext()}>
          Next
        </button>
      </div>
    );
  };

  let config: ril<Record<string, unknown>>;
  let workflowConfig: ReturnType<typeof flow.prototype.build>;

  beforeEach(() => {
    vi.clearAllMocks();

    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });

    workflowConfig = flow
      .create(config, 'live-visibility-flow', 'Live Visibility Flow')
      .addStep({
        id: 'A',
        title: 'Step A',
        formConfig: form.create(config).add({
          id: 'a',
          type: 'input',
          props: { label: 'A field' },
        }),
        // Flip the shared flag OFF right before transitioning. This hides B,
        // but the decision must be made against this freshly-written value.
        onAfterValidation: (_values, helper) => {
          helper.setStepFields('A', { sharedFlag: false });
        },
      })
      .addStep({
        id: 'B',
        title: 'Step B',
        conditions: {
          visible: when('sharedFlag').equals(true),
        },
        formConfig: form.create(config).add({
          id: 'b',
          type: 'input',
          props: { label: 'B field' },
        }),
      })
      .addStep({
        id: 'C',
        title: 'Step C',
        formConfig: form.create(config).add({
          id: 'c',
          type: 'input',
          props: { label: 'C field' },
        }),
      })
      .build();
  });

  it('navigates directly to the next LIVE-visible step, skipping one hidden by onAfterValidation', async () => {
    const transitions: Array<[number, number]> = [];

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{ A: { sharedFlag: true } }}
        onStepChange={(from, to) => transitions.push([from, to])}
      >
        <StepProbe />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('A');
    });

    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('C');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('2');
    });

    // The single navigation must target C (index 2) directly. Before the fix,
    // the stale snapshot sent us to B (index 1) first, so transitions read
    // [[0, 1]] and B was transiently the current step.
    expect(transitions).toEqual([[0, 2]]);
    expect(workflowConfig.steps[1].id).toBe('B');
  });
});
