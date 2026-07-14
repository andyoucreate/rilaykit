/**
 * @fileoverview Persistence utilities for Rilay workflows
 *
 * This module provides utility functions for working with workflow persistence,
 * including data transformation, validation, and helper functions for
 * converting between different data formats.
 */

import type { WorkflowState } from '../hooks/useWorkflowState';
import type { PersistedWorkflowData } from './types';

/**
 * Convert WorkflowState to PersistedWorkflowData format
 */
export function workflowStateToPersisted(
  workflowId: string,
  state: WorkflowState,
  metadata?: Record<string, any>
): PersistedWorkflowData {
  return {
    workflowId,
    currentStepIndex: state.currentStepIndex,
    allData: { ...state.allData },
    stepData: { ...state.stepData },
    visitedSteps: Array.from(state.visitedSteps),
    passedSteps: Array.from(state.passedSteps),
    lastSaved: Date.now(),
    metadata,
  };
}

/**
 * Convert PersistedWorkflowData to WorkflowState format
 */
export function persistedToWorkflowState(data: PersistedWorkflowData): Partial<WorkflowState> {
  return {
    currentStepIndex: data.currentStepIndex,
    allData: { ...data.allData },
    stepData: { ...data.stepData },
    visitedSteps: new Set(data.visitedSteps),
    passedSteps: new Set(data.passedSteps || []),
    isSubmitting: false,
    isTransitioning: false,
  };
}

/**
 * Validate persisted workflow data structure
 */
export function validatePersistedData(data: any): data is PersistedWorkflowData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const required = [
    'workflowId',
    'currentStepIndex',
    'allData',
    'stepData',
    'visitedSteps',
    'lastSaved',
  ];

  for (const field of required) {
    if (!(field in data)) {
      return false;
    }
  }

  // Type checks
  if (typeof data.workflowId !== 'string') return false;
  if (typeof data.currentStepIndex !== 'number') return false;
  if (typeof data.allData !== 'object') return false;
  if (typeof data.stepData !== 'object') return false;
  if (!Array.isArray(data.visitedSteps)) return false;
  if (typeof data.lastSaved !== 'number') return false;

  return true;
}

/**
 * Generate a storage key for a workflow
 */
export function generateStorageKey(workflowId: string, userId?: string): string {
  if (userId) {
    return `${userId}:${workflowId}`;
  }
  return workflowId;
}

/**
 * A debounced function exposing a `cancel` to drop a pending invocation.
 */
export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  /** Cancel any pending (scheduled-but-not-yet-fired) invocation. */
  cancel: () => void;
}

/**
 * Debounce function for auto-persistence.
 *
 * The returned function carries a `cancel()` so callers can drop a pending
 * save — e.g. after clearing persisted data or on workflow completion, where a
 * save scheduled from the last edit would otherwise fire and re-persist state
 * that was just removed.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      func(...args);
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Merge persisted data with current state, handling conflicts
 */
export function mergePersistedState(
  currentState: WorkflowState,
  persistedData: PersistedWorkflowData,
  strategy: 'persist' | 'current' | 'merge' = 'persist'
): Partial<WorkflowState> {
  const persistedState = persistedToWorkflowState(persistedData);

  switch (strategy) {
    case 'persist':
      // Use persisted data, keep current loading states
      return {
        ...persistedState,
        isSubmitting: currentState.isSubmitting,
        isTransitioning: currentState.isTransitioning,
      };

    case 'current':
      // Keep current state, but merge visited and passed steps
      return {
        ...currentState,
        visitedSteps: new Set([...currentState.visitedSteps, ...persistedState.visitedSteps!]),
        passedSteps: new Set([...currentState.passedSteps, ...(persistedState.passedSteps || [])]),
      };

    case 'merge':
      // Intelligent merge: prefer current step position, merge data
      return {
        currentStepIndex: currentState.currentStepIndex,
        allData: {
          ...persistedState.allData,
          ...currentState.allData,
        },
        stepData: {
          ...persistedState.stepData,
          ...currentState.stepData,
        },
        visitedSteps: new Set([...persistedState.visitedSteps!, ...currentState.visitedSteps]),
        passedSteps: new Set([...(persistedState.passedSteps || []), ...currentState.passedSteps]),
        isSubmitting: currentState.isSubmitting,
        isTransitioning: currentState.isTransitioning,
      };

    default:
      return persistedState;
  }
}
