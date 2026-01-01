import { act, render, renderHook, screen } from '@testing-library/react';
import type React from 'react';
import { memo, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type CreateWorkflowStoreOptions,
  WorkflowStoreContext,
  createWorkflowStore,
  useCurrentStepIndex,
  useWorkflowAllData,
  useWorkflowStepData,
  useWorkflowSubmitting,
  useWorkflowTransitioning,
} from '../../src/stores/workflowStore';

// Helper to create a wrapper with store context
function createWrapper(options: CreateWorkflowStoreOptions = {}) {
  const store = createWorkflowStore(options);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <WorkflowStoreContext.Provider value={store}>{children}</WorkflowStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('Workflow Selector Hooks - Re-render Isolation', () => {
  it('useCurrentStepIndex should not re-render when other state changes', () => {
    const { Wrapper, store } = createWrapper();
    const renderCount = { current: 0 };

    const TestComponent = () => {
      renderCount.current += 1;
      const stepIndex = useCurrentStepIndex();
      return <div data-testid="step">{stepIndex}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    expect(renderCount.current).toBe(1);
    expect(screen.getByTestId('step')).toHaveTextContent('0');

    // Changing unrelated state should NOT cause re-render
    act(() => {
      store.getState()._setSubmitting(true);
    });
    expect(renderCount.current).toBe(1);

    act(() => {
      store.getState()._setTransitioning(true);
    });
    expect(renderCount.current).toBe(1);

    act(() => {
      store.getState()._setStepData({ field: 'value' }, 'step1');
    });
    expect(renderCount.current).toBe(1);

    // Changing step index SHOULD cause re-render
    act(() => {
      store.getState()._setCurrentStep(1);
    });
    expect(renderCount.current).toBe(2);
    expect(screen.getByTestId('step')).toHaveTextContent('1');
  });

  it('useWorkflowSubmitting should not re-render when other state changes', () => {
    const { Wrapper, store } = createWrapper();
    const renderCount = { current: 0 };

    const TestComponent = () => {
      renderCount.current += 1;
      const isSubmitting = useWorkflowSubmitting();
      return <div data-testid="submitting">{isSubmitting ? 'yes' : 'no'}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    expect(renderCount.current).toBe(1);

    // Changing unrelated state should NOT cause re-render
    act(() => {
      store.getState()._setCurrentStep(5);
    });
    expect(renderCount.current).toBe(1);

    act(() => {
      store.getState()._setStepData({ field: 'value' }, 'step1');
    });
    expect(renderCount.current).toBe(1);

    // Changing submitting SHOULD cause re-render
    act(() => {
      store.getState()._setSubmitting(true);
    });
    expect(renderCount.current).toBe(2);
    expect(screen.getByTestId('submitting')).toHaveTextContent('yes');
  });

  it('useWorkflowTransitioning should not re-render when other state changes', () => {
    const { Wrapper, store } = createWrapper();
    const renderCount = { current: 0 };

    const TestComponent = () => {
      renderCount.current += 1;
      const isTransitioning = useWorkflowTransitioning();
      return <div data-testid="transitioning">{isTransitioning ? 'yes' : 'no'}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    expect(renderCount.current).toBe(1);

    // Changing unrelated state should NOT cause re-render
    act(() => {
      store.getState()._setSubmitting(true);
    });
    expect(renderCount.current).toBe(1);

    // Changing transitioning SHOULD cause re-render
    act(() => {
      store.getState()._setTransitioning(true);
    });
    expect(renderCount.current).toBe(2);
  });

  it('useWorkflowStepData should not re-render when unrelated data changes', () => {
    const { Wrapper, store } = createWrapper();
    const renderCount = { current: 0 };

    const TestComponent = () => {
      renderCount.current += 1;
      const stepData = useWorkflowStepData();
      return <div data-testid="data">{JSON.stringify(stepData)}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    expect(renderCount.current).toBe(1);

    // Changing unrelated state should NOT cause re-render
    act(() => {
      store.getState()._setCurrentStep(5);
    });
    expect(renderCount.current).toBe(1);

    // Changing step data SHOULD cause re-render
    act(() => {
      store.getState()._setStepData({ field: 'value' }, 'step1');
    });
    expect(renderCount.current).toBe(2);
    expect(screen.getByTestId('data')).toHaveTextContent('{"field":"value"}');
  });

  it('multiple components with different selectors should re-render independently', () => {
    const { Wrapper, store } = createWrapper();
    const stepRenderCount = { current: 0 };
    const submittingRenderCount = { current: 0 };
    const dataRenderCount = { current: 0 };

    const StepComponent = memo(() => {
      stepRenderCount.current += 1;
      const stepIndex = useCurrentStepIndex();
      return <div data-testid="step">{stepIndex}</div>;
    });

    const SubmittingComponent = memo(() => {
      submittingRenderCount.current += 1;
      const isSubmitting = useWorkflowSubmitting();
      return <div data-testid="submitting">{isSubmitting ? 'yes' : 'no'}</div>;
    });

    const DataComponent = memo(() => {
      dataRenderCount.current += 1;
      const allData = useWorkflowAllData();
      return <div data-testid="data">{JSON.stringify(allData)}</div>;
    });

    render(
      <Wrapper>
        <StepComponent />
        <SubmittingComponent />
        <DataComponent />
      </Wrapper>
    );

    // All should render once initially
    expect(stepRenderCount.current).toBe(1);
    expect(submittingRenderCount.current).toBe(1);
    expect(dataRenderCount.current).toBe(1);

    // Change step - only step component should re-render
    act(() => {
      store.getState()._setCurrentStep(2);
    });
    expect(stepRenderCount.current).toBe(2);
    expect(submittingRenderCount.current).toBe(1);
    expect(dataRenderCount.current).toBe(1);

    // Change submitting - only submitting component should re-render
    act(() => {
      store.getState()._setSubmitting(true);
    });
    expect(stepRenderCount.current).toBe(2);
    expect(submittingRenderCount.current).toBe(2);
    expect(dataRenderCount.current).toBe(1);

    // Change data - only data component should re-render
    act(() => {
      store.getState()._setStepData({ field: 'value' }, 'step1');
    });
    expect(stepRenderCount.current).toBe(2);
    expect(submittingRenderCount.current).toBe(2);
    expect(dataRenderCount.current).toBe(2);
  });

  it('useWorkflowAllData should update when nested step data changes', () => {
    const { Wrapper, store } = createWrapper({
      defaultValues: { step1: { field1: 'initial' } },
    });

    const { result } = renderHook(() => useWorkflowAllData(), { wrapper: Wrapper });

    expect(result.current.step1).toEqual({ field1: 'initial' });

    act(() => {
      store.getState()._setStepData({ field1: 'updated' }, 'step1');
    });

    expect(result.current.step1).toEqual({ field1: 'updated' });
  });
});

describe('Workflow Selector Hooks - Edge Cases', () => {
  it('should handle rapid consecutive updates', () => {
    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => useCurrentStepIndex(), { wrapper: Wrapper });

    act(() => {
      for (let i = 0; i < 100; i++) {
        store.getState()._setCurrentStep(i);
      }
    });

    expect(result.current).toBe(99);
  });

  it('should handle concurrent state updates', () => {
    const { Wrapper, store } = createWrapper();
    const { result: stepResult } = renderHook(() => useCurrentStepIndex(), { wrapper: Wrapper });
    const { result: submittingResult } = renderHook(() => useWorkflowSubmitting(), {
      wrapper: Wrapper,
    });

    act(() => {
      store.getState()._setCurrentStep(5);
      store.getState()._setSubmitting(true);
    });

    expect(stepResult.current).toBe(5);
    expect(submittingResult.current).toBe(true);
  });

  it('should handle empty Sets correctly', () => {
    const { Wrapper, store } = createWrapper();

    const TestComponent = () => {
      const stepData = useWorkflowStepData();
      return <div data-testid="data">{Object.keys(stepData).length}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>
    );

    expect(screen.getByTestId('data')).toHaveTextContent('0');

    act(() => {
      store.getState()._setStepData({}, 'step1');
    });

    // Empty object should still work
    expect(screen.getByTestId('data')).toHaveTextContent('0');
  });
});
