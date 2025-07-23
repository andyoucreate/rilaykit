import { useCallback, useReducer } from 'react';
import type { PersistenceOptions, WorkflowPersistenceAdapter } from '../persistence/types';
import { usePersistence } from './usePersistence';

export interface WorkflowState {
  currentStepIndex: number;
  allData: Record<string, any>;
  stepData: Record<string, any>;
  visitedSteps: Set<string>;
  isSubmitting: boolean;
  isTransitioning: boolean;
}

export type WorkflowAction =
  | { type: 'SET_CURRENT_STEP'; stepIndex: number }
  | { type: 'SET_STEP_DATA'; data: Record<string, any>; stepId: string }
  | { type: 'SET_ALL_DATA'; data: Record<string, any> }
  | { type: 'SET_FIELD_VALUE'; fieldId: string; value: any; stepId: string }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_TRANSITIONING'; isTransitioning: boolean }
  | { type: 'MARK_STEP_VISITED'; stepIndex: number; stepId: string }
  | { type: 'RESET_WORKFLOW' }
  | { type: 'LOAD_PERSISTED_STATE'; state: Partial<WorkflowState> };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return {
        ...state,
        currentStepIndex: action.stepIndex,
      };

    case 'SET_STEP_DATA': {
      return {
        ...state,
        stepData: action.data,
        allData: {
          ...state.allData,
          [action.stepId]: action.data,
        },
      };
    }

    case 'SET_ALL_DATA':
      return {
        ...state,
        allData: action.data,
      };

    case 'SET_FIELD_VALUE': {
      const newStepData = { ...state.stepData, [action.fieldId]: action.value };
      return {
        ...state,
        stepData: newStepData,
        allData: {
          ...state.allData,
          [action.stepId]: newStepData,
        },
      };
    }

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case 'SET_TRANSITIONING':
      return {
        ...state,
        isTransitioning: action.isTransitioning,
      };

    case 'MARK_STEP_VISITED':
      return {
        ...state,
        visitedSteps: new Set([...state.visitedSteps, action.stepId]),
      };

    case 'RESET_WORKFLOW':
      return {
        currentStepIndex: 0,
        allData: {},
        stepData: {},
        visitedSteps: new Set(),
        isSubmitting: false,
        isTransitioning: false,
      };

    case 'LOAD_PERSISTED_STATE':
      return {
        ...state,
        ...action.state,
      };

    default:
      return state;
  }
}

export interface UseWorkflowStateProps {
  defaultValues?: Record<string, any>;
  persistence?: {
    workflowId: string;
    adapter?: WorkflowPersistenceAdapter;
    options?: PersistenceOptions;
    userId?: string;
    autoLoad?: boolean;
  };
}

export function useWorkflowState({ defaultValues = {}, persistence }: UseWorkflowStateProps) {
  const initialState: WorkflowState = {
    currentStepIndex: 0,
    allData: defaultValues,
    stepData: {},
    visitedSteps: new Set(),
    isSubmitting: false,
    isTransitioning: false,
  };

  const [workflowState, dispatch] = useReducer(workflowReducer, initialState);

  // Initialize persistence if configured
  const persistenceHook = persistence?.adapter
    ? usePersistence({
        workflowId: persistence.workflowId,
        workflowState,
        adapter: persistence.adapter,
        options: persistence.options,
        userId: persistence.userId,
      })
    : null;

  // Simple actions
  const setCurrentStep = useCallback((stepIndex: number) => {
    dispatch({ type: 'SET_CURRENT_STEP', stepIndex });
  }, []);

  const setStepData = useCallback((data: Record<string, any>, stepId: string) => {
    dispatch({ type: 'SET_STEP_DATA', data, stepId });
  }, []);

  const setFieldValue = useCallback((fieldId: string, value: any, stepId: string) => {
    dispatch({ type: 'SET_FIELD_VALUE', fieldId, value, stepId });
  }, []);

  const setSubmitting = useCallback((isSubmitting: boolean) => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting });
  }, []);

  const setTransitioning = useCallback((isTransitioning: boolean) => {
    dispatch({ type: 'SET_TRANSITIONING', isTransitioning });
  }, []);

  const markStepVisited = useCallback((stepIndex: number, stepId: string) => {
    dispatch({ type: 'MARK_STEP_VISITED', stepIndex, stepId });
  }, []);

  const resetWorkflow = useCallback(() => {
    dispatch({ type: 'RESET_WORKFLOW' });
  }, []);

  /**
   * Load persisted state into the current workflow
   */
  const loadPersistedState = useCallback(async () => {
    if (!persistenceHook) return false;

    try {
      const persistedData = await persistenceHook.loadPersistedData();
      if (persistedData) {
        const stateUpdate: Partial<WorkflowState> = {
          currentStepIndex: persistedData.currentStepIndex,
          allData: persistedData.allData,
          stepData: persistedData.stepData,
          visitedSteps: new Set(persistedData.visitedSteps),
        };

        dispatch({ type: 'LOAD_PERSISTED_STATE', state: stateUpdate });
        return true;
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }

    return false;
  }, [persistenceHook]);

  return {
    workflowState,
    setCurrentStep,
    setStepData,
    setFieldValue,
    setSubmitting,
    setTransitioning,
    markStepVisited,
    resetWorkflow,
    loadPersistedState,
    // Persistence utilities
    persistence: persistenceHook
      ? {
          isPersisting: persistenceHook.isPersisting,
          persistenceError: persistenceHook.persistenceError,
          persistNow: persistenceHook.persistNow,
          clearPersistedData: persistenceHook.clearPersistedData,
          hasPersistedData: persistenceHook.hasPersistedData,
        }
      : null,
  };
}
