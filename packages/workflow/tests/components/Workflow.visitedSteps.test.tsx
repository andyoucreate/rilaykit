import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workflow, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('Workflow Component - VisitedSteps with DefaultStep', () => {
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
  const VisitedStepsDisplay = () => {
    const { workflowState, currentStep } = useWorkflowContext();

    return (
      <div data-testid="workflow-visited-info">
        <div data-testid="current-step">{currentStep?.id}</div>
        <div data-testid="visited-count">{workflowState.visitedSteps.size}</div>
        <div data-testid="visited-list">
          {Array.from(workflowState.visitedSteps).sort().join(',')}
        </div>
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

    // Create a workflow builder
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
        id: 'preferences',
        title: 'Preferences',
        formConfig: form.create(config).add({
          id: 'theme',
          type: 'input',
          props: { label: 'Theme' },
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

  it('should have no visited steps when starting at first step', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <VisitedStepsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('intro');
      expect(screen.getByTestId('visited-count')).toHaveTextContent('0');
      expect(screen.getByTestId('visited-list')).toHaveTextContent('');
    });
  });

  it('should mark previous steps as visited when using defaultStep', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder} defaultStep="details">
        <VisitedStepsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('details');
      expect(screen.getByTestId('visited-count')).toHaveTextContent('1');
      expect(screen.getByTestId('visited-list')).toHaveTextContent('intro');
    });
  });

  it('should mark multiple previous steps as visited when starting at later step', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder} defaultStep="summary">
        <VisitedStepsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('summary');
      expect(screen.getByTestId('visited-count')).toHaveTextContent('3');
      expect(screen.getByTestId('visited-list')).toHaveTextContent('details,intro,preferences');
    });
  });

  it('should work with built workflow config', async () => {
    const builtWorkflow = workflowBuilder.build();

    render(
      <Workflow workflowConfig={builtWorkflow} defaultStep="preferences">
        <VisitedStepsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('preferences');
      expect(screen.getByTestId('visited-count')).toHaveTextContent('2');
      expect(screen.getByTestId('visited-list')).toHaveTextContent('details,intro');
    });
  });

  it('should combine defaultStep, defaultValues, and visitedSteps correctly', async () => {
    const defaultValues = {
      intro: { name: 'John Doe' },
      details: { email: 'john@example.com' },
      preferences: { theme: 'dark' },
    };

    render(
      <Workflow
        workflowConfig={workflowBuilder}
        defaultStep="preferences"
        defaultValues={defaultValues}
      >
        <VisitedStepsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('preferences');
      expect(screen.getByTestId('visited-count')).toHaveTextContent('2');
      expect(screen.getByTestId('visited-list')).toHaveTextContent('details,intro');
    });
  });
});
