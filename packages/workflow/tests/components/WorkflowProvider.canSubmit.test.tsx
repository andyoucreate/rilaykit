import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider, useFlow } from '../../src/components/WorkflowProvider';
import { MockInput } from '../_helpers/mock-components';

/**
 * Bug 1 — canSubmit uses the raw last index, not the visible-last step.
 *
 * When the final raw step is conditionally hidden, `context.isLastStep`
 * (visible-last) is true on the last visible step, but `canSubmit` compared
 * `currentStepIndex` against `steps.length - 1` (the hidden raw last), so a
 * custom submit button gated on `useFlow().canSubmit` could never submit.
 */
describe('WorkflowProvider canSubmit with hidden last step (Bug 1)', () => {
  let rilConfig: ril<any>;

  beforeEach(() => {
    rilConfig = ril.create().component('text', {
      name: 'Text Input',
      renderer: MockInput,
      defaultProps: {},
    });
  });

  it('canSubmit is true on the last visible step when the raw last step is hidden', async () => {
    const workflowConfig = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 1' } })
          .build(),
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 2' } })
          .build(),
      })
      .addStep({
        id: 'step3',
        title: 'Step 3 (Hidden)',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 3' } })
          .build(),
        conditions: {
          visible: {
            field: 'field1',
            operator: 'equals',
            value: 'show-step3',
          },
        },
      })
      .build();

    const TestComponent = () => {
      const { goToStep, context, canSubmit } = useFlow();
      const [hasNavigated, setHasNavigated] = React.useState(false);

      React.useEffect(() => {
        if (!hasNavigated && context.currentStepIndex === 0) {
          setHasNavigated(true);
          goToStep(1);
        }
      }, [goToStep, context.currentStepIndex, hasNavigated]);

      return (
        <div>
          <div data-testid="current-step-index">{context.currentStepIndex}</div>
          <div data-testid="is-last-step">{context.isLastStep.toString()}</div>
          <div data-testid="can-submit">{canSubmit.toString()}</div>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <TestComponent />
      </WorkflowProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
      },
      { timeout: 3000 }
    );

    // Step 2 is the last VISIBLE step (step 3 hidden), so it must be submittable.
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('true');
    expect(screen.getByTestId('can-submit')).toHaveTextContent('true');
  });
});
