'use client';

import { ConfigurationError } from '@rilaykit/core';
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { WorkflowStore, WorkflowStoreState } from './workflowStore';

// =================================================================
// REACT CONTEXT
// =================================================================

export const WorkflowStoreContext = createContext<WorkflowStore | null>(null);

/**
 * Get the workflow store from context
 * @throws ConfigurationError if used outside of WorkflowProvider
 */
export function useFlowStore(): WorkflowStore {
  const store = useContext(WorkflowStoreContext);
  if (!store) {
    throw new ConfigurationError('useFlowStore must be used within a WorkflowProvider');
  }
  return store;
}

// =================================================================
// GRANULAR SELECTORS
// =================================================================

/**
 * Select current step index - re-renders only when step changes
 */
export function useFlowStepIndex(): number {
  const store = useFlowStore();
  return useStore(store, (state) => state.currentStepIndex);
}

/**
 * Select transitioning state
 */
export function useFlowTransitioning(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isTransitioning);
}

/**
 * Select initializing state
 */
export function useFlowInitializing(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isInitializing);
}

/**
 * Select submitting state
 */
export function useFlowSubmitting(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isSubmitting);
}

/**
 * Select all workflow data, keyed by step id.
 *
 * SHAPE: the store's INTERNAL representation — a repeatable's rows are flat
 * composite keys (`lines[k0].label`), not the authored `lines: [{label}]`. This
 * is the live escape hatch: it is `allData` as the store holds it, and the only
 * way to observe what a removal actually removed.
 *
 * The AUTHORED shape is what every host CALLBACK receives — the completion
 * payload, `onAfterValidation` and its helper, and all three analytics data
 * callbacks. Reach for those when you want the contract rather than the store.
 * See {@link structureStepSlice} for the full boundary list.
 */
export function useFlowData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.allData);
}

/**
 * Select the CURRENT step's data.
 *
 * SHAPE: flat composite keys, as {@link useFlowData} — the store's internal
 * representation, not the authored one.
 */
export function useStepData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.stepData);
}

/**
 * Select data for a specific step.
 *
 * SHAPE: flat composite keys, as {@link useFlowData} — the store's internal
 * representation, not the authored one.
 */
export function useStepDataById(stepId: string): Record<string, unknown> | undefined {
  const store = useFlowStore();
  return useStore(store, (state) => state.allData[stepId] as Record<string, unknown> | undefined);
}

/**
 * Select visited steps
 */
export function useVisitedSteps(): Set<string> {
  const store = useFlowStore();
  return useStore(store, (state) => state.visitedSteps);
}

/**
 * Select passed steps
 */
export function usePassedSteps(): Set<string> {
  const store = useFlowStore();
  return useStore(store, (state) => state.passedSteps);
}

/**
 * Select skipped steps
 */
export function useSkippedSteps(): Set<string> {
  const store = useFlowStore();
  return useStore(store, (state) => state.skippedSteps);
}

/**
 * Check if a specific step is visited
 */
export function useIsStepVisited(stepId: string): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.visitedSteps.has(stepId));
}

/**
 * Check if a specific step is passed
 */
export function useIsStepPassed(stepId: string): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.passedSteps.has(stepId));
}

/**
 * Check if a specific step is skipped
 */
export function useIsStepSkipped(stepId: string): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.skippedSteps.has(stepId));
}

/**
 * Select navigation state for buttons - minimal re-renders
 */
export function useFlowNavigationState(): {
  currentStepIndex: number;
  isTransitioning: boolean;
  isSubmitting: boolean;
} {
  const store = useFlowStore();
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isSubmitting = useStore(store, (state) => state.isSubmitting);

  return { currentStepIndex, isTransitioning, isSubmitting };
}

/**
 * Select submit state for workflow - minimal re-renders
 */
export function useFlowSubmitState(): {
  isSubmitting: boolean;
  isTransitioning: boolean;
  isInitializing: boolean;
} {
  const store = useFlowStore();
  const isSubmitting = useStore(store, (state) => state.isSubmitting);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isInitializing = useStore(store, (state) => state.isInitializing);

  return { isSubmitting, isTransitioning, isInitializing };
}

// =================================================================
// ACTION HOOKS
// =================================================================

export interface UseFlowActionsResult {
  setCurrentStep: (stepIndex: number) => void;
  setStepData: (data: Record<string, unknown>, stepId: string) => void;
  setAllData: (data: Record<string, unknown>) => void;
  setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setTransitioning: (isTransitioning: boolean) => void;
  setInitializing: (isInitializing: boolean) => void;
  markStepVisited: (stepId: string) => void;
  markStepPassed: (stepId: string) => void;
  markStepSkipped: (stepId: string) => void;
  reset: () => void;
  loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Get stable action references for workflow. Actions don't cause re-renders.
 *
 * `setStepData` / `setAllData` / `setFieldValue` accept host-authored data in
 * EITHER shape: the store normalises a repeatable's authored array to its
 * internal flat keys on the way in, exactly as it does for the compiled
 * defaults and for every write the provider makes. No action is exempt. See
 * `createWorkflowStore`'s `normalizeSlice`.
 */
export function useFlowActions(): UseFlowActionsResult {
  const store = useFlowStore();

  return {
    setCurrentStep: (stepIndex) => store.getState()._setCurrentStep(stepIndex),
    setStepData: (data, stepId) => store.getState()._setStepData(data, stepId),
    setAllData: (data) => store.getState()._setAllData(data),
    setFieldValue: (fieldId, value, stepId) =>
      store.getState()._setFieldValue(fieldId, value, stepId),
    setSubmitting: (isSubmitting) => store.getState()._setSubmitting(isSubmitting),
    setTransitioning: (isTransitioning) => store.getState()._setTransitioning(isTransitioning),
    setInitializing: (isInitializing) => store.getState()._setInitializing(isInitializing),
    markStepVisited: (stepId) => store.getState()._markStepVisited(stepId),
    markStepPassed: (stepId) => store.getState()._markStepPassed(stepId),
    markStepSkipped: (stepId) => store.getState()._markStepSkipped(stepId),
    reset: () => store.getState()._reset(),
    loadPersistedState: (state) => store.getState()._loadPersistedState(state),
  };
}

/**
 * Get the raw store for advanced use cases.
 *
 * BYPASSES THE GUARD: a `setState` here goes around the actions, and the
 * normalisation lives in the actions. Planting an authored repeatable array
 * (`setState({allData:{items:{lines:[{label:'a'}]}}})`) breaks the store's
 * flat-composite-key invariant, and the row it plants is one the user cannot
 * delete. Write through {@link useFlowActions} — every action there normalises,
 * whichever shape you hand it.
 */
export function useFlowStoreApi(): WorkflowStore {
  return useFlowStore();
}
