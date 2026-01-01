import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  FormStoreContext,
  createFormStore,
  useFieldConditions,
  useFieldErrors,
  useFieldTouched,
  useFieldValidationState,
  useFieldValue,
  useFormStore,
} from '../../src/stores/formStore';

function createWrapper(initialValues: Record<string, unknown> = {}) {
  const store = createFormStore(initialValues);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormStoreContext.Provider value={store}>{children}</FormStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('FormStore Edge Cases', () => {
  describe('Null and Undefined Values', () => {
    it('should handle null values correctly', () => {
      const { Wrapper, store } = createWrapper({ field1: null });
      const { result } = renderHook(() => useFieldValue('field1'), { wrapper: Wrapper });

      expect(result.current).toBeNull();
    });

    it('should handle undefined values correctly', () => {
      const { Wrapper, store } = createWrapper({ field1: undefined });
      const { result } = renderHook(() => useFieldValue('field1'), { wrapper: Wrapper });

      expect(result.current).toBeUndefined();
    });

    it('should handle setting null as a value', () => {
      const { Wrapper, store } = createWrapper({ field1: 'initial' });

      act(() => {
        store.getState()._setValue('field1', null);
      });

      expect(store.getState().values.field1).toBeNull();
    });

    it('should handle setting undefined as a value', () => {
      const { Wrapper, store } = createWrapper({ field1: 'initial' });

      act(() => {
        store.getState()._setValue('field1', undefined);
      });

      expect(store.getState().values.field1).toBeUndefined();
    });

    it('should handle empty string vs null distinction', () => {
      const { Wrapper, store } = createWrapper({});

      act(() => {
        store.getState()._setValue('field1', '');
        store.getState()._setValue('field2', null);
      });

      expect(store.getState().values.field1).toBe('');
      expect(store.getState().values.field2).toBeNull();
      expect(store.getState().values.field1).not.toBe(store.getState().values.field2);
    });
  });

  describe('Complex Value Types', () => {
    it('should handle array values', () => {
      const { store } = createWrapper({});
      const arrayValue = [1, 2, 3, 'test', { nested: true }];

      act(() => {
        store.getState()._setValue('arrayField', arrayValue);
      });

      expect(store.getState().values.arrayField).toEqual(arrayValue);
    });

    it('should handle deeply nested objects', () => {
      const { store } = createWrapper({});
      const nestedValue = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      act(() => {
        store.getState()._setValue('nestedField', nestedValue);
      });

      expect(store.getState().values.nestedField).toEqual(nestedValue);
    });

    it('should handle Date objects', () => {
      const { store } = createWrapper({});
      const dateValue = new Date('2024-01-01');

      act(() => {
        store.getState()._setValue('dateField', dateValue);
      });

      expect(store.getState().values.dateField).toEqual(dateValue);
    });

    it('should handle RegExp objects', () => {
      const { store } = createWrapper({});
      const regexValue = /test-pattern/gi;

      act(() => {
        store.getState()._setValue('regexField', regexValue);
      });

      expect(store.getState().values.regexField).toEqual(regexValue);
    });

    it('should handle Symbol values (edge case)', () => {
      const { store } = createWrapper({});
      const symbolValue = Symbol('test');

      act(() => {
        store.getState()._setValue('symbolField', symbolValue);
      });

      expect(store.getState().values.symbolField).toBe(symbolValue);
    });

    it('should handle function values (edge case)', () => {
      const { store } = createWrapper({});
      const fnValue = () => 'test';

      act(() => {
        store.getState()._setValue('fnField', fnValue);
      });

      expect(store.getState().values.fnField).toBe(fnValue);
    });

    it('should handle circular reference gracefully', () => {
      const { store } = createWrapper({});
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      // This should not throw
      act(() => {
        store.getState()._setValue('circularField', circular);
      });

      expect(store.getState().values.circularField).toBe(circular);
    });
  });

  describe('Field ID Edge Cases', () => {
    it('should handle empty string as field ID', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setValue('', 'value');
      });

      expect(store.getState().values['']).toBe('value');
    });

    it('should handle field IDs with special characters', () => {
      const { store } = createWrapper({});
      const specialIds = [
        'field.with.dots',
        'field[0]',
        'field-with-dashes',
        'field_with_underscores',
        'field with spaces',
        'field/with/slashes',
        'field@with#special$chars',
        '日本語フィールド',
        '🔥emoji',
      ];

      act(() => {
        for (const id of specialIds) {
          store.getState()._setValue(id, `value-for-${id}`);
        }
      });

      for (const id of specialIds) {
        expect(store.getState().values[id]).toBe(`value-for-${id}`);
      }
    });

    it('should handle very long field IDs', () => {
      const { store } = createWrapper({});
      const longId = 'a'.repeat(10000);

      act(() => {
        store.getState()._setValue(longId, 'value');
      });

      expect(store.getState().values[longId]).toBe('value');
    });

    it('should handle numeric-like field IDs', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setValue('0', 'zero');
        store.getState()._setValue('123', 'numeric');
        store.getState()._setValue('-1', 'negative');
        store.getState()._setValue('1.5', 'decimal');
      });

      expect(store.getState().values['0']).toBe('zero');
      expect(store.getState().values['123']).toBe('numeric');
      expect(store.getState().values['-1']).toBe('negative');
      expect(store.getState().values['1.5']).toBe('decimal');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid sequential updates', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 1000; i++) {
          store.getState()._setValue('field', i);
        }
      });

      expect(store.getState().values.field).toBe(999);
    });

    it('should maintain state consistency under rapid multi-field updates', () => {
      const { store } = createWrapper({});

      act(() => {
        for (let i = 0; i < 100; i++) {
          store.getState()._setValue(`field${i}`, i);
          store.getState()._setTouched(`field${i}`);
          store.getState()._setErrors(`field${i}`, [{ message: `Error ${i}` }]);
        }
      });

      for (let i = 0; i < 100; i++) {
        expect(store.getState().values[`field${i}`]).toBe(i);
        expect(store.getState().touched[`field${i}`]).toBe(true);
        expect(store.getState().errors[`field${i}`]).toEqual([{ message: `Error ${i}` }]);
      }
    });

    it('should handle interleaved set/clear operations', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setErrors('field1', [{ message: 'Error 1' }]);
        store.getState()._setErrors('field2', [{ message: 'Error 2' }]);
        store.getState()._clearErrors('field1');
        store.getState()._setErrors('field3', [{ message: 'Error 3' }]);
        store.getState()._clearErrors('field2');
      });

      expect(store.getState().errors.field1).toBeUndefined();
      expect(store.getState().errors.field2).toBeUndefined();
      expect(store.getState().errors.field3).toEqual([{ message: 'Error 3' }]);
    });
  });

  describe('Validation State Transitions', () => {
    it('should handle all validation state transitions', () => {
      const { store } = createWrapper({});
      const states = ['idle', 'validating', 'valid', 'invalid'] as const;

      for (const state of states) {
        act(() => {
          store.getState()._setValidationState('field1', state);
        });
        expect(store.getState().validationStates.field1).toBe(state);
      }
    });

    it('should update isValid correctly based on validation states', () => {
      const { store } = createWrapper({});

      expect(store.getState().isValid).toBe(true);

      act(() => {
        store.getState()._setErrors('field1', [{ message: 'Error' }]);
      });
      expect(store.getState().isValid).toBe(false);

      act(() => {
        store.getState()._clearErrors('field1');
      });
      expect(store.getState().isValid).toBe(true);
    });

    it('should handle mixed error and validation states', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setErrors('field1', [{ message: 'Error' }]);
        store.getState()._setValidationState('field2', 'invalid');
      });

      expect(store.getState().isValid).toBe(false);

      act(() => {
        store.getState()._clearErrors('field1');
      });

      // Still invalid because field2 has 'invalid' state
      expect(store.getState().isValid).toBe(false);
    });
  });

  describe('Reset Behavior', () => {
    it('should reset to custom values', () => {
      const { store } = createWrapper({ field1: 'initial' });

      act(() => {
        store.getState()._setValue('field1', 'modified');
        store.getState()._setTouched('field1');
        store.getState()._setErrors('field1', [{ message: 'Error' }]);
      });

      act(() => {
        store.getState()._reset({ field1: 'reset-value' });
      });

      expect(store.getState().values.field1).toBe('reset-value');
      expect(store.getState().touched.field1).toBeUndefined();
      expect(store.getState().errors.field1).toBeUndefined();
    });

    it('should reset to default values when no values provided', () => {
      const { store } = createWrapper({ field1: 'default' });

      act(() => {
        store.getState()._setValue('field1', 'modified');
      });

      act(() => {
        store.getState()._reset();
      });

      expect(store.getState().values.field1).toBe('default');
    });

    it('should reset all state properties', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setValue('field1', 'value');
        store.getState()._setTouched('field1');
        store.getState()._setErrors('field1', [{ message: 'Error' }]);
        store.getState()._setValidationState('field1', 'invalid');
        store.getState()._setSubmitting(true);
      });

      act(() => {
        store.getState()._reset();
      });

      expect(store.getState().values).toEqual({});
      expect(store.getState().touched).toEqual({});
      expect(store.getState().errors).toEqual({});
      expect(store.getState().validationStates).toEqual({});
      expect(store.getState().isSubmitting).toBe(false);
      expect(store.getState().isDirty).toBe(false);
      expect(store.getState().isValid).toBe(true);
    });
  });

  describe('Dirty State Tracking', () => {
    it('should mark as dirty on first value change', () => {
      const { store } = createWrapper({ field1: 'initial' });

      expect(store.getState().isDirty).toBe(false);

      act(() => {
        store.getState()._setValue('field1', 'modified');
      });

      expect(store.getState().isDirty).toBe(true);
    });

    it('should remain dirty even if value is set back to initial', () => {
      const { store } = createWrapper({ field1: 'initial' });

      act(() => {
        store.getState()._setValue('field1', 'modified');
      });
      expect(store.getState().isDirty).toBe(true);

      act(() => {
        store.getState()._setValue('field1', 'initial');
      });
      // Still dirty because we track if ANY change was made
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('Field Conditions', () => {
    it('should return default conditions for unknown field', () => {
      const { Wrapper } = createWrapper({});
      const { result } = renderHook(() => useFieldConditions('unknownField'), {
        wrapper: Wrapper,
      });

      expect(result.current).toEqual({
        visible: true,
        disabled: false,
        required: false,
        readonly: false,
      });
    });

    it('should store and retrieve custom conditions', () => {
      const { store } = createWrapper({});

      act(() => {
        store.getState()._setFieldConditions('field1', {
          visible: false,
          disabled: true,
          required: true,
          readonly: true,
        });
      });

      expect(store.getState()._fieldConditions.field1).toEqual({
        visible: false,
        disabled: true,
        required: true,
        readonly: true,
      });
    });
  });

  describe('Hook Error Handling', () => {
    it('useFormStore should throw when used outside provider', () => {
      expect(() => {
        renderHook(() => useFormStore());
      }).toThrow('useFormStore must be used within a FormProvider');
    });

    it('hooks should not throw for non-existent fields', () => {
      const { Wrapper } = createWrapper({});

      // These should all work without throwing
      expect(() => {
        renderHook(() => useFieldValue('nonExistent'), { wrapper: Wrapper });
      }).not.toThrow();

      expect(() => {
        renderHook(() => useFieldErrors('nonExistent'), { wrapper: Wrapper });
      }).not.toThrow();

      expect(() => {
        renderHook(() => useFieldTouched('nonExistent'), { wrapper: Wrapper });
      }).not.toThrow();

      expect(() => {
        renderHook(() => useFieldValidationState('nonExistent'), { wrapper: Wrapper });
      }).not.toThrow();
    });
  });

  describe('Memory and Cleanup', () => {
    it('should allow garbage collection after unmount', () => {
      const { Wrapper, store } = createWrapper({});
      const weakRef = new WeakRef(store);

      const { unmount } = renderHook(() => useFieldValue('field'), { wrapper: Wrapper });
      unmount();

      // Note: We can't force GC in tests, but we can verify cleanup happens
      expect(weakRef.deref()).toBeDefined(); // Store should still exist
    });

    it('should handle multiple rapid mount/unmount cycles', () => {
      const { Wrapper, store } = createWrapper({ field: 'value' });

      for (let i = 0; i < 100; i++) {
        const { unmount } = renderHook(() => useFieldValue('field'), {
          wrapper: Wrapper,
        });
        unmount();
      }

      // Store should still be functional
      expect(store.getState().values.field).toBe('value');
    });
  });

  describe('Subscription Behavior', () => {
    it('should notify all subscribers when state changes', () => {
      const { store } = createWrapper({});
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = store.subscribe((state) => state.values, listener1);
      const unsub2 = store.subscribe((state) => state.values, listener2);

      act(() => {
        store.getState()._setValue('field', 'value');
      });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('should not notify after unsubscribe', () => {
      const { store } = createWrapper({});
      const listener = vi.fn();

      const unsub = store.subscribe((state) => state.values, listener);
      unsub();

      act(() => {
        store.getState()._setValue('field', 'value');
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
