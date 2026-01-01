import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createFormStore,
  FormStoreContext,
  useFieldValue,
  useFormValues,
} from '../../src/stores/formStore';

function createWrapper(initialValues: Record<string, unknown> = {}) {
  const store = createFormStore(initialValues);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormStoreContext.Provider value={store}>{children}</FormStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('FormStore Stress Tests', () => {
  describe('High Volume Operations', () => {
    it('should handle 10,000 value updates efficiently', () => {
      const { store } = createWrapper({});
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 10_000; i++) {
          store.getState()._setValue('field', i);
        }
      });

      const duration = performance.now() - start;
      expect(store.getState().values.field).toBe(9999);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      console.log(`10,000 updates completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle 1,000 different fields efficiently', () => {
      const { store } = createWrapper({});
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setValue(`field${i}`, `value${i}`);
        }
      });

      const duration = performance.now() - start;
      expect(Object.keys(store.getState().values).length).toBe(1000);
      expect(duration).toBeLessThan(500);
      console.log(`1,000 fields created in ${duration.toFixed(2)}ms`);
    });

    it('should handle rapid touch/untouch cycles', () => {
      const { store } = createWrapper({});
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 5000; i++) {
          store.getState()._setTouched('field');
        }
      });

      const duration = performance.now() - start;
      expect(store.getState().touched.field).toBe(true);
      expect(duration).toBeLessThan(500);
      console.log(`5,000 touch operations in ${duration.toFixed(2)}ms`);
    });

    it('should handle rapid error set/clear cycles', () => {
      const { store } = createWrapper({});
      const start = performance.now();

      act(() => {
        for (let i = 0; i < 5000; i++) {
          if (i % 2 === 0) {
            store.getState()._setErrors('field', [{ message: `Error ${i}` }]);
          } else {
            store.getState()._clearErrors('field');
          }
        }
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
      console.log(`5,000 error operations in ${duration.toFixed(2)}ms`);
    });

    it('should handle 100 subscribers efficiently', () => {
      const { Wrapper, store } = createWrapper({});
      const results: ReturnType<typeof renderHook>[] = [];

      const start = performance.now();

      // Create 100 subscribers
      for (let i = 0; i < 100; i++) {
        const hookResult = renderHook(() => useFieldValue(`field${i}`), {
          wrapper: Wrapper,
        });
        results.push(hookResult);
      }

      const setupDuration = performance.now() - start;
      console.log(`100 hooks setup in ${setupDuration.toFixed(2)}ms`);

      // Update all values
      const updateStart = performance.now();
      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._setValue(`field${i}`, `value${i}`);
        }
      });

      const updateDuration = performance.now() - updateStart;
      console.log(`100 values updated in ${updateDuration.toFixed(2)}ms`);

      expect(updateDuration).toBeLessThan(200);

      // Cleanup
      for (const result of results) {
        result.unmount();
      }
    });
  });

  describe('Memory Pressure', () => {
    it('should not leak memory with repeated reset cycles', () => {
      const { store } = createWrapper({});

      // Simulate many form reset cycles
      for (let cycle = 0; cycle < 100; cycle++) {
        act(() => {
          for (let i = 0; i < 50; i++) {
            store.getState()._setValue(`field${i}`, `value${i}`);
            store.getState()._setTouched(`field${i}`);
            store.getState()._setErrors(`field${i}`, [{ message: 'Error' }]);
          }
        });

        act(() => {
          store.getState()._reset();
        });

        expect(Object.keys(store.getState().values).length).toBe(0);
        expect(Object.keys(store.getState().touched).length).toBe(0);
        expect(Object.keys(store.getState().errors).length).toBe(0);
      }
    });

    it('should handle large values efficiently', () => {
      const { store } = createWrapper({});
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        data: { nested: { deep: { value: i * 2 } } },
      }));

      const start = performance.now();

      act(() => {
        store.getState()._setValue('largeField', largeArray);
      });

      const duration = performance.now() - start;
      expect(store.getState().values.largeField).toBe(largeArray);
      expect(duration).toBeLessThan(100);
      console.log(`Large array (10k items) stored in ${duration.toFixed(2)}ms`);
    });

    it('should handle deeply nested updates', () => {
      const { store } = createWrapper({});
      const depth = 100;

      // Create deeply nested object
      let nested: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < depth; i++) {
        nested = { level: nested };
      }

      const start = performance.now();

      act(() => {
        store.getState()._setValue('deepField', nested);
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
      console.log(`100-level nested object stored in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Subscription Stress', () => {
    it('should handle mount/unmount thrashing', () => {
      const { Wrapper, store } = createWrapper({ field: 'value' });
      const errors: Error[] = [];

      // Rapidly mount/unmount subscribers
      for (let i = 0; i < 500; i++) {
        try {
          const { unmount } = renderHook(() => useFieldValue('field'), {
            wrapper: Wrapper,
          });
          unmount();
        } catch (e) {
          errors.push(e as Error);
        }
      }

      expect(errors.length).toBe(0);
      expect(store.getState().values.field).toBe('value');
    });

    it('should handle interleaved subscribe/update operations', () => {
      const { Wrapper, store } = createWrapper({});
      const hooks: ReturnType<typeof renderHook>[] = [];

      for (let i = 0; i < 50; i++) {
        // Add subscriber
        hooks.push(
          renderHook(() => useFieldValue(`field${i}`), {
            wrapper: Wrapper,
          })
        );

        // Update some values
        act(() => {
          for (let j = 0; j <= i; j++) {
            store.getState()._setValue(`field${j}`, j);
          }
        });
      }

      // Verify all values are correct
      for (let i = 0; i < 50; i++) {
        expect(store.getState().values[`field${i}`]).toBe(i);
      }

      // Cleanup
      for (const hook of hooks) {
        hook.unmount();
      }
    });
  });

  describe('Validation State Stress', () => {
    it('should handle rapid isValid changes', () => {
      const { store } = createWrapper({});
      const validStates: boolean[] = [];

      const unsubscribe = store.subscribe(
        (state) => state.isValid,
        (isValid) => validStates.push(isValid)
      );

      act(() => {
        for (let i = 0; i < 100; i++) {
          if (i % 2 === 0) {
            store.getState()._setErrors('field', [{ message: 'Error' }]);
          } else {
            store.getState()._clearErrors('field');
          }
        }
      });

      unsubscribe();

      // Should have recorded alternating valid states
      expect(validStates.length).toBeGreaterThan(0);
    });

    it('should handle validation on many fields simultaneously', () => {
      const { store } = createWrapper({});

      const start = performance.now();

      act(() => {
        for (let i = 0; i < 500; i++) {
          store.getState()._setValidationState(`field${i}`, 'validating');
        }
      });

      act(() => {
        for (let i = 0; i < 500; i++) {
          if (i % 3 === 0) {
            store.getState()._setValidationState(`field${i}`, 'invalid');
            store.getState()._setErrors(`field${i}`, [{ message: 'Error' }]);
          } else {
            store.getState()._setValidationState(`field${i}`, 'valid');
          }
        }
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);

      // Form should be invalid (some fields have errors)
      expect(store.getState().isValid).toBe(false);

      console.log(`500 field validations in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Edge Case Combinations', () => {
    it('should handle all operations in rapid succession', () => {
      const { store } = createWrapper({});
      const operations = 1000;

      const start = performance.now();

      act(() => {
        for (let i = 0; i < operations; i++) {
          const fieldId = `field${i % 10}`;
          const op = i % 6;

          switch (op) {
            case 0:
              store.getState()._setValue(fieldId, i);
              break;
            case 1:
              store.getState()._setTouched(fieldId);
              break;
            case 2:
              store.getState()._setErrors(fieldId, [{ message: `Error ${i}` }]);
              break;
            case 3:
              store.getState()._clearErrors(fieldId);
              break;
            case 4:
              store.getState()._setValidationState(fieldId, 'validating');
              break;
            case 5:
              store.getState()._setValidationState(fieldId, 'valid');
              break;
          }
        }
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
      console.log(`${operations} mixed operations in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Selector Performance', () => {
    it('should not degrade with many inactive fields', () => {
      const { Wrapper, store } = createWrapper({});

      // Create many fields
      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setValue(`field${i}`, `value${i}`);
        }
      });

      // Subscribe to just one field
      const { result } = renderHook(() => useFieldValue('field500'), {
        wrapper: Wrapper,
      });

      expect(result.current).toBe('value500');

      // Measure update performance
      const start = performance.now();
      act(() => {
        store.getState()._setValue('field500', 'updated');
      });
      const duration = performance.now() - start;

      expect(result.current).toBe('updated');
      expect(duration).toBeLessThan(50);
      console.log(`Single field update with 1000 fields: ${duration.toFixed(2)}ms`);
    });
  });
});

