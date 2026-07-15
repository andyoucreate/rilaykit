import { ConfigurationError, getOwn, hasOwn } from '@rilaykit/core';
import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =================================================================
// STORE STATE & ACTIONS
// =================================================================

export interface WorkflowStoreState {
  // Navigation state
  currentStepIndex: number;
  isTransitioning: boolean;
  isInitializing: boolean;

  // Data state
  allData: Record<string, unknown>;
  stepData: Record<string, unknown>;

  // Progress tracking
  visitedSteps: Set<string>;
  passedSteps: Set<string>;

  // Submission state
  isSubmitting: boolean;

  // Internal state
  _defaultValues: Record<string, unknown>;
  _defaultStepIndex: number;
  /**
   * Live repeatable row order per step, mirrored from each step's form.
   *
   * Deliberately NOT part of `allData`: `allData` is the payload handed to the
   * host on completion, and a bookkeeping key has no business in it. The order
   * is unreconstructable from the values (a move rewrites the order only), so
   * re-entering a step would silently revert the user's reorder without it.
   */
  _repeatableOrders: Record<string, Record<string, string[]>>;

  // Actions (internal - prefixed with _)
  _setCurrentStep: (stepIndex: number) => void;
  _setStepData: (data: Record<string, unknown>, stepId: string) => void;
  _setAllData: (data: Record<string, unknown>) => void;
  _setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  _removeFieldValues: (fieldIds: string[], stepId: string) => void;
  _setRepeatableOrder: (stepId: string, order: Record<string, string[]>) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _setTransitioning: (isTransitioning: boolean) => void;
  _setInitializing: (isInitializing: boolean) => void;
  _markStepVisited: (stepId: string) => void;
  _markStepPassed: (stepId: string) => void;
  _reset: () => void;
  _loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Value equality for a step's repeatable order map, so a re-report of the same
 * order does not publish a fresh state object (and re-render every consumer).
 */
function isSameRepeatableOrder(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const aIds = Object.keys(a);
  const bIds = Object.keys(b);
  if (aIds.length !== bIds.length) return false;
  return aIds.every((id) => {
    const aKeys = getOwn(a, id);
    const bKeys = getOwn(b, id);
    if (!aKeys || !bKeys || aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, index) => key === bKeys[index]);
  });
}

// =================================================================
// STORE FACTORY
// =================================================================

export type WorkflowStore = ReturnType<typeof createWorkflowStore>;

export interface CreateWorkflowStoreOptions {
  defaultValues?: Record<string, unknown>;
  defaultStepIndex?: number;
  initialVisitedSteps?: Set<string>;
  initialPassedSteps?: Set<string>;
}

export function createWorkflowStore(options: CreateWorkflowStoreOptions = {}) {
  const {
    defaultValues = {},
    defaultStepIndex = 0,
    initialVisitedSteps = new Set<string>(),
    initialPassedSteps = new Set<string>(),
  } = options;

  return createStore<WorkflowStoreState>()(
    subscribeWithSelector((set, get) => ({
      // Initial state
      currentStepIndex: defaultStepIndex,
      isTransitioning: false,
      isInitializing: true,
      allData: { ...defaultValues },
      stepData: {},
      visitedSteps: new Set(initialVisitedSteps),
      passedSteps: new Set(initialPassedSteps),
      isSubmitting: false,

      // Internal state
      _defaultValues: { ...defaultValues },
      _defaultStepIndex: defaultStepIndex,
      _repeatableOrders: {},

      // Actions
      _setCurrentStep: (stepIndex) => {
        set({ currentStepIndex: stepIndex });
      },

      _setStepData: (data, stepId) => {
        set((state) => ({
          stepData: data,
          allData: {
            ...state.allData,
            [stepId]: data,
          },
        }));
      },

      _setAllData: (data) => {
        set({ allData: data });
      },

      _setFieldValue: (fieldId, value, stepId) => {
        set((state) => {
          const newStepData = { ...state.stepData, [fieldId]: value };
          return {
            stepData: newStepData,
            allData: {
              ...state.allData,
              [stepId]: newStepData,
            },
          };
        });
      },

      /**
       * Delete field ids from a step's captured data.
       *
       * The mirror of `_setFieldValue`, and the reason the step slice is not
       * merge-only: a repeatable row the user removed has no value to write, it
       * has keys that must cease to exist. Deleting the reported keys (rather
       * than replacing the whole slice with the form's values) keeps every
       * non-form writer of the slice — prefill bindings, `onAfterValidation` —
       * authoritative for the keys it owns.
       */
      _removeFieldValues: (fieldIds, stepId) => {
        set((state) => {
          const newStepData = { ...state.stepData };
          let removed = false;
          for (const fieldId of fieldIds) {
            if (hasOwn(newStepData, fieldId)) {
              delete newStepData[fieldId];
              removed = true;
            }
          }
          if (!removed) return {};

          return {
            stepData: newStepData,
            allData: {
              ...state.allData,
              [stepId]: newStepData,
            },
          };
        });
      },

      _setRepeatableOrder: (stepId, order) => {
        set((state) => {
          const current = getOwn(state._repeatableOrders, stepId);
          if (current && isSameRepeatableOrder(current, order)) return {};
          return {
            _repeatableOrders: { ...state._repeatableOrders, [stepId]: order },
          };
        });
      },

      _setSubmitting: (isSubmitting) => {
        set({ isSubmitting });
      },

      _setTransitioning: (isTransitioning) => {
        set({ isTransitioning });
      },

      _setInitializing: (isInitializing) => {
        set({ isInitializing });
      },

      _markStepVisited: (stepId) => {
        set((state) => ({
          visitedSteps: new Set([...state.visitedSteps, stepId]),
        }));
      },

      _markStepPassed: (stepId) => {
        set((state) => ({
          passedSteps: new Set([...state.passedSteps, stepId]),
        }));
      },

      _reset: () => {
        const state = get();
        set({
          currentStepIndex: state._defaultStepIndex,
          allData: { ...state._defaultValues },
          stepData: {},
          _repeatableOrders: {},
          visitedSteps: new Set(),
          passedSteps: new Set(),
          isSubmitting: false,
          isTransitioning: false,
          isInitializing: false,
        });
      },

      _loadPersistedState: (persistedState) => {
        set((state) => ({
          ...state,
          ...persistedState,
          isInitializing: false,
        }));
      },
    }))
  );
}

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
 * Select all workflow data
 */
export function useFlowData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.allData);
}

/**
 * Select current step data
 */
export function useStepData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.stepData);
}

/**
 * Select data for a specific step
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
  reset: () => void;
  loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Get stable action references for workflow
 * Actions don't cause re-renders
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
    reset: () => store.getState()._reset(),
    loadPersistedState: (state) => store.getState()._loadPersistedState(state),
  };
}

/**
 * Get the raw store for advanced use cases
 */
export function useFlowStoreApi(): WorkflowStore {
  return useFlowStore();
}
