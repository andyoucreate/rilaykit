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

  // Actions (internal - prefixed with _)
  _setCurrentStep: (stepIndex: number) => void;
  _setStepData: (data: Record<string, unknown>, stepId: string) => void;
  _setAllData: (data: Record<string, unknown>) => void;
  _setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _setTransitioning: (isTransitioning: boolean) => void;
  _setInitializing: (isInitializing: boolean) => void;
  _markStepVisited: (stepId: string) => void;
  _markStepPassed: (stepId: string) => void;
  _reset: () => void;
  _loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
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
 * @throws Error if used outside of WorkflowProvider
 */
export function useWorkflowStore(): WorkflowStore {
  const store = useContext(WorkflowStoreContext);
  if (!store) {
    throw new Error('useWorkflowStore must be used within a WorkflowProvider');
  }
  return store;
}

// =================================================================
// GRANULAR SELECTORS
// =================================================================

/**
 * Select current step index - re-renders only when step changes
 */
export function useCurrentStepIndex(): number {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.currentStepIndex);
}

/**
 * Select transitioning state
 */
export function useWorkflowTransitioning(): boolean {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.isTransitioning);
}

/**
 * Select initializing state
 */
export function useWorkflowInitializing(): boolean {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.isInitializing);
}

/**
 * Select submitting state
 */
export function useWorkflowSubmitting(): boolean {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.isSubmitting);
}

/**
 * Select all workflow data
 */
export function useWorkflowAllData(): Record<string, unknown> {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.allData);
}

/**
 * Select current step data
 */
export function useWorkflowStepData(): Record<string, unknown> {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.stepData);
}

/**
 * Select data for a specific step
 */
export function useStepDataById(stepId: string): Record<string, unknown> | undefined {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.allData[stepId] as Record<string, unknown> | undefined);
}

/**
 * Select visited steps
 */
export function useVisitedSteps(): Set<string> {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.visitedSteps);
}

/**
 * Select passed steps
 */
export function usePassedSteps(): Set<string> {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.passedSteps);
}

/**
 * Check if a specific step is visited
 */
export function useIsStepVisited(stepId: string): boolean {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.visitedSteps.has(stepId));
}

/**
 * Check if a specific step is passed
 */
export function useIsStepPassed(stepId: string): boolean {
  const store = useWorkflowStore();
  return useStore(store, (state) => state.passedSteps.has(stepId));
}

/**
 * Select navigation state for buttons - minimal re-renders
 */
export function useWorkflowNavigationState(): {
  currentStepIndex: number;
  isTransitioning: boolean;
  isSubmitting: boolean;
} {
  const store = useWorkflowStore();
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isSubmitting = useStore(store, (state) => state.isSubmitting);

  return { currentStepIndex, isTransitioning, isSubmitting };
}

/**
 * Select submit state for workflow - minimal re-renders
 */
export function useWorkflowSubmitState(): {
  isSubmitting: boolean;
  isTransitioning: boolean;
  isInitializing: boolean;
} {
  const store = useWorkflowStore();
  const isSubmitting = useStore(store, (state) => state.isSubmitting);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isInitializing = useStore(store, (state) => state.isInitializing);

  return { isSubmitting, isTransitioning, isInitializing };
}

// =================================================================
// ACTION HOOKS
// =================================================================

export interface UseWorkflowActionsResult {
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
export function useWorkflowActions(): UseWorkflowActionsResult {
  const store = useWorkflowStore();

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
export function useWorkflowStoreApi(): WorkflowStore {
  return useWorkflowStore();
}
