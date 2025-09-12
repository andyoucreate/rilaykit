import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workflow, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('Workflow Component - DefaultStep', () => {
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
  const CurrentStepDisplay = () => {
    const { currentStep, workflowState } = useWorkflowContext();

    return (
      <div data-testid="workflow-info">
        <div data-testid="current-step-id">{currentStep?.id || 'none'}</div>
        <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
        <div data-testid="current-step-title">{currentStep?.title || 'none'}</div>
      </div>
    );
  };

  let config: ril<Record<string, any>>;
  let workflowBuilder: flow;

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

    // Create a workflow builder (not built yet)
    workflowBuilder = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'intro',
        title: 'Introduction',
        formConfig: form.create(config).add({
          id: 'name',
          type: 'input',
          props: { label: 'Your Name' },
        }),
      })
      .addStep({
        id: 'details',
        title: 'Details',
        formConfig: form.create(config).add({
          id: 'email',
          type: 'input',
          props: { label: 'Email' },
        }),
      })
      .addStep({
        id: 'summary',
        title: 'Summary',
        formConfig: form.create(config).add({
          id: 'notes',
          type: 'input',
          props: { label: 'Notes' },
        }),
      });
  });

  it('should start at step 0 by default with Workflow component', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <CurrentStepDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('intro');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('Introduction');
    });
  });

  it('should start at specified defaultStep with Workflow component', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder} defaultStep="details">
        <CurrentStepDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('details');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('Details');
    });
  });

  it('should work with built workflow config', async () => {
    const builtWorkflow = workflowBuilder.build();

    render(
      <Workflow workflowConfig={builtWorkflow} defaultStep="summary">
        <CurrentStepDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('summary');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('2');
      expect(screen.getByTestId('current-step-title')).toHaveTextContent('Summary');
    });
  });

  it('should combine defaultStep with defaultValues', async () => {
    const defaultValues = {
      details: {
        email: 'test@example.com',
      },
      summary: {
        notes: 'Pre-filled notes',
      },
    };

    render(
      <Workflow
        workflowConfig={workflowBuilder}
        defaultStep="details"
        defaultValues={defaultValues}
      >
        <CurrentStepDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('details');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
    });
  });

  it('should handle invalid defaultStep gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <Workflow workflowConfig={workflowBuilder} defaultStep="invalid-step">
        <CurrentStepDisplay />
      </Workflow>
    );

    await waitFor(() => {
      // Should fallback to first step
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('intro');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Default step with ID "invalid-step" not found. Starting at step 0.'
    );

    consoleSpy.mockRestore();
  });
});
