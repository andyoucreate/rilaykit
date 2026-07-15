import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkflowStoreContext,
  createWorkflowStore,
  useFlowData,
  useFlowStepIndex,
  useFlowSubmitting,
  useFlowTransitioning,
  usePassedSteps,
  useVisitedSteps,
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
    it('should land on the last requested step after 1000 navigations', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setCurrentStep(i % 10);
        }
      });

      // Last call was _setCurrentStep(999 % 10) === 9
      expect(store.getState().currentStepIndex).toBe(9);
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

      // Last iteration is i = 99: forward to min(9, 5) === 5, back to max(9 - 1, 0) === 8
      expect(store.getState().currentStepIndex).toBe(8);
    });
  });

  describe('Data Accumulation Stress', () => {
    it('should keep all 100 steps x 50 fields addressable and correct', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 100; i++) {
          const stepData: Record<string, unknown> = {};
          for (let j = 0; j < 50; j++) {
            stepData[`field${j}`] = `value-${i}-${j}`;
          }
          store.getState()._setStepData(stepData, `step${i}`);
        }
      });

      const { allData } = store.getState();
      expect(Object.keys(allData)).toHaveLength(100);

      // Every one of the 5000 cells is exactly where it was written
      for (let i = 0; i < 100; i++) {
        const step = allData[`step${i}`] as Record<string, unknown>;
        expect(Object.keys(step)).toHaveLength(50);
        for (let j = 0; j < 50; j++) {
          expect(step[`field${j}`]).toBe(`value-${i}-${j}`);
        }
      }
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

      act(() => {
        store.getState()._setStepData(complexData, 'step1');
      });

      const step1 = store.getState().allData.step1 as Record<string, unknown>;
      expect(Object.keys(step1)).toHaveLength(100);

      // Nested structures survive intact, down to the deepest leaf
      expect(step1.user99).toEqual({
        id: 99,
        name: 'User 99',
        preferences: {
          theme: 'dark',
          notifications: true,
          settings: { email: true, push: false, frequency: 'daily' },
        },
        roles: ['admin', 'user', 'moderator'],
      });
    });
  });

  describe('Visited/Passed Steps Management Stress', () => {
    it('should record all 1000 steps as visited, each exactly once', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._markStepVisited(`step${i}`);
        }
      });

      const { visitedSteps } = store.getState();
      expect(visitedSteps.size).toBe(1000);
      for (let i = 0; i < 1000; i++) {
        expect(visitedSteps.has(`step${i}`)).toBe(true);
      }
      expect(visitedSteps.has('step1000')).toBe(false);
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
    it('should propagate the final value to all 200 concurrent subscribers', () => {
      const { Wrapper, store } = createWrapper();
      const stepIndexHooks: ReturnType<typeof renderHook<number, unknown>>[] = [];
      const transitioningHooks: ReturnType<typeof renderHook<boolean, unknown>>[] = [];
      const submittingHooks: ReturnType<typeof renderHook<boolean, unknown>>[] = [];

      // Create many different subscriptions
      for (let i = 0; i < 50; i++) {
        stepIndexHooks.push(renderHook(() => useFlowStepIndex(), { wrapper: Wrapper }));
        renderHook(() => useFlowData(), { wrapper: Wrapper });
        transitioningHooks.push(renderHook(() => useFlowTransitioning(), { wrapper: Wrapper }));
        submittingHooks.push(renderHook(() => useFlowSubmitting(), { wrapper: Wrapper }));
      }

      // Trigger updates
      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._setCurrentStep(i % 5);
        }
      });

      // Every subscriber converged on the same final value (99 % 5 === 4),
      // and unrelated selectors were not disturbed by the step-index writes.
      expect(store.getState().currentStepIndex).toBe(4);
      for (const hook of stepIndexHooks) {
        expect(hook.result.current).toBe(4);
      }
      for (const hook of transitioningHooks) {
        expect(hook.result.current).toBe(false);
      }
      for (const hook of submittingHooks) {
        expect(hook.result.current).toBe(false);
      }

      // Cleanup
      for (const hook of [...stepIndexHooks, ...transitioningHooks, ...submittingHooks]) {
        hook.unmount();
      }
    });

    it('should handle rapid subscribe/unsubscribe', () => {
      const { Wrapper, store } = createWrapper();

      for (let i = 0; i < 500; i++) {
        const { unmount } = renderHook(() => useFlowStepIndex(), {
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

  describe('Selector Isolation', () => {
    it('useFlowStepIndex should track step changes without disturbing large allData', () => {
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

      const { result } = renderHook(() => useFlowStepIndex(), {
        wrapper: Wrapper,
      });

      const dataBefore = store.getState().allData;

      act(() => {
        store.getState()._setCurrentStep(50);
      });

      expect(result.current).toBe(50);

      // The 100 x 100 data grid is untouched by a step-index write
      expect(store.getState().allData).toBe(dataBefore);
      expect(Object.keys(store.getState().allData)).toHaveLength(100);
      expect((store.getState().allData.step99 as Record<string, unknown>).field99).toBe(
        'value-99-99'
      );
    });
  });

  describe('Field Value Updates', () => {
    it('should apply 10,000 field updates with the last write winning per field', () => {
      const { store } = createWrapper();

      act(() => {
        for (let i = 0; i < 10000; i++) {
          store.getState()._setFieldValue(`field${i % 100}`, i, 'step1');
        }
      });

      // field{k} was last written at i === 9900 + k
      const expected: Record<string, number> = {};
      for (let k = 0; k < 100; k++) {
        expected[`field${k}`] = 9900 + k;
      }
      expect(store.getState().allData.step1).toEqual(expected);
    });

    it('should handle updating multiple fields across multiple steps', () => {
      const { store } = createWrapper();

      act(() => {
        for (let step = 0; step < 10; step++) {
          for (let field = 0; field < 50; field++) {
            store
              .getState()
              ._setFieldValue(`field${field}`, `step${step}-value${field}`, `step${step}`);
          }
        }
      });

      expect(Object.keys(store.getState().allData).length).toBe(10);
      expect(Object.keys(store.getState().allData.step0 as Record<string, unknown>).length).toBe(
        50
      );
    });
  });

  describe('Persisted State Loading', () => {
    it('should handle loading large persisted state', () => {
      const { store } = createWrapper();

      const largePersistedState: Partial<
        typeof store extends { getState: () => infer S } ? S : never
      > = {
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

      act(() => {
        store.getState()._loadPersistedState(largePersistedState);
      });

      // The whole persisted payload is restored, not just its shape
      const state = store.getState();
      expect(state.currentStepIndex).toBe(5);
      expect(Object.keys(state.allData)).toHaveLength(50);

      for (let i = 0; i < 50; i++) {
        const step = state.allData[`step${i}`] as Record<string, unknown>;
        expect(Object.keys(step)).toHaveLength(20);
        for (let j = 0; j < 20; j++) {
          expect(step[`field${j}`]).toBe(`value-${i}-${j}`);
        }
      }

      expect(state.visitedSteps.size).toBe(30);
      expect(state.passedSteps.size).toBe(25);
      expect(state.visitedSteps.has('step29')).toBe(true);
      expect(state.visitedSteps.has('step30')).toBe(false);
      expect(state.passedSteps.has('step24')).toBe(true);
      expect(state.passedSteps.has('step25')).toBe(false);
    });
  });
});
