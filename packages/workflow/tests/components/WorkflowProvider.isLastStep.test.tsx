import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider, useWorkflowContext } from '../../src/components/WorkflowProvider';

// Mock text input component for testing
const TextInput: React.FC<any> = ({ value, onChange, ...props }) => (
  <input type="text" value={value || ''} onChange={(e) => onChange?.(e.target.value)} {...props} />
);

// Test component that displays workflow context values
const WorkflowContextDisplay: React.FC = () => {
  const { context } = useWorkflowContext();

  return (
    <div>
      <div data-testid="current-step-index">{context.currentStepIndex}</div>
      <div data-testid="is-first-step">{context.isFirstStep.toString()}</div>
      <div data-testid="is-last-step">{context.isLastStep.toString()}</div>
      <div data-testid="total-steps">{context.totalSteps}</div>
    </div>
  );
};

describe('WorkflowProvider isLastStep with Conditions', () => {
  let rilConfig: ril<any>;

  beforeEach(() => {
    rilConfig = ril.create().addComponent('text', {
      name: 'Text Input',
      renderer: TextInput as any,
      defaultProps: {},
    });
  });

  it('should correctly calculate isLastStep when last step is conditionally hidden', async () => {
    // Create a workflow where the last step is hidden by condition
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
            value: 'show-step3', // This will make step3 hidden by default
          },
        },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowContextDisplay />
      </WorkflowProvider>
    );

    // Wait for initial render
    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
      },
      { timeout: 1000 }
    );

    // Should be on step 1 (index 0)
    expect(screen.getByTestId('is-first-step')).toHaveTextContent('true');
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('false'); // Step 1 is not last because step 2 is visible
    expect(screen.getByTestId('total-steps')).toHaveTextContent('3');
  });

  it('should correctly calculate isLastStep when on step 2 with step 3 hidden', async () => {
    // Create a workflow where the last step is hidden by condition
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
            value: 'show-step3', // This will make step3 hidden by default
          },
        },
      })
      .build();

    const TestComponent = () => {
      const { goToStep, context } = useWorkflowContext();
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
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <TestComponent />
      </WorkflowProvider>
    );

    // Wait for navigation to complete
    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
      },
      { timeout: 3000 }
    );

    // Step 2 should be considered the last step since step 3 is hidden
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('true');
  });

  it('should correctly calculate isLastStep when all steps are visible', async () => {
    // Create a workflow where all steps are visible
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
        title: 'Step 3',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 3' } })
          .build(),
        // No conditions - always visible
      })
      .build();

    const TestOnLastStep = () => {
      const { goToStep, context } = useWorkflowContext();
      const [hasNavigated, setHasNavigated] = React.useState(false);

      React.useEffect(() => {
        if (!hasNavigated && context.currentStepIndex === 0) {
          setHasNavigated(true);
          goToStep(2);
        }
      }, [goToStep, context.currentStepIndex, hasNavigated]);

      return (
        <div>
          <div data-testid="current-step-index">{context.currentStepIndex}</div>
          <div data-testid="is-last-step">{context.isLastStep.toString()}</div>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <TestOnLastStep />
      </WorkflowProvider>
    );

    // Wait for navigation to complete
    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('2');
      },
      { timeout: 3000 }
    );

    // Should be on step 3 (index 2) and it should be the last step
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('true');
  });

  it('should correctly calculate isFirstStep when first step is conditionally hidden', async () => {
    // Create a workflow where the first step is hidden by condition
    const workflowConfig = flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step1',
        title: 'Step 1 (Hidden)',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 1' } })
          .build(),
        conditions: {
          visible: {
            field: 'field2',
            operator: 'equals',
            value: 'show-step1', // This will make step1 hidden by default
          },
        },
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
        title: 'Step 3',
        formConfig: form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 3' } })
          .build(),
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowContextDisplay />
      </WorkflowProvider>
    );

    // Wait for initial render and step navigation
    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
      },
      { timeout: 2000 }
    );

    // Should start on step 2 (index 1) since step 1 is hidden, and step 2 should be considered the first visible step
    expect(screen.getByTestId('is-first-step')).toHaveTextContent('true'); // Step 2 should be first visible step
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('false');
  });

  it('should handle basic workflow without conditions', async () => {
    // Simple workflow without any conditions
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
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowContextDisplay />
      </WorkflowProvider>
    );

    // Wait for initial render
    await waitFor(
      () => {
        expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
      },
      { timeout: 1000 }
    );

    // Should be on step 1 (index 0)
    expect(screen.getByTestId('is-first-step')).toHaveTextContent('true');
    expect(screen.getByTestId('is-last-step')).toHaveTextContent('false'); // Step 1 is not last
    expect(screen.getByTestId('total-steps')).toHaveTextContent('2');
  });
});
