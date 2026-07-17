/**
 * @fileoverview Regression tests for the save/completion race in usePersistence.
 *
 * An auto-save (or manual save) already in flight when the workflow completes
 * must not resurrect the completed workflow in storage: completion clears the
 * persisted data, and a save that settles after that clear would write the
 * finished state right back.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePersistence } from '../../src/hooks/usePersistence';
import type { WorkflowState } from '../../src/hooks/workflow-state';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';

/**
 * Real in-memory adapter whose `save` can be held mid-flight and released
 * on demand, making the race deterministic.
 */
class HoldableAdapter implements WorkflowPersistenceAdapter {
  readonly store = new Map<string, PersistedWorkflowData>();

  private releaseHeld: (() => void) | null = null;
  private holdNext = false;

  holdNextSave(): void {
    this.holdNext = true;
  }

  releaseHeldSave(): void {
    const release = this.releaseHeld;
    this.releaseHeld = null;
    release?.();
  }

  async save(key: string, data: PersistedWorkflowData): Promise<void> {
    if (this.holdNext) {
      this.holdNext = false;
      await new Promise<void>((resolve) => {
        this.releaseHeld = resolve;
      });
    }
    this.store.set(key, data);
  }

  async load(key: string): Promise<PersistedWorkflowData | null> {
    return this.store.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

const WORKFLOW_ID = 'race-workflow';
// generateStorageKey(workflowId) with no userId is the workflowId itself.
const STORAGE_KEY = WORKFLOW_ID;

function createWorkflowState(): WorkflowState {
  return {
    currentStepIndex: 1,
    allData: { step1: { name: 'John' } },
    stepData: { email: 'john@test.com' },
    visitedSteps: new Set(['step1']),
    passedSteps: new Set([]),
    skippedSteps: new Set<string>(),
    isSubmitting: false,
    isTransitioning: false,
    isInitializing: false,
  };
}

describe('usePersistence completion race', () => {
  it('does not resurrect a completed workflow when an in-flight save settles after the clear', async () => {
    const adapter = new HoldableAdapter();
    const workflowCompletedRef = { current: false };

    const { result } = renderHook(() =>
      usePersistence({
        workflowId: WORKFLOW_ID,
        workflowState: createWorkflowState(),
        adapter,
        workflowCompletedRef,
      })
    );

    // 1. A save starts and is held mid-flight (before the write lands).
    adapter.holdNextSave();
    let savePromise: Promise<void> = Promise.resolve();
    act(() => {
      savePromise = result.current.persistNow();
    });

    // 2. The workflow completes: the completed flag flips, then persisted
    //    data is cleared (mirrors the useWorkflowSubmission completion path).
    workflowCompletedRef.current = true;
    await act(async () => {
      await result.current.clearPersistedData();
    });
    expect(adapter.store.has(STORAGE_KEY)).toBe(false);

    // 3. The held save is released and settles AFTER the clear.
    adapter.releaseHeldSave();
    await act(async () => {
      await savePromise;
    });

    // The completed workflow must NOT be back in storage.
    expect(adapter.store.has(STORAGE_KEY)).toBe(false);
  });

  it('still persists a normal in-flight save that is not followed by completion', async () => {
    const adapter = new HoldableAdapter();
    const workflowCompletedRef = { current: false };

    const { result } = renderHook(() =>
      usePersistence({
        workflowId: WORKFLOW_ID,
        workflowState: createWorkflowState(),
        adapter,
        workflowCompletedRef,
      })
    );

    adapter.holdNextSave();
    let savePromise: Promise<void> = Promise.resolve();
    act(() => {
      savePromise = result.current.persistNow();
    });

    adapter.releaseHeldSave();
    await act(async () => {
      await savePromise;
    });

    expect(adapter.store.has(STORAGE_KEY)).toBe(true);
    const persisted = adapter.store.get(STORAGE_KEY);
    expect(persisted?.workflowId).toBe(WORKFLOW_ID);
    expect(persisted?.currentStepIndex).toBe(1);
  });

  it('skips the write entirely when the workflow completed before the save reached the adapter', async () => {
    const adapter = new HoldableAdapter();
    const workflowCompletedRef = { current: true };

    const { result } = renderHook(() =>
      usePersistence({
        workflowId: WORKFLOW_ID,
        workflowState: createWorkflowState(),
        adapter,
        workflowCompletedRef,
      })
    );

    await act(async () => {
      await result.current.persistNow();
    });

    expect(adapter.store.has(STORAGE_KEY)).toBe(false);
  });
});
