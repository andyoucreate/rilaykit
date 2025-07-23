/**
 * @fileoverview Tests for usePersistence hook
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistence } from '../../src/hooks/usePersistence';
import type { WorkflowState } from '../../src/hooks/useWorkflowState';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';

// Mock adapter
class MockAdapter implements WorkflowPersistenceAdapter {
  private storage = new Map<string, PersistedWorkflowData>();
  private shouldFail = false;

  save = vi.fn(async (key: string, data: PersistedWorkflowData) => {
    if (this.shouldFail) {
      throw new Error('Save failed');
    }
    this.storage.set(key, data);
  });

  load = vi.fn(async (key: string) => {
    if (this.shouldFail) {
      throw new Error('Load failed');
    }
    return this.storage.get(key) || null;
  });

  remove = vi.fn(async (key: string) => {
    if (this.shouldFail) {
      throw new Error('Remove failed');
    }
    this.storage.delete(key);
  });

  exists = vi.fn(async (key: string) => {
    if (this.shouldFail) {
      throw new Error('Exists failed');
    }
    return this.storage.has(key);
  });

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  getStorage() {
    return this.storage;
  }
}

describe('usePersistence', () => {
  let mockAdapter: MockAdapter;
  let mockWorkflowState: WorkflowState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = new MockAdapter();
    mockWorkflowState = {
      currentStepIndex: 1,
      allData: { step1: { name: 'John' } },
      stepData: { email: 'john@test.com' },
      visitedSteps: new Set(['step1']),
      isSubmitting: false,
      isTransitioning: false,
    };
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      expect(result.current.isPersisting).toBe(false);
      expect(result.current.persistenceError).toBeNull();
    });

    it('should initialize with custom options', () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
          options: {
            autoPersist: true,
            debounceMs: 1000,
            storageKey: 'custom-key',
            metadata: { version: '1.0' },
          },
          userId: 'user123',
        })
      );

      expect(result.current.isPersisting).toBe(false);
      expect(result.current.persistenceError).toBeNull();
    });
  });

  describe('manual persistence operations', () => {
    it('should persist workflow state manually', async () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      await act(async () => {
        await result.current.persistNow();
      });

      expect(mockAdapter.save).toHaveBeenCalledWith(
        'test-workflow',
        expect.objectContaining({
          workflowId: 'test-workflow',
          currentStepIndex: 1,
          allData: { step1: { name: 'John' } },
          stepData: { email: 'john@test.com' },
          visitedSteps: ['step1'],
        })
      );
    });

    it('should load persisted data', async () => {
      const persistedData: PersistedWorkflowData = {
        workflowId: 'test-workflow',
        currentStepIndex: 2,
        allData: { step1: { name: 'Jane' } },
        stepData: { age: 30 },
        visitedSteps: ['step1', 'step2'],
        lastSaved: Date.now(),
      };

      mockAdapter.getStorage().set('test-workflow', persistedData);

      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      let loadedData: PersistedWorkflowData | null = null;
      await act(async () => {
        loadedData = await result.current.loadPersistedData();
      });

      expect(loadedData).toEqual(persistedData);
      expect(mockAdapter.load).toHaveBeenCalledWith('test-workflow');
    });

    it('should clear persisted data', async () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      await act(async () => {
        await result.current.clearPersistedData();
      });

      expect(mockAdapter.remove).toHaveBeenCalledWith('test-workflow');
    });

    it('should check if data exists', async () => {
      mockAdapter.getStorage().set('test-workflow', {} as PersistedWorkflowData);

      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      let exists = false;
      await act(async () => {
        exists = await result.current.hasPersistedData();
      });

      expect(exists).toBe(true);
      expect(mockAdapter.exists).toHaveBeenCalledWith('test-workflow');
    });
  });

  describe('auto-persistence', () => {
    it('should auto-persist when enabled and state changes', async () => {
      const { rerender } = renderHook(
        ({ workflowState }) =>
          usePersistence({
            workflowId: 'test-workflow',
            workflowState,
            adapter: mockAdapter,
            options: { autoPersist: true, debounceMs: 50 },
          }),
        { initialProps: { workflowState: mockWorkflowState } }
      );

      // Change workflow state
      const newState = {
        ...mockWorkflowState,
        currentStepIndex: 2,
      };

      rerender({ workflowState: newState });

      // Wait for debounced save
      await waitFor(
        () => {
          expect(mockAdapter.save).toHaveBeenCalled();
        },
        { timeout: 200 }
      );
    });

    it('should not auto-persist when disabled', async () => {
      const { rerender } = renderHook(
        ({ workflowState }) =>
          usePersistence({
            workflowId: 'test-workflow',
            workflowState,
            adapter: mockAdapter,
            options: { autoPersist: false },
          }),
        { initialProps: { workflowState: mockWorkflowState } }
      );

      // Change workflow state
      const newState = {
        ...mockWorkflowState,
        currentStepIndex: 2,
      };

      rerender({ workflowState: newState });

      // Wait a bit to ensure no save occurs
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAdapter.save).not.toHaveBeenCalled();
    });

    it('should not persist during submitting state', async () => {
      const { rerender } = renderHook(
        ({ workflowState }) =>
          usePersistence({
            workflowId: 'test-workflow',
            workflowState,
            adapter: mockAdapter,
            options: { autoPersist: true, debounceMs: 50 },
          }),
        {
          initialProps: {
            workflowState: { ...mockWorkflowState, isSubmitting: true },
          },
        }
      );

      // Change workflow state while submitting
      const newState = {
        ...mockWorkflowState,
        currentStepIndex: 2,
        isSubmitting: true,
      };

      rerender({ workflowState: newState });

      // Wait a bit to ensure no save occurs
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAdapter.save).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle save errors', async () => {
      mockAdapter.setShouldFail(true);

      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      await act(async () => {
        try {
          await result.current.persistNow();
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.persistenceError).toBeInstanceOf(Error);
      expect(result.current.isPersisting).toBe(false);
    });

    it('should handle load errors', async () => {
      mockAdapter.setShouldFail(true);

      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      let loadedData: PersistedWorkflowData | null = 'not-null' as any;
      await act(async () => {
        loadedData = await result.current.loadPersistedData();
      });

      expect(loadedData).toBeNull();
      expect(result.current.persistenceError).toBeInstanceOf(Error);
    });

    it('should clear errors on successful operations', async () => {
      mockAdapter.setShouldFail(true);

      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      // Cause an error
      await act(async () => {
        try {
          await result.current.persistNow();
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.persistenceError).not.toBeNull();

      // Fix the adapter and try again
      mockAdapter.setShouldFail(false);

      await act(async () => {
        await result.current.persistNow();
      });

      expect(result.current.persistenceError).toBeNull();
    });
  });

  describe('storage key generation', () => {
    it('should use workflowId as default key', async () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
        })
      );

      await act(async () => {
        await result.current.persistNow();
      });

      expect(mockAdapter.save).toHaveBeenCalledWith('test-workflow', expect.any(Object));
    });

    it('should use custom storage key when provided', async () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
          options: { storageKey: 'custom-key' },
        })
      );

      await act(async () => {
        await result.current.persistNow();
      });

      expect(mockAdapter.save).toHaveBeenCalledWith('custom-key', expect.any(Object));
    });

    it('should include userId in storage key when provided', async () => {
      const { result } = renderHook(() =>
        usePersistence({
          workflowId: 'test-workflow',
          workflowState: mockWorkflowState,
          adapter: mockAdapter,
          userId: 'user123',
        })
      );

      await act(async () => {
        await result.current.persistNow();
      });

      expect(mockAdapter.save).toHaveBeenCalledWith('user123:test-workflow', expect.any(Object));
    });
  });
});
