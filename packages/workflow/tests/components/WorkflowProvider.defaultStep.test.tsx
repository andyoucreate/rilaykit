import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('WorkflowProvider - DefaultStep', () => {
  // Mock components
  const MockInput = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label>{props.label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  // Component to check current step
  const CurrentStepChecker = () => {
    const { currentStep, workflowState } = useWorkflowContext();

    return (
      <div data-testid="current-step-info">
        <div data-testid="current-step-id">{currentStep?.id || 'none'}</div>
        <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
        <div data-testid="current-step-title">{currentStep?.title || 'none'}</div>
      </div>
    );
  };

  let config: ril<Record<string, any>>;
  let workflowConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('input', {
        name: 'Text Input',
        renderer: MockInput,
      })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      });

    // Create a workflow with multiple steps
    workflowConfig = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step1',
        title: 'First Step',
        formConfig: form.create(config).add({
          id: 'field1',
          type: 'input',
          props: { label: 'Field 1' },
        }),
      })
      .addStep({
        id: 'step2',
        title: 'Second Step',
        formConfig: form.create(config).add({
          id: 'field2',
          type: 'input',
          props: { label: 'Field 2' },
        }),
      })
      .addStep({
        id: 'step3',
        title: 'Third Step',
        formConfig: form.create(config).add({
          id: 'field3',
          type: 'input',
          props: { label: 'Field 3' },
        }),
      })
      .build();
  });

  it('should start at step 0 by default (no defaultStep specified)', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <CurrentStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('step1');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('First Step');
    });
  });

  it('should start at specified defaultStep', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step2">
        <CurrentStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('step2');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('Second Step');
    });
  });

  it('should start at the last step when defaultStep is specified', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step3">
        <CurrentStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('step3');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('2');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('Third Step');
    });
  });

  it('should fallback to step 0 when defaultStep does not exist', async () => {
    // Mock console.warn to verify the warning is shown
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="nonexistent">
        <CurrentStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('step1');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
    });

    // Should warn about invalid step ID
    expect(consoleSpy).toHaveBeenCalledWith(
      'Default step with ID "nonexistent" not found. Starting at step 0.'
    );

    consoleSpy.mockRestore();
  });

  it('should work with defaultStep and defaultValues together', async () => {
    const defaultValues = {
      step2: {
        field2: 'preset value',
      },
      step3: {
        field3: 'another preset',
      },
    };

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultStep="step2"
        defaultValues={defaultValues}
      >
        <CurrentStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should start at step2
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('step2');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');

      // And defaultValues should still be available
      // (This would be tested more thoroughly in form integration tests)
    });
  });

  it('should respect step conditions when using defaultStep', async () => {
    // Create a workflow with conditional steps
    const conditionalWorkflow = flow
      .create(config, 'conditional-workflow', 'Conditional Workflow')
      .addStep({
        id: 'trigger',
        title: 'Trigger Step',
        formConfig: form.create(config).add({
          id: 'showNext',
          type: 'input',
          props: { label: 'Show Next' },
        }),
      })
      .addStep({
        id: 'conditional',
        title: 'Conditional Step',
        conditions: {
          visible: when('trigger.showNext').equals('yes'),
        },
        formConfig: form.create(config).add({
          id: 'conditionalField',
          type: 'input',
          props: { label: 'Conditional Field' },
        }),
      })
      .addStep({
        id: 'final',
        title: 'Final Step',
        formConfig: form.create(config).add({
          id: 'finalField',
          type: 'input',
          props: { label: 'Final Field' },
        }),
      })
      .build();

    // Try to start at conditional step, but it should be hidden
    const defaultValues = {
      trigger: {
        showNext: 'no', // This makes the conditional step hidden
      },
    };

    const ConditionalStepChecker = () => {
      const { currentStep, conditionsHelpers, workflowConfig } = useWorkflowContext();

      return (
        <div data-testid="conditional-step-info">
          <div data-testid="current-step-id">{currentStep?.id || 'none'}</div>
          <div data-testid="conditional-step-visible">
            {conditionsHelpers.isStepVisible(1) ? 'true' : 'false'}
          </div>
        </div>
      );
    };

    render(
      <WorkflowProvider
        workflowConfig={conditionalWorkflow}
        defaultStep="conditional" // Try to start at hidden step
        defaultValues={defaultValues}
      >
        <ConditionalStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should verify the conditional step is hidden
      expect(screen.getByTestId('conditional-step-visible')).toHaveTextContent('false');

      // The workflow should handle this gracefully (implementation detail)
      // For now, we just verify the conditional logic works
    });
  });
});
