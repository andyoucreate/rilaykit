import { ConfigurationError, ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import {
  type CreateWorkflowStoreOptions,
  WorkflowStoreContext,
  createWorkflowStore,
  useFlowActions,
  useFlowData,
  useFlowInitializing,
  useFlowNavigationState,
  useFlowStepIndex,
  useFlowStore,
  useFlowSubmitState,
  useFlowSubmitting,
  useFlowTransitioning,
  useIsStepPassed,
  useIsStepVisited,
  usePassedSteps,
  useStepData,
  useVisitedSteps,
} from '../../src/stores/workflowStore';

// Helper to create a wrapper with store context
function createWrapper(options: CreateWorkflowStoreOptions = {}) {
  const store = createWorkflowStore(options);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <WorkflowStoreContext.Provider value={store}>{children}</WorkflowStoreContext.Provider>
  );
  return { Wrapper, store };
}

/**
 * `stepData` is a VIEW of `allData[_currentStepId]`, and the store names that
 * owner from its OWN steps — so a test that asserts anything about the mirror
 * hands the store steps, the same configuration `WorkflowProvider` builds. A
 * store without them cannot name a current step at all, which makes a mirror
 * assertion vacuous rather than strict. The same reasoning, and the same
 * `getSteps`, as `workflowStore.crossStepWrite.test.ts`.
 *
 * Every OTHER test in this file deliberately keeps its bare store: an index, a
 * flag, a visited set and `allData` itself are all answerable without steps.
 */
const catalog = ril.create();
const STEPS = flow
  .create(catalog, 'wf', 'W')
  .addStep({ id: 'step1', title: 'Step 1', formConfig: form.create(catalog, 'f1') })
  .addStep({ id: 'step2', title: 'Step 2', formConfig: form.create(catalog, 'f2') })
  .build().steps;
const getSteps = () => STEPS;

