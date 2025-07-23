/**
 * @fileoverview Persistence hook for Rilay workflows
 *
 * This hook provides workflow persistence functionality with automatic
 * debounced saving, error handling, and flexible adapter support.
 * It integrates seamlessly with the existing workflow state management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersistedWorkflowData,
  PersistenceOptions,
  UsePersistenceReturn,
  WorkflowPersistenceAdapter,
} from '../persistence/types';
import { WorkflowPersistenceError } from '../persistence/types';
import { debounce, generateStorageKey, workflowStateToPersisted } from '../persistence/utils';
import type { WorkflowState } from './useWorkflowState';

export interface UsePersistenceProps {
  /** Unique workflow identifier */
  workflowId: string;
  /** Current workflow state */
  workflowState: WorkflowState;
  /** Persistence adapter to use */
  adapter: WorkflowPersistenceAdapter;
  /** Persistence options */
  options?: PersistenceOptions;
  /** Optional user ID for multi-user scenarios */
  userId?: string;
}

/**
 * Hook for managing workflow persistence
 *
 * Provides automatic persistence with debouncing, manual save/load operations,
 * and comprehensive error handling. Integrates with any persistence adapter
 * that implements the WorkflowPersistenceAdapter interface.
 *
 * @example
 * ```typescript
 * const persistence = usePersistence({
 *   workflowId: 'user-onboarding',
 *   workflowState,
 *   adapter: new LocalStorageAdapter(),
 *   options: {
 *     autoPersist: true,
 *     debounceMs: 1000
 *   }
 * });
 *
 * if (persistence.persistenceError) {
 *   console.error('Persistence error:', persistence.persistenceError);
 * }
 * ```
 */
export function usePersistence({
  workflowId,
  workflowState,
  adapter,
  options = {},
  userId,
}: UsePersistenceProps): UsePersistenceReturn {
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistenceError, setPersistenceError] = useState<WorkflowPersistenceError | null>(null);

  // Refs for stable references
  const adapterRef = useRef(adapter);
  const optionsRef = useRef(options);
  const persistenceStateRef = useRef<{
    lastSavedState?: WorkflowState;
    hasPendingChanges: boolean;
  }>({ hasPendingChanges: false });

  // Update refs when props change
  useEffect(() => {
    adapterRef.current = adapter;
    optionsRef.current = options;
  }, [adapter, options]);

  // Generate storage key
  const storageKey = generateStorageKey(optionsRef.current.storageKey || workflowId, userId);

  /**
   * Clear any existing persistence error
   */
  const clearError = useCallback(() => {
    setPersistenceError(null);
  }, []);

  /**
   * Handle persistence errors consistently
   */
  const handleError = useCallback((error: Error, operation: string) => {
    const persistenceError =
      error instanceof WorkflowPersistenceError
        ? error
        : new WorkflowPersistenceError(
            `${operation} failed: ${error.message}`,
            'OPERATION_FAILED',
            error
          );

    setPersistenceError(persistenceError);
    console.error('[WorkflowPersistence]', persistenceError);
  }, []);

  /**
   * Save current workflow state
   */
  const saveWorkflowState = useCallback(
    async (state: WorkflowState): Promise<void> => {
      clearError();
      setIsPersisting(true);

      try {
        const persistedData = workflowStateToPersisted(
          workflowId,
          state,
          optionsRef.current.metadata
        );

        await adapterRef.current.save(storageKey, persistedData);

        // Update tracking state
        persistenceStateRef.current.lastSavedState = { ...state };
        persistenceStateRef.current.hasPendingChanges = false;
      } catch (error) {
        handleError(error as Error, 'Save');
        throw error;
      } finally {
        setIsPersisting(false);
      }
    },
    [workflowId, storageKey, clearError, handleError]
  );

  /**
   * Debounced save function for auto-persistence
   */
  const debouncedSave = useRef(
    debounce(async (state: WorkflowState) => {
      try {
        await saveWorkflowState(state);
      } catch (error) {
        // Error is already handled in saveWorkflowState
        // Just log for debugging
        console.debug('[WorkflowPersistence] Auto-save failed:', error);
      }
    }, options.debounceMs || 500)
  );

  /**
   * Check if state has meaningful changes that warrant persistence
   */
  const hasSignificantChanges = useCallback(
    (currentState: WorkflowState, lastSavedState?: WorkflowState): boolean => {
      if (!lastSavedState) return true;

      // Check for changes in significant fields
      return (
        currentState.currentStepIndex !== lastSavedState.currentStepIndex ||
        JSON.stringify(currentState.allData) !== JSON.stringify(lastSavedState.allData) ||
        JSON.stringify(currentState.stepData) !== JSON.stringify(lastSavedState.stepData) ||
        currentState.visitedSteps.size !== lastSavedState.visitedSteps.size ||
        !Array.from(currentState.visitedSteps).every((step) =>
          lastSavedState.visitedSteps.has(step)
        )
      );
    },
    []
  );

  /**
   * Auto-persistence effect
   */
  useEffect(() => {
    if (!optionsRef.current.autoPersist) return;

    // Skip if currently persisting or in transition states
    if (isPersisting || workflowState.isSubmitting || workflowState.isTransitioning) {
      return;
    }

    // Check if we have significant changes
    if (!hasSignificantChanges(workflowState, persistenceStateRef.current.lastSavedState)) {
      return;
    }

    // Mark as having pending changes
    persistenceStateRef.current.hasPendingChanges = true;

    // Trigger debounced save
    debouncedSave.current(workflowState);
  }, [workflowState, isPersisting, hasSignificantChanges]);

  /**
   * Manual save operation
   */
  const persistNow = useCallback(async (): Promise<void> => {
    await saveWorkflowState(workflowState);
  }, [saveWorkflowState, workflowState]);

  /**
   * Load persisted data
   */
  const loadPersistedData = useCallback(async (): Promise<PersistedWorkflowData | null> => {
    clearError();

    try {
      const data = await adapterRef.current.load(storageKey);
      if (data) {
        // Update tracking state
        persistenceStateRef.current.lastSavedState = {
          currentStepIndex: data.currentStepIndex,
          allData: data.allData,
          stepData: data.stepData,
          visitedSteps: new Set(data.visitedSteps),
          isSubmitting: false,
          isTransitioning: false,
        };
        persistenceStateRef.current.hasPendingChanges = false;
      }
      return data;
    } catch (error) {
      handleError(error as Error, 'Load');
      return null;
    }
  }, [storageKey, clearError, handleError]);

  /**
   * Clear persisted data
   */
  const clearPersistedData = useCallback(async (): Promise<void> => {
    clearError();

    try {
      await adapterRef.current.remove(storageKey);

      // Reset tracking state
      persistenceStateRef.current.lastSavedState = undefined;
      persistenceStateRef.current.hasPendingChanges = false;
    } catch (error) {
      handleError(error as Error, 'Clear');
      throw error;
    }
  }, [storageKey, clearError, handleError]);

  /**
   * Check if persisted data exists
   */
  const hasPersistedData = useCallback(async (): Promise<boolean> => {
    try {
      return await adapterRef.current.exists(storageKey);
    } catch (error) {
      handleError(error as Error, 'Exists check');
      return false;
    }
  }, [storageKey, handleError]);

  return {
    isPersisting,
    persistenceError,
    persistNow,
    loadPersistedData,
    clearPersistedData,
    hasPersistedData,
  };
}
