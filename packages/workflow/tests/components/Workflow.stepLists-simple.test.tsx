import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workflow, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('Workflow Component - Three Step Lists (visitedSteps, visibleVisitedSteps, passedSteps)', () => {
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

  // Component to display all three step lists
  const StepListsDisplay = () => {
    const { context } = useWorkflowContext();

    return (
      <div data-testid="step-lists-info">
        <div data-testid="current-step-index">{context.currentStepIndex}</div>

        {/* visitedSteps */}
        <div data-testid="visited-steps-count">{context.visitedSteps.size}</div>
        <div data-testid="visited-steps-list">
          {Array.from(context.visitedSteps).sort().join(',')}
        </div>

        {/* visibleVisitedSteps */}
        <div data-testid="visible-visited-steps-count">{context.visibleVisitedSteps.size}</div>
        <div data-testid="visible-visited-steps-list">
          {Array.from(context.visibleVisitedSteps).sort().join(',')}
        </div>

        {/* passedSteps */}
        <div data-testid="passed-steps-count">{context.passedSteps.size}</div>
        <div data-testid="passed-steps-list">
          {Array.from(context.passedSteps).sort().join(',')}
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

    // Simple workflow without conditions
    workflowBuilder = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step-1',
        title: 'Step 1',
        formConfig: form.create(config).add({
          id: 'field1',
          type: 'input',
          props: { label: 'Field 1' },
        }),
      })
      .addStep({
        id: 'step-2',
        title: 'Step 2',
        formConfig: form.create(config).add({
          id: 'field2',
          type: 'input',
          props: { label: 'Field 2' },
        }),
      })
      .addStep({
        id: 'step-3',
        title: 'Step 3',
        formConfig: form.create(config).add({
          id: 'field3',
          type: 'input',
          props: { label: 'Field 3' },
        }),
      });
  });

  it('should expose visitedSteps in workflow context', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <StepListsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      // Should have visitedSteps as a Set
      const visitedStepsCount = screen.getByTestId('visited-steps-count');
      expect(visitedStepsCount).toBeDefined();
      expect(visitedStepsCount.textContent).toBe('0');
    });
  });

  it('should expose visibleVisitedSteps in workflow context', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <StepListsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      // Should have visibleVisitedSteps as a Set
      const visibleVisitedStepsCount = screen.getByTestId('visible-visited-steps-count');
      expect(visibleVisitedStepsCount).toBeDefined();
      expect(visibleVisitedStepsCount.textContent).toBe('0');
    });
  });

  it('should expose passedSteps in workflow context', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <StepListsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      // Should have passedSteps as a Set
      const passedStepsCount = screen.getByTestId('passed-steps-count');
      expect(passedStepsCount).toBeDefined();
      expect(passedStepsCount.textContent).toBe('0');
    });
  });

  it('should start with empty lists on first step', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder}>
        <StepListsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('visible-visited-steps-count')).toHaveTextContent('0');
      expect(screen.getByTestId('passed-steps-count')).toHaveTextContent('0');
    });
  });

  it('should have passedSteps populated when starting on later step', async () => {
    render(
      <Workflow workflowConfig={workflowBuilder} defaultStep="step-3">
        <StepListsDisplay />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('2');
      // visitedSteps includes previous steps when using defaultStep
      expect(screen.getByTestId('visited-steps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('visited-steps-list')).toHaveTextContent('step-1,step-2');
      // visibleVisitedSteps same as visitedSteps (no invisible steps)
      expect(screen.getByTestId('visible-visited-steps-count')).toHaveTextContent('2');
      // passedSteps includes steps before current
      expect(screen.getByTestId('passed-steps-count')).toHaveTextContent('2');
      expect(screen.getByTestId('passed-steps-list')).toHaveTextContent('step-1,step-2');
    });
  });

  it('should show all three lists are Sets with correct API', async () => {
    const TestComponent = () => {
      const { context } = useWorkflowContext();

      // Verify they are Sets
      const areAllSets =
        context.visitedSteps instanceof Set &&
        context.visibleVisitedSteps instanceof Set &&
        context.passedSteps instanceof Set;

      return (
        <div>
          <div data-testid="are-all-sets">{areAllSets.toString()}</div>
        </div>
      );
    };

    render(
      <Workflow workflowConfig={workflowBuilder}>
        <TestComponent />
      </Workflow>
    );

    await waitFor(() => {
      expect(screen.getByTestId('are-all-sets')).toHaveTextContent('true');
    });
  });
});