describe('workflowStore', () => {
  describe('createWorkflowStore', () => {
    it('should create a store with default values', () => {
      const store = createWorkflowStore();
      const state = store.getState();

      expect(state.currentStepIndex).toBe(0);
      expect(state.isTransitioning).toBe(false);
      expect(state.isInitializing).toBe(true);
      expect(state.isSubmitting).toBe(false);
      expect(state.allData).toEqual({});
      expect(state.stepData).toEqual({});
      expect(state.visitedSteps.size).toBe(0);
      expect(state.passedSteps.size).toBe(0);
    });

    it('should create a store with custom initial values', () => {
      const store = createWorkflowStore({
        defaultValues: { step1: { field1: 'value1' } },
        defaultStepIndex: 2,
        initialVisitedSteps: new Set(['step1', 'step2']),
        initialPassedSteps: new Set(['step1']),
      });
      const state = store.getState();

      expect(state.currentStepIndex).toBe(2);
      expect(state.allData).toEqual({ step1: { field1: 'value1' } });
      expect(state.visitedSteps.has('step1')).toBe(true);
      expect(state.visitedSteps.has('step2')).toBe(true);
      expect(state.passedSteps.has('step1')).toBe(true);
    });
  });

  describe('Actions', () => {
    it('should set current step', () => {
      const store = createWorkflowStore();

      store.getState()._setCurrentStep(3);

      expect(store.getState().currentStepIndex).toBe(3);
    });

    it('should set step data and update allData', () => {
      const store = createWorkflowStore({ getSteps });
      const stepData = { field1: 'value1', field2: 'value2' };

      store.getState()._setStepData(stepData, 'step1');

      expect(store.getState().stepData).toEqual(stepData);
      expect(store.getState().allData.step1).toEqual(stepData);
    });

    it('should set all data', () => {
      const store = createWorkflowStore();
      const allData = { step1: { field1: 'value1' }, step2: { field2: 'value2' } };

      store.getState()._setAllData(allData);

      expect(store.getState().allData).toEqual(allData);
    });

    it('should set field value and update both stepData and allData', () => {
      const store = createWorkflowStore({ getSteps });

      store.getState()._setFieldValue('field1', 'value1', 'step1');

      expect(store.getState().stepData.field1).toBe('value1');
      expect((store.getState().allData.step1 as Record<string, unknown>)?.field1).toBe('value1');
    });

    it('should set submitting state', () => {
      const store = createWorkflowStore();

      store.getState()._setSubmitting(true);
      expect(store.getState().isSubmitting).toBe(true);

      store.getState()._setSubmitting(false);
      expect(store.getState().isSubmitting).toBe(false);
    });

    it('should set transitioning state', () => {
      const store = createWorkflowStore();

      store.getState()._setTransitioning(true);
      expect(store.getState().isTransitioning).toBe(true);

      store.getState()._setTransitioning(false);
      expect(store.getState().isTransitioning).toBe(false);
    });

    it('should set initializing state', () => {
      const store = createWorkflowStore();

      expect(store.getState().isInitializing).toBe(true);
      store.getState()._setInitializing(false);
      expect(store.getState().isInitializing).toBe(false);
    });

    it('should mark step as visited', () => {
      const store = createWorkflowStore();

      store.getState()._markStepVisited('step1');
      expect(store.getState().visitedSteps.has('step1')).toBe(true);

      store.getState()._markStepVisited('step2');
      expect(store.getState().visitedSteps.has('step1')).toBe(true);
      expect(store.getState().visitedSteps.has('step2')).toBe(true);
    });

    it('should mark step as passed', () => {
      const store = createWorkflowStore();

      store.getState()._markStepPassed('step1');
      expect(store.getState().passedSteps.has('step1')).toBe(true);

      store.getState()._markStepPassed('step2');
      expect(store.getState().passedSteps.has('step1')).toBe(true);
      expect(store.getState().passedSteps.has('step2')).toBe(true);
    });

    it('should reset to default state', () => {
      const store = createWorkflowStore({
        defaultValues: { step1: { field1: 'default' } },
        defaultStepIndex: 1,
      });

      // Modify state
      store.getState()._setCurrentStep(5);
      store.getState()._setStepData({ field2: 'modified' }, 'step2');
      store.getState()._markStepVisited('step3');
      store.getState()._setSubmitting(true);

      // Reset
      store.getState()._reset();

      const state = store.getState();
      expect(state.currentStepIndex).toBe(1); // Back to default
      expect(state.allData).toEqual({ step1: { field1: 'default' } });
      expect(state.stepData).toEqual({});
      expect(state.visitedSteps.size).toBe(0);
      expect(state.passedSteps.size).toBe(0);
      expect(state.isSubmitting).toBe(false);
      expect(state.isTransitioning).toBe(false);
      expect(state.isInitializing).toBe(false);
    });

    it('should load persisted state', () => {
      const store = createWorkflowStore();

      store.getState()._loadPersistedState({
        currentStepIndex: 3,
        allData: { step1: { field1: 'persisted' } },
        visitedSteps: new Set(['step1', 'step2', 'step3']),
        passedSteps: new Set(['step1', 'step2']),
      });

      const state = store.getState();
      expect(state.currentStepIndex).toBe(3);
      expect(state.allData.step1).toEqual({ field1: 'persisted' });
      expect(state.visitedSteps.has('step3')).toBe(true);
      expect(state.passedSteps.has('step2')).toBe(true);
      expect(state.isInitializing).toBe(false);
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers when state changes', () => {
      const store = createWorkflowStore();
      const listener = vi.fn();

      // Subscribe to currentStepIndex changes
      const unsubscribe = store.subscribe((state) => state.currentStepIndex, listener);

      store.getState()._setCurrentStep(1);
      expect(listener).toHaveBeenCalledWith(1, 0);

      store.getState()._setCurrentStep(2);
      expect(listener).toHaveBeenCalledWith(2, 1);

      unsubscribe();
      store.getState()._setCurrentStep(3);
      expect(listener).toHaveBeenCalledTimes(2); // No more calls after unsubscribe
    });

    it('should not notify when unrelated state changes', () => {
      const store = createWorkflowStore();
      const stepListener = vi.fn();

      store.subscribe((state) => state.currentStepIndex, stepListener);

      // This should NOT trigger the step listener
      store.getState()._setSubmitting(true);
      expect(stepListener).not.toHaveBeenCalled();

      // This should trigger it
      store.getState()._setCurrentStep(1);
      expect(stepListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Selector Hooks', () => {
    it('useFlowStore should throw a ConfigurationError outside provider', () => {
      expect(() => renderHook(() => useFlowStore())).toThrow(ConfigurationError);

      try {
        renderHook(() => useFlowStore());
        expect.unreachable('useFlowStore must throw outside a WorkflowProvider');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configurationError = error as ConfigurationError;
        expect(configurationError.code).toBe('CONFIGURATION');
        expect(configurationError.message).toBe(
          'useFlowStore must be used within a WorkflowProvider'
        );
      }
    });

    it('useFlowStepIndex should return current step', () => {
      const { Wrapper, store } = createWrapper({ defaultStepIndex: 2 });
      const { result } = renderHook(() => useFlowStepIndex(), { wrapper: Wrapper });

      expect(result.current).toBe(2);

      act(() => {
        store.getState()._setCurrentStep(5);
      });

      expect(result.current).toBe(5);
    });

    it('useFlowTransitioning should return transitioning state', () => {
      const { Wrapper, store } = createWrapper();
      const { result } = renderHook(() => useFlowTransitioning(), { wrapper: Wrapper });

      expect(result.current).toBe(false);

      act(() => {
        store.getState()._setTransitioning(true);
      });

      expect(result.current).toBe(true);
    });

    it('useFlowInitializing should return initializing state', () => {
      const { Wrapper, store } = createWrapper();
      const { result } = renderHook(() => useFlowInitializing(), { wrapper: Wrapper });

      expect(result.current).toBe(true);

      act(() => {
        store.getState()._setInitializing(false);
      });

      expect(result.current).toBe(false);
    });

    it('useFlowSubmitting should return submitting state', () => {
      const { Wrapper, store } = createWrapper();
      const { result } = renderHook(() => useFlowSubmitting(), { wrapper: Wrapper });

      expect(result.current).toBe(false);

      act(() => {
        store.getState()._setSubmitting(true);
      });

      expect(result.current).toBe(true);
    });

    it('useFlowData should return all data', () => {
      const { Wrapper, store } = createWrapper({
        defaultValues: { step1: { field1: 'value1' } },
      });
      const { result } = renderHook(() => useFlowData(), { wrapper: Wrapper });

      expect(result.current).toEqual({ step1: { field1: 'value1' } });

      act(() => {
        store.getState()._setStepData({ field2: 'value2' }, 'step2');
      });

      expect(result.current.step2).toEqual({ field2: 'value2' });
    });

    it('useStepData should return current step data', () => {
      const { Wrapper, store } = createWrapper({ getSteps });
      const { result } = renderHook(() => useStepData(), { wrapper: Wrapper });

      expect(result.current).toEqual({});

      act(() => {
        store.getState()._setStepData({ field1: 'value1' }, 'step1');
      });

      expect(result.current).toEqual({ field1: 'value1' });
    });

    it('useVisitedSteps should return visited steps Set', () => {
      const { Wrapper, store } = createWrapper({
        initialVisitedSteps: new Set(['step1']),
      });
      const { result } = renderHook(() => useVisitedSteps(), { wrapper: Wrapper });

      expect(result.current.has('step1')).toBe(true);

      act(() => {
        store.getState()._markStepVisited('step2');
      });

      expect(result.current.has('step2')).toBe(true);
    });

    it('usePassedSteps should return passed steps Set', () => {
      const { Wrapper, store } = createWrapper({
        initialPassedSteps: new Set(['step1']),
      });
      const { result } = renderHook(() => usePassedSteps(), { wrapper: Wrapper });

      expect(result.current.has('step1')).toBe(true);

      act(() => {
        store.getState()._markStepPassed('step2');
      });

      expect(result.current.has('step2')).toBe(true);
    });

    it('useIsStepVisited should check if specific step is visited', () => {
      const { Wrapper, store } = createWrapper({
        initialVisitedSteps: new Set(['step1']),
      });
      const { result: result1 } = renderHook(() => useIsStepVisited('step1'), { wrapper: Wrapper });
      const { result: result2 } = renderHook(() => useIsStepVisited('step2'), { wrapper: Wrapper });

      expect(result1.current).toBe(true);
      expect(result2.current).toBe(false);

      act(() => {
        store.getState()._markStepVisited('step2');
      });

      expect(result2.current).toBe(true);
    });

    it('useIsStepPassed should check if specific step is passed', () => {
      const { Wrapper, store } = createWrapper({
        initialPassedSteps: new Set(['step1']),
      });
      const { result: result1 } = renderHook(() => useIsStepPassed('step1'), { wrapper: Wrapper });
      const { result: result2 } = renderHook(() => useIsStepPassed('step2'), { wrapper: Wrapper });

      expect(result1.current).toBe(true);
      expect(result2.current).toBe(false);

      act(() => {
        store.getState()._markStepPassed('step2');
      });

      expect(result2.current).toBe(true);
    });

    it('useFlowNavigationState should return navigation state', () => {
      const { Wrapper, store } = createWrapper({ defaultStepIndex: 1 });
      const { result } = renderHook(() => useFlowNavigationState(), { wrapper: Wrapper });

      expect(result.current).toEqual({
        currentStepIndex: 1,
        isTransitioning: false,
        isSubmitting: false,
      });

      act(() => {
        store.getState()._setTransitioning(true);
        store.getState()._setCurrentStep(2);
      });

      expect(result.current).toEqual({
        currentStepIndex: 2,
        isTransitioning: true,
        isSubmitting: false,
      });
    });

    it('useFlowSubmitState should return submit state', () => {
      const { Wrapper, store } = createWrapper();
      const { result } = renderHook(() => useFlowSubmitState(), { wrapper: Wrapper });

      expect(result.current).toEqual({
        isSubmitting: false,
        isTransitioning: false,
        isInitializing: true,
      });

      act(() => {
        store.getState()._setSubmitting(true);
        store.getState()._setInitializing(false);
      });

      expect(result.current).toEqual({
        isSubmitting: true,
        isTransitioning: false,
        isInitializing: false,
      });
    });
  });

  describe('Action Hooks', () => {
    it('useFlowActions should provide all expected actions', () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useFlowActions(), { wrapper: Wrapper });

      // Verify all expected actions are available
      expect(typeof result.current.setCurrentStep).toBe('function');
      expect(typeof result.current.setStepData).toBe('function');
      expect(typeof result.current.setAllData).toBe('function');
      expect(typeof result.current.setFieldValue).toBe('function');
      expect(typeof result.current.setSubmitting).toBe('function');
      expect(typeof result.current.setTransitioning).toBe('function');
      expect(typeof result.current.setInitializing).toBe('function');
      expect(typeof result.current.markStepVisited).toBe('function');
      expect(typeof result.current.markStepPassed).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.loadPersistedState).toBe('function');
    });

    it('useFlowActions should update store state', () => {
      const { Wrapper, store } = createWrapper({ getSteps });
      const { result } = renderHook(() => useFlowActions(), { wrapper: Wrapper });

      // A step this store HAS, so the write below names the step the mirror is
      // a view of. (`setCurrentStep` accepting an out-of-range index is its own
      // test above, on a store with nothing to be in range of.)
      act(() => {
        result.current.setCurrentStep(1);
      });
      expect(store.getState().currentStepIndex).toBe(1);

      act(() => {
        result.current.setStepData({ field1: 'value1' }, 'step2');
      });
      expect(store.getState().stepData).toEqual({ field1: 'value1' });

      act(() => {
        result.current.setSubmitting(true);
      });
      expect(store.getState().isSubmitting).toBe(true);

      act(() => {
        result.current.markStepVisited('step1');
      });
      expect(store.getState().visitedSteps.has('step1')).toBe(true);

      act(() => {
        result.current.markStepPassed('step1');
      });
      expect(store.getState().passedSteps.has('step1')).toBe(true);

      act(() => {
        result.current.reset();
      });
      expect(store.getState().currentStepIndex).toBe(0);
    });
  });
});
