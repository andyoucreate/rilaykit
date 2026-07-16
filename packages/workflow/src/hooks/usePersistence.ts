/**
 * @fileoverview Persistence hook for Rilay workflows
 *
 * This hook provides workflow persistence functionality with automatic
 * debounced saving, error handling, and flexible adapter support.
 * It integrates seamlessly with the existing workflow state management.
 */

import { getLogger } from '@rilaykit/core';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersistedWorkflowData,
  PersistenceOptions,
  UsePersistenceReturn,
  WorkflowPersistenceAdapter,
} from '../persistence/types';
import { WorkflowPersistenceError } from '../persistence/types';
import { debounce, generateStorageKey, workflowStateToPersisted } from '../persistence/utils';
import type { WorkflowState } from './workflow-state';

const log = getLogger('workflow:persistence');

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
  /**
   * Shared flag flipped once the workflow completes. When set, the auto-persist
   * effect must NOT schedule further saves: completion clears the persisted data
   * and any subsequent save would resurrect the finished workflow.
   */
  workflowCompletedRef?: MutableRefObject<boolean>;
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
  workflowCompletedRef,
}: UsePersistenceProps): UsePersistenceReturn {
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistenceError, setPersistenceError] = useState<WorkflowPersistenceError | null>(null);
  const [isLoadingPersisted, setIsLoadingPersisted] = useState(false);

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
    log.error('[WorkflowPersistence]', persistenceError);
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

        // Completion clears the persisted data; a save that reaches the
        // adapter after the flag flipped would resurrect the finished
        // workflow, so skip the write entirely.
        if (workflowCompletedRef?.current) {
          persistenceStateRef.current.hasPendingChanges = false;
          return;
        }

        await adapterRef.current.save(storageKey, persistedData);

        // The workflow may have completed (and cleared its persisted data)
        // while the save above was in flight — in that case the write just
        // resurrected the cleared record, so undo it instead of keeping it.
        if (workflowCompletedRef?.current) {
          await adapterRef.current.remove(storageKey);
          persistenceStateRef.current.lastSavedState = undefined;
          persistenceStateRef.current.hasPendingChanges = false;
          return;
        }

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
    [workflowId, storageKey, clearError, handleError, workflowCompletedRef]
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
        log.debug('[WorkflowPersistence] Auto-save failed:', error);
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
        // A reorder rewrites the order and NOTHING else, so without this a
        // moved row is never auto-saved — the very change the order mirror
        // exists to capture would be the one change persistence ignores.
        JSON.stringify(currentState.repeatableOrders) !==
          JSON.stringify(lastSavedState.repeatableOrders) ||
        currentState.visitedSteps.size !== lastSavedState.visitedSteps.size ||
        !Array.from(currentState.visitedSteps).every((step) =>
          lastSavedState.visitedSteps.has(step)
        )
      );
    },
    []
  );

  /**
   * Load persisted data
   */
  const loadPersistedData = useCallback(async (): Promise<PersistedWorkflowData | null> => {
    clearError();
    setIsLoadingPersisted(true);

    try {
      const data = await adapterRef.current.load(storageKey);
      if (data) {
        // Update tracking state
        persistenceStateRef.current.lastSavedState = {
          currentStepIndex: data.currentStepIndex,
          allData: data.allData,
          stepData: data.stepData,
          repeatableOrders: data.repeatableOrders,
          visitedSteps: new Set(data.visitedSteps),
          passedSteps: new Set(data.passedSteps || []),
          isSubmitting: false,
          isTransitioning: false,
          isInitializing: false,
        };
        persistenceStateRef.current.hasPendingChanges = false;
      }
      return data;
    } catch (error) {
      handleError(error as Error, 'Load');
      return null;
    } finally {
      // Clear loading flag after a short delay to avoid immediate auto-save
      setTimeout(() => setIsLoadingPersisted(false), 100);
    }
  }, [storageKey, clearError, handleError]);

  /**
   * Clear persisted data
   */
  const clearPersistedData = useCallback(async (): Promise<void> => {
    clearError();

    // Cancel any pending debounced save first: a save scheduled from the last
    // edit / navigation transition would otherwise fire after the remove below
    // and re-persist data we just cleared (resurrecting a completed workflow).
    debouncedSave.current.cancel();

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

  /**
   * Auto-persistence effect
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: workflowCompletedRef is a ref read for its current value, not an input that should retrigger the effect
  useEffect(() => {
    if (!optionsRef.current.autoPersist) return;

    // Once the workflow has completed, never schedule another save: completion
    // clears the persisted data, so a later auto-save would resurrect the
    // finished workflow on the next mount.
    if (workflowCompletedRef?.current) return;

    // Skip if currently persisting, loading, initializing, or in transition states
    if (
      isPersisting ||
      isLoadingPersisted ||
      workflowState.isInitializing ||
      workflowState.isSubmitting ||
      workflowState.isTransitioning
    ) {
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
  }, [workflowState, isPersisting, isLoadingPersisted, hasSignificantChanges]);

  /**
   * Manual save operation
   */
  const persistNow = useCallback(async (): Promise<void> => {
    await saveWorkflowState(workflowState);
  }, [saveWorkflowState, workflowState]);

  return {
    isPersisting,
    persistenceError,
    persistNow,
    loadPersistedData,
    clearPersistedData,
    hasPersistedData,
  };
}
