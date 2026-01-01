import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createWorkflowStore,
  WorkflowStoreContext,
  useCurrentStepIndex,
  useWorkflowAllData,
  useWorkflowSubmitting,
  useWorkflowTransitioning,
  useVisitedSteps,
  usePassedSteps,
} from '../../src/stores/workflowStore';

function createWrapper() {
  const store = createWorkflowStore();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <WorkflowStoreContext.Provider value={store}>{children}</WorkflowStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('WorkflowStore Stress Tests', () => {
  describe('Navigation Stress', () => {
    it('should handle rapid forward navigation', () => {
      const { store } = createWrapper();
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setCurrentStep(i % 10);
        }
      });

      const duration = performance.now() - start;
      expect(store.getState().currentStepIndex).toBe(9);
      expect(duration).toBeLessThan(500);
      console.log(`1000 step navigations in ${duration.toFixed(2)}ms`);
    });

    it('should handle back-and-forth navigation', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 100; i++) {
          // Go forward
          store.getState()._setCurrentStep(Math.min(i % 10, 5));
          // Go back
          store.getState()._setCurrentStep(Math.max((i % 10) - 1, 0));
        }
      });

      // Should be at a valid step
      expect(store.getState().currentStepIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Accumulation Stress', () => {
    it('should handle large amounts of step data', () => {
      const { store } = createWrapper();
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 100; i++) {
          const stepData: Record<string, unknown> = {};
          for (let j = 0; j < 50; j++) {
            stepData[`field${j}`] = `value-${i}-${j}`;
          }
          store.getState()._setStepData(stepData, `step${i}`);
        }
      });

      const duration = performance.now() - start;
      expect(Object.keys(store.getState().allData).length).toBe(100);
      expect(duration).toBeLessThan(500);
      console.log(`100 steps with 50 fields each in ${duration.toFixed(2)}ms`);
    });

    it('should handle repeated data overwrites', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setStepData({ field: `iteration-${i}` }, 'step1');
        }
      });

      expect(store.getState().allData.step1).toEqual({ field: 'iteration-999' });
    });

    it('should handle complex nested data structures', () => {
      const { store } = createWrapper();
      const complexData: Record<string, unknown> = {};

      for (let i = 0; i < 100; i++) {
        complexData[`user${i}`] = {
          id: i,
          name: `User ${i}`,
          preferences: {
            theme: 'dark',
            notifications: true,
            settings: {
              email: true,
              push: false,
              frequency: 'daily',
            },
          },
          roles: ['admin', 'user', 'moderator'],
        };
      }

      const start = performance.now();

      act(() => {
        store.getState()._setStepData(complexData, 'step1');
      });

      const duration = performance.now() - start;
      expect(Object.keys(store.getState().allData.step1 as Record<string, unknown>).length).toBe(
        100
      );
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Visited/Passed Steps Management Stress', () => {
    it('should handle marking many steps as visited', () => {
      const { store } = createWrapper();
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._markStepVisited(`step${i}`);
        }
      });

      const duration = performance.now() - start;
      expect(store.getState().visitedSteps.size).toBe(1000);
      expect(duration).toBeLessThan(500);
      console.log(`1000 steps marked visited in ${duration.toFixed(2)}ms`);
    });

    it('should handle marking same step visited multiple times', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._markStepVisited('step1');
        }
      });

      // Should only have one entry (Set behavior)
      expect(store.getState().visitedSteps.size).toBe(1);
      expect(store.getState().visitedSteps.has('step1')).toBe(true);
    });

    it('should handle rapid passed step toggling', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._markStepPassed(`step${i % 10}`);
        }
      });

      // Should have 10 passed steps
      expect(store.getState().passedSteps.size).toBe(10);
    });
  });

  describe('Transitioning State Stress', () => {
    it('should handle rapid transitioning toggles', () => {
      const { store } = createWrapper();
      const states: boolean[] = [];

      const unsubscribe = store.subscribe(
        (state) => state.isTransitioning,
        (isTransitioning) => states.push(isTransitioning)
      );

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setTransitioning(i % 2 === 0);
        }
      });

      unsubscribe();
      expect(states.length).toBeGreaterThan(0);
    });

    it('should handle concurrent state changes during transition', () => {
      const { store } = createWrapper();

      act(() => {
        store.getState()._setTransitioning(true);

        // Simulate navigation during transition
        for (let i = 0; i < 50; i++) {
          store.getState()._setCurrentStep(i);
          store.getState()._setStepData({ data: i }, `step${i}`);
        }

        store.getState()._setTransitioning(false);
      });

      expect(store.getState().isTransitioning).toBe(false);
      expect(store.getState().currentStepIndex).toBe(49);
    });
  });

  describe('Subscription Stress', () => {
    it('should handle many concurrent subscribers', () => {
      const { Wrapper, store } = createWrapper();
      const hooks: ReturnType<typeof renderHook>[] = [];

      // Create many different subscriptions
      for (let i = 0; i < 50; i++) {
        hooks.push(renderHook(() => useCurrentStepIndex(), { wrapper: Wrapper }));
        hooks.push(renderHook(() => useWorkflowAllData(), { wrapper: Wrapper }));
        hooks.push(renderHook(() => useWorkflowTransitioning(), { wrapper: Wrapper }));
        hooks.push(renderHook(() => useWorkflowSubmitting(), { wrapper: Wrapper }));
      }

      const start = performance.now();

      // Trigger updates
      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._setCurrentStep(i % 5);
        }
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
      console.log(`200 subscribers with 100 updates: ${duration.toFixed(2)}ms`);

      // Cleanup
      for (const hook of hooks) {
        hook.unmount();
      }
    });

    it('should handle rapid subscribe/unsubscribe', () => {
      const { Wrapper, store } = createWrapper();

      for (let i = 0; i < 500; i++) {
        const { unmount } = renderHook(() => useCurrentStepIndex(), {
          wrapper: Wrapper,
        });
        unmount();
      }

      // Store should still be functional
      act(() => {
        store.getState()._setCurrentStep(5);
      });
      expect(store.getState().currentStepIndex).toBe(5);
    });
  });

  describe('Reset Stress', () => {
    it('should handle rapid reset cycles', () => {
      const { store } = createWrapper();

      for (let cycle = 0; cycle < 100; cycle++) {
        act(() => {
          // Build up state
          store.getState()._setCurrentStep(5);
          store.getState()._setStepData({ field: 'value' }, 'step1');
          store.getState()._markStepVisited('step1');
          store.getState()._markStepPassed('step1');
          store.getState()._setTransitioning(true);
          store.getState()._setSubmitting(true);
        });

        act(() => {
          // Reset
          store.getState()._reset();
        });

        expect(store.getState().currentStepIndex).toBe(0);
        expect(store.getState().stepData).toEqual({});
        expect(store.getState().visitedSteps.size).toBe(0);
        expect(store.getState().passedSteps.size).toBe(0);
        expect(store.getState().isTransitioning).toBe(false);
        expect(store.getState().isSubmitting).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it('should not throw on negative step index', () => {
      const { store } = createWrapper();

      expect(() => {
        act(() => {
          store.getState()._setCurrentStep(-1);
        });
      }).not.toThrow();

      // Behavior: store accepts negative index (validation is consumer's responsibility)
      expect(store.getState().currentStepIndex).toBe(-1);
    });

    it('should handle extremely large step indices', () => {
      const { store } = createWrapper();

      act(() => {
        store.getState()._setCurrentStep(Number.MAX_SAFE_INTEGER);
      });

      expect(store.getState().currentStepIndex).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Selector Performance', () => {
    it('useCurrentStepIndex should be efficient with large allData', () => {
      const { Wrapper, store } = createWrapper();

      // Fill with lots of data
      act(() => {
        for (let i = 0; i < 100; i++) {
          const stepData: Record<string, unknown> = {};
          for (let j = 0; j < 100; j++) {
            stepData[`field${j}`] = `value-${i}-${j}`;
          }
          store.getState()._setStepData(stepData, `step${i}`);
        }
      });

      const { result } = renderHook(() => useCurrentStepIndex(), {
        wrapper: Wrapper,
      });

      const start = performance.now();
      act(() => {
        store.getState()._setCurrentStep(50);
      });
      const duration = performance.now() - start;

      expect(result.current).toBe(50);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Field Value Updates', () => {
    it('should handle rapid field value updates', () => {
      const { store } = createWrapper();
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 10000; i++) {
          store.getState()._setFieldValue(`field${i % 100}`, i, 'step1');
        }
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
      console.log(`10,000 field updates in ${duration.toFixed(2)}ms`);
    });

    it('should handle updating multiple fields across multiple steps', () => {
      const { store } = createWrapper();

      act(() => {
        for (let step = 0; step < 10; step++) {
          for (let field = 0; field < 50; field++) {
            store.getState()._setFieldValue(`field${field}`, `step${step}-value${field}`, `step${step}`);
          }
        }
      });

      expect(Object.keys(store.getState().allData).length).toBe(10);
      expect(Object.keys(store.getState().allData.step0 as Record<string, unknown>).length).toBe(50);
    });
  });

  describe('Persisted State Loading', () => {
    it('should handle loading large persisted state', () => {
      const { store } = createWrapper();

      const largePersistedState: Partial<typeof store extends { getState: () => infer S } ? S : never> = {
        currentStepIndex: 5,
        allData: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [
            `step${i}`,
            Object.fromEntries(
              Array.from({ length: 20 }, (_, j) => [`field${j}`, `value-${i}-${j}`])
            ),
          ])
        ),
        visitedSteps: new Set(Array.from({ length: 30 }, (_, i) => `step${i}`)),
        passedSteps: new Set(Array.from({ length: 25 }, (_, i) => `step${i}`)),
      };

      const start = performance.now();

      act(() => {
        store.getState()._loadPersistedState(largePersistedState);
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
      expect(store.getState().currentStepIndex).toBe(5);
      expect(Object.keys(store.getState().allData).length).toBe(50);
      console.log(`Large state loaded in ${duration.toFixed(2)}ms`);
    });
  });
});
