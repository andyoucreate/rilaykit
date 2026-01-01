import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('WorkflowProvider - VisitedSteps with DefaultStep', () => {
  // Mock components
  const MockInput = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  // Component to check visited steps
  const VisitedStepsChecker = () => {
    const { workflowState, workflowConfig } = useWorkflowContext();

    return (
      <div data-testid="visited-steps-info">
        <div data-testid="visited-steps-count">{workflowState.visitedSteps.size}</div>
        <div data-testid="visited-steps-list">
          {Array.from(workflowState.visitedSteps).sort().join(',')}
        </div>
        {workflowConfig.steps.map((step, _index) => (
          <div key={step.id} data-testid={`step-${step.id}-visited`}>
            {workflowState.visitedSteps.has(step.id) ? 'visited' : 'not-visited'}
          </div>
        ))}
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
      .addStep({
        id: 'step4',
        title: 'Fourth Step',
        formConfig: form.create(config).add({
          id: 'field4',
          type: 'input',
          props: { label: 'Field 4' },
        }),
      })
      .build();
  });

  it('should have no visited steps when starting at step 0 (default)', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('');

      // All steps should be not-visited initially
      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('not-visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('not-visited');
      expect(screen.getByTestId('step-step3-visited')).toHaveTextContent('not-visited');
      expect(screen.getByTestId('step-step4-visited')).toHaveTextContent('not-visited');
    });
  });

  it('should mark previous steps as visited when starting at step2', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step3">
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should have 2 visited steps (step1 and step2)
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('step1,step2');

      // Check individual step visited status
      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step3-visited')).toHaveTextContent('not-visited'); // Current step
      expect(screen.getByTestId('step-step4-visited')).toHaveTextContent('not-visited');
    });
  });

  it('should mark all previous steps as visited when starting at the last step', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step4">
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should have 3 visited steps (step1, step2, step3)
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('3');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('step1,step2,step3');

      // Check individual step visited status
      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step3-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step4-visited')).toHaveTextContent('not-visited'); // Current step
    });
  });

  it('should handle defaultStep with defaultValues correctly', async () => {
    const defaultValues = {
      step1: { field1: 'value1' },
      step2: { field2: 'value2' },
      step3: { field3: 'value3' },
    };

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultStep="step3"
        defaultValues={defaultValues}
      >
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should mark step1 and step2 as visited
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('step1,step2');

      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step3-visited')).toHaveTextContent('not-visited');
    });
  });

  it('should handle invalid defaultStep without affecting visitedSteps', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="invalid-step">
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Should fallback to step 0 with no visited steps
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('');

      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('not-visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('not-visited');
    });

    consoleSpy.mockRestore();
  });

  it('should not mark future steps as visited when starting at middle step', async () => {
    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step2">
        <VisitedStepsChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Only step1 should be visited, not step3 or step4
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('1');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('step1');

      expect(screen.getByTestId('step-step1-visited')).toHaveTextContent('visited');
      expect(screen.getByTestId('step-step2-visited')).toHaveTextContent('not-visited'); // Current
      expect(screen.getByTestId('step-step3-visited')).toHaveTextContent('not-visited'); // Future
      expect(screen.getByTestId('step-step4-visited')).toHaveTextContent('not-visited'); // Future
    });
  });
});
