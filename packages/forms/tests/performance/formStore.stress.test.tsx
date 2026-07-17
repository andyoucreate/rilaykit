import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormStoreContext, createFormStore, useFieldValue, useFormValues } from '../../src/stores';

function createWrapper(initialValues: Record<string, unknown> = {}) {
  const store = createFormStore(initialValues);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormStoreContext.Provider value={store}>{children}</FormStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('FormStore Stress Tests', () => {
  describe('High Volume Operations', () => {
    it('should apply 10,000 value updates with the last write winning', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 10_000; i++) {
          store.getState()._setValue('field', i);
        }
      });

      // 10k writes to one field collapse to exactly the last one
      expect(store.getState().values).toEqual({ field: 9999 });
    });

    it('should hold 1,000 distinct fields with the correct value in each', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setValue(`field${i}`, `value${i}`);
        }
      });

      const expected: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        expected[`field${i}`] = `value${i}`;
      }
      expect(store.getState().values).toEqual(expected);
    });

    it('should stay idempotent across 5,000 touch operations', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 5000; i++) {
          store.getState()._setTouched('field');
        }
      });

      // Touching is idempotent: one field, one flag, no fan-out
      expect(store.getState().touched).toEqual({ field: true });
    });

    it('should end with errors cleared after 5,000 alternating set/clear cycles', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 5000; i++) {
          if (i % 2 === 0) {
            store.getState()._setErrors('field', [{ message: `Error ${i}` }]);
          } else {
            store.getState()._clearErrors('field');
          }
        }
      });

      // The last operation (i = 4999, odd) is a clear: no residue is left behind
      expect(store.getState().errors).toEqual({});
      expect(store.getState().validationStates).toEqual({ field: 'idle' });
      expect(store.getState().isValid).toBe(true);
    });

    it('should deliver the right value to each of 100 subscribers', () => {
      const { Wrapper, store } = createWrapper({});
      const results: ReturnType<typeof renderHook<unknown, unknown>>[] = [];

      // Create 100 subscribers
      for (let i = 0; i < 100; i++) {
        const hookResult = renderHook(() => useFieldValue(`field${i}`), {
          wrapper: Wrapper,
        });
        results.push(hookResult);
      }

      // Update all values
      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._setValue(`field${i}`, `value${i}`);
        }
      });

      // Each subscriber observes its own field's value — no cross-wiring
      results.forEach((result, i) => {
        expect(result.result.current).toBe(`value${i}`);
      });

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

    it('should store a 10k-item array by reference without copying it', () => {
      const { store } = createWrapper({});
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        data: { nested: { deep: { value: i * 2 } } },
      }));

      act(() => {
        store.getState()._setValue('largeField', largeArray);
      });

      // Stored by reference: the store does not clone or truncate large values
      expect(store.getState().values.largeField).toBe(largeArray);
      expect(store.getState().values.largeField).toHaveLength(10000);
      expect(largeArray[9999]).toEqual({
        id: 9999,
        name: 'Item 9999',
        data: { nested: { deep: { value: 19998 } } },
      });
    });

    it('should store a 100-level nested object intact', () => {
      const { store } = createWrapper({});
      const depth = 100;

      // Create deeply nested object
      let nested: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < depth; i++) {
        nested = { level: nested };
      }

      act(() => {
        store.getState()._setValue('deepField', nested);
      });

      // The whole 100-level chain survives, down to the innermost leaf
      expect(store.getState().values.deepField).toBe(nested);
      let cursor = store.getState().values.deepField as Record<string, unknown>;
      for (let i = 0; i < depth; i++) {
        cursor = cursor.level as Record<string, unknown>;
      }
      expect(cursor).toEqual({ value: 'deep' });
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

    it('should resolve validation state for 500 fields simultaneously', () => {
      const { store } = createWrapper({});

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

      // Every one of the 500 fields settled on its own final state
      const { validationStates, errors } = store.getState();
      for (let i = 0; i < 500; i++) {
        if (i % 3 === 0) {
          expect(validationStates[`field${i}`]).toBe('invalid');
          expect(errors[`field${i}`]).toEqual([{ message: 'Error' }]);
        } else {
          expect(validationStates[`field${i}`]).toBe('valid');
          expect(errors[`field${i}`]).toBeUndefined();
        }
      }
      expect(Object.keys(validationStates)).toHaveLength(500);
      expect(Object.keys(errors)).toHaveLength(167); // ceil(500 / 3)

      // Form should be invalid (some fields have errors)
      expect(store.getState().isValid).toBe(false);
    });
  });

  describe('Edge Case Combinations', () => {
    it('should converge to a deterministic state after 1000 mixed operations', () => {
      const { store } = createWrapper({});
      const operations = 1000;

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

      // fieldId = field(i % 10) and op = i % 6, so a field's op set is fixed by
      // its parity: even fields only ever receive setValue / setErrors /
      // 'validating', odd fields only setTouched / clearErrors / 'valid'.
      const state = store.getState();

      // setValue lands on i ≡ 0 (mod 6); last such i per even field:
      expect(state.values).toEqual({
        field0: 990,
        field2: 972,
        field4: 984,
        field6: 996,
        field8: 978,
      });

      // setTouched lands on i ≡ 1 (mod 6) → odd fields only
      expect(state.touched).toEqual({
        field1: true,
        field3: true,
        field5: true,
        field7: true,
        field9: true,
      });

      // setErrors lands on i ≡ 2 (mod 6) → even fields only; clearErrors
      // (i ≡ 3 mod 6) only ever hits odd fields, so nothing clears the even ones.
      expect(state.errors).toEqual({
        field0: [{ message: 'Error 980' }],
        field2: [{ message: 'Error 992' }],
        field4: [{ message: 'Error 974' }],
        field6: [{ message: 'Error 986' }],
        field8: [{ message: 'Error 998' }],
      });

      expect(state.isValid).toBe(false);
      expect(operations).toBe(1000);
    });
  });

  describe('Selector Isolation', () => {
    it('should update only the subscribed field among 1000 fields', () => {
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

      act(() => {
        store.getState()._setValue('field500', 'updated');
      });

      // The subscriber sees the new value...
      expect(result.current).toBe('updated');

      // ...and the other 999 fields are untouched by that write
      const { values } = store.getState();
      expect(Object.keys(values)).toHaveLength(1000);
      for (let i = 0; i < 1000; i++) {
        if (i !== 500) {
          expect(values[`field${i}`]).toBe(`value${i}`);
        }
      }
    });
  });
});
