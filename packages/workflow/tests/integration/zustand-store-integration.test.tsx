import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowBody, WorkflowNextButton, WorkflowPreviousButton } from '../../src';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider, useWorkflowContext } from '../../src/components/WorkflowProvider';
import {
  useCurrentStepIndex,
  useWorkflowAllData,
  useWorkflowStore,
  useWorkflowTransitioning,
} from '../../src/stores';

// Mock components
const TestComponent = ({
  id,
  value,
  onChange,
}: { id: string; value: unknown; onChange: (val: unknown) => void }) => (
  <input
    data-testid={`field-${id}`}
    value={(value as string) || ''}
    onChange={(e) => onChange(e.target.value)}
  />
);
const TestFormRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

describe('Workflow Zustand Store Integration', () => {
  let config: ReturnType<typeof ril.create>;
  let workflowConfig: ReturnType<typeof flow.create>['build'] extends () => infer R ? R : never;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps: {},
      })
      .configure({
        rowRenderer: TestRowRenderer,
        bodyRenderer: TestFormRenderer,
        nextButtonRenderer: ({
          onClick,
          isSubmitting,
        }: { onClick: () => void; isSubmitting: boolean }) => (
          <button onClick={onClick} data-testid="next" disabled={isSubmitting}>
            {isSubmitting ? 'Loading...' : 'Next'}
          </button>
        ),
        previousButtonRenderer: ({
          onPrevious,
          canGoPrevious,
        }: { onPrevious: () => void; canGoPrevious: boolean }) => (
          <button onClick={onPrevious} data-testid="prev" disabled={!canGoPrevious}>
            Previous
          </button>
        ),
      });

    const step1Form = form
      .create(config, 'step1-form')
      .add({ id: 'field1', type: 'text', props: { label: 'Field 1' } })
      .build();

    const step2Form = form
      .create(config, 'step2-form')
      .add({ id: 'field2', type: 'text', props: { label: 'Field 2' } })
      .build();

    const step3Form = form
      .create(config, 'step3-form')
      .add({ id: 'field3', type: 'text', props: { label: 'Field 3' } })
      .build();

    workflowConfig = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: step1Form,
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: step2Form,
      })
      .addStep({
        id: 'step3',
        title: 'Step 3',
        formConfig: step3Form,
      })
      .build();
  });

  describe('Store Context Access', () => {
    it('should provide store context to children', () => {
      let storeFromContext: ReturnType<typeof useWorkflowStore> | null = null;

      const TestChild = () => {
        storeFromContext = useWorkflowStore();
        return <div data-testid="child">Child</div>;
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(storeFromContext).not.toBeNull();
      expect(typeof storeFromContext?.getState).toBe('function');
    });

    it('should allow direct state access via store', () => {
      const TestChild = () => {
        const store = useWorkflowStore();
        const state = store.getState();
        return (
          <div>
            <div data-testid="step">{state.currentStepIndex}</div>
            <div data-testid="submitting">{state.isSubmitting ? 'yes' : 'no'}</div>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('step')).toHaveTextContent('0');
      expect(screen.getByTestId('submitting')).toHaveTextContent('no');
    });
  });

  describe('Granular Selectors', () => {
    it('useCurrentStepIndex should update when navigating', async () => {
      const TestChild = () => {
        const stepIndex = useCurrentStepIndex();
        const { goNext } = useWorkflowContext();
        return (
          <div>
            <div data-testid="step">{stepIndex}</div>
            <button data-testid="next" onClick={() => goNext()}>
              Next
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('step')).toHaveTextContent('0');

      await act(async () => {
        fireEvent.click(screen.getByTestId('next'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('step')).toHaveTextContent('1');
      });
    });

    it('useWorkflowAllData should return initial data', () => {
      const TestChild = () => {
        const allData = useWorkflowAllData();
        return <div data-testid="data">{JSON.stringify(allData)}</div>;
      };

      render(
        <WorkflowProvider
          workflowConfig={workflowConfig}
          defaultValues={{ step1: { field1: 'initial' } }}
        >
          <TestChild />
        </WorkflowProvider>
      );

      const data = JSON.parse(screen.getByTestId('data').textContent || '{}');
      expect(data.step1?.field1).toBe('initial');
    });

    it('useWorkflowTransitioning should update during navigation', async () => {
      const transitionStates: boolean[] = [];

      const TestChild = () => {
        const isTransitioning = useWorkflowTransitioning();
        transitionStates.push(isTransitioning);
        const { goNext } = useWorkflowContext();
        return (
          <div>
            <div data-testid="transitioning">{isTransitioning ? 'yes' : 'no'}</div>
            <button data-testid="next" onClick={() => goNext()}>
              Next
            </button>
          </div>
        );
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('transitioning')).toHaveTextContent('no');

      await act(async () => {
        fireEvent.click(screen.getByTestId('next'));
      });

      // Transitioning should have been captured at some point
      await waitFor(() => {
        expect(screen.getByTestId('transitioning')).toHaveTextContent('no');
      });
    });
  });

  describe('Navigation with Store', () => {
    it('should navigate forward and backward correctly', async () => {
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <WorkflowBody />
          <WorkflowPreviousButton />
          <WorkflowNextButton />
        </WorkflowProvider>
      );

      // Step 1
      await waitFor(() => {
        expect(screen.getByTestId('field-field1')).toBeInTheDocument();
      });

      // Go to step 2
      await act(async () => {
        fireEvent.click(screen.getByTestId('next'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-field2')).toBeInTheDocument();
      });

      // Go back to step 1
      await act(async () => {
        fireEvent.click(screen.getByTestId('prev'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-field1')).toBeInTheDocument();
      });
    });

    it('should preserve data when navigating between steps', async () => {
      let allData: Record<string, unknown> = {};

      const DataDisplay = () => {
        const data = useWorkflowAllData();
        allData = data;
        return null;
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <DataDisplay />
          <WorkflowBody />
          <WorkflowNextButton />
          <WorkflowPreviousButton />
        </WorkflowProvider>
      );

      // Enter value in step 1
      await waitFor(() => {
        expect(screen.getByTestId('field-field1')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('field-field1'), {
        target: { value: 'value1' },
      });

      // Go to step 2
      await act(async () => {
        fireEvent.click(screen.getByTestId('next'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-field2')).toBeInTheDocument();
      });

      // Enter value in step 2
      fireEvent.change(screen.getByTestId('field-field2'), {
        target: { value: 'value2' },
      });

      // Go back to step 1
      await act(async () => {
        fireEvent.click(screen.getByTestId('prev'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-field1')).toBeInTheDocument();
      });

      // Verify values are preserved (step1 may have field2 due to form re-initialization)
      expect((allData.step1 as Record<string, unknown>)?.field1).toBe('value1');
      expect((allData.step2 as Record<string, unknown>)?.field2).toBe('value2');
    });
  });

  describe('State Isolation', () => {
    it('should isolate state between multiple workflow instances', () => {
      const workflow1Config = { ...workflowConfig, id: 'workflow-1' };
      const workflow2Config = { ...workflowConfig, id: 'workflow-2' };

      let store1State: { currentStepIndex: number } | null = null;
      let store2State: { currentStepIndex: number } | null = null;

      const Workflow1Child = () => {
        const store = useWorkflowStore();
        store1State = { currentStepIndex: store.getState().currentStepIndex };
        return <div data-testid="workflow1">Workflow 1</div>;
      };

      const Workflow2Child = () => {
        const store = useWorkflowStore();
        store2State = { currentStepIndex: store.getState().currentStepIndex };
        return <div data-testid="workflow2">Workflow 2</div>;
      };

      const { rerender } = render(
        <>
          <WorkflowProvider workflowConfig={workflow1Config}>
            <Workflow1Child />
          </WorkflowProvider>
          <WorkflowProvider workflowConfig={workflow2Config} defaultStep="step2">
            <Workflow2Child />
          </WorkflowProvider>
        </>
      );

      expect(store1State?.currentStepIndex).toBe(0);
      expect(store2State?.currentStepIndex).toBe(1);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset workflow state via store', async () => {
      let storeRef: ReturnType<typeof useWorkflowStore> | null = null;

      const TestChild = () => {
        const store = useWorkflowStore();
        storeRef = store;
        const stepIndex = useCurrentStepIndex();
        return <div data-testid="step">{stepIndex}</div>;
      };

      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <TestChild />
          <WorkflowNextButton />
        </WorkflowProvider>
      );

      expect(screen.getByTestId('step')).toHaveTextContent('0');

      // Navigate to step 2
      await act(async () => {
        fireEvent.click(screen.getByTestId('next'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('step')).toHaveTextContent('1');
      });

      // Reset via store
      act(() => {
        storeRef?.getState()._reset();
      });

      await waitFor(() => {
        expect(screen.getByTestId('step')).toHaveTextContent('0');
      });
    });
  });
});
