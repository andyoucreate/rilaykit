import type { ConditionalBehavior } from '@rilaykit/core';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useConditionEvaluator,
  useFieldConditionsLazy,
} from '../../src/hooks/useFieldConditionsLazy';
import { FormStoreContext, createFormStore } from '../../src/stores/formStore';

function createWrapper(initialValues: Record<string, unknown> = {}) {
  const store = createFormStore(initialValues);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <FormStoreContext.Provider value={store}>{children}</FormStoreContext.Provider>
  );
  return { Wrapper, store };
}

describe('useFieldConditionsLazy Comprehensive Tests', () => {
  describe('Basic Functionality', () => {
    it('should return default conditions when no conditions defined', () => {
      const { Wrapper } = createWrapper({});

      const { result } = renderHook(() => useFieldConditionsLazy('field1'), { wrapper: Wrapper });

      expect(result.current).toEqual({
        visible: true,
        disabled: false,
        required: false,
        readonly: false,
      });
    });

    it('should return store conditions when skip is true', () => {
      const { Wrapper, store } = createWrapper({ showField: true });

      // Set conditions in store
      act(() => {
        store.getState()._setFieldConditions('field1', {
          visible: false,
          disabled: true,
          required: false,
          readonly: false,
        });
      });

      const { result } = renderHook(
        () =>
          useFieldConditionsLazy('field1', {
            skip: true,
            conditions: {
              visible: { field: 'showField', operator: 'equals', value: true },
            },
          }),
        { wrapper: Wrapper }
      );

      // Should use store conditions, not evaluate
      expect(result.current.visible).toBe(false);
      expect(result.current.disabled).toBe(true);
    });

    it('should evaluate simple visibility condition', () => {
      const { Wrapper } = createWrapper({ showField: true });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'showField',
          operator: 'equals',
          value: true,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });

    it('should hide field when condition is false', () => {
      const { Wrapper } = createWrapper({ showField: false });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'showField',
          operator: 'equals',
          value: true,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(false);
    });
  });

  describe('All Condition Types', () => {
    it('should evaluate disabled condition', () => {
      const { Wrapper } = createWrapper({ isLocked: true });

      const conditions: ConditionalBehavior = {
        disabled: {
          field: 'isLocked',
          operator: 'equals',
          value: true,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.disabled).toBe(true);
    });

    it('should evaluate required condition', () => {
      const { Wrapper } = createWrapper({ needsField: true });

      const conditions: ConditionalBehavior = {
        required: {
          field: 'needsField',
          operator: 'equals',
          value: true,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.required).toBe(true);
    });

    it('should evaluate readonly condition', () => {
      const { Wrapper } = createWrapper({ mode: 'view' });

      const conditions: ConditionalBehavior = {
        readonly: {
          field: 'mode',
          operator: 'equals',
          value: 'view',
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.readonly).toBe(true);
    });

    it('should evaluate all conditions together', () => {
      const { Wrapper } = createWrapper({
        show: true,
        lock: true,
        req: false,
        view: true,
      });

      const conditions: ConditionalBehavior = {
        visible: { field: 'show', operator: 'equals', value: true },
        disabled: { field: 'lock', operator: 'equals', value: true },
        required: { field: 'req', operator: 'equals', value: true },
        readonly: { field: 'view', operator: 'equals', value: true },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current).toEqual({
        visible: true,
        disabled: true,
        required: false,
        readonly: true,
      });
    });
  });

  describe('Logical Operators', () => {
    it('should evaluate AND conditions - all true', () => {
      const { Wrapper } = createWrapper({ a: true, b: true });

      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'and',
          field: '',
          operator: 'exists',
          conditions: [
            { field: 'a', operator: 'equals', value: true },
            { field: 'b', operator: 'equals', value: true },
          ],
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });

    it('should fail AND when one condition is false', () => {
      const { Wrapper } = createWrapper({ a: true, b: false });

      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'and',
          field: '',
          operator: 'exists',
          conditions: [
            { field: 'a', operator: 'equals', value: true },
            { field: 'b', operator: 'equals', value: true },
          ],
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(false);
    });

    it('should evaluate OR conditions - at least one true', () => {
      const { Wrapper } = createWrapper({ a: false, b: true });

      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'or',
          field: '',
          operator: 'exists',
          conditions: [
            { field: 'a', operator: 'equals', value: true },
            { field: 'b', operator: 'equals', value: true },
          ],
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });

    it('should fail OR when all conditions are false', () => {
      const { Wrapper } = createWrapper({ a: false, b: false });

      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'or',
          field: '',
          operator: 'exists',
          conditions: [
            { field: 'a', operator: 'equals', value: true },
            { field: 'b', operator: 'equals', value: true },
          ],
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(false);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache results based on form values', () => {
      const { Wrapper } = createWrapper({ field: 'value' });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'field',
          operator: 'equals',
          value: 'value',
        },
      };

      const { result, rerender } = renderHook(
        () => useFieldConditionsLazy('field1', { conditions }),
        {
          wrapper: Wrapper,
        }
      );

      expect(result.current.visible).toBe(true);

      // Rerender with same conditions
      rerender();

      // Should use cached result
      expect(result.current.visible).toBe(true);
    });

    it('should re-evaluate when store values change', () => {
      const { Wrapper, store } = createWrapper({ toggle: true });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'toggle',
          operator: 'equals',
          value: true,
        },
      };

      const { result, rerender } = renderHook(
        () => useFieldConditionsLazy('field1', { conditions }),
        {
          wrapper: Wrapper,
        }
      );

      expect(result.current.visible).toBe(true);

      // Change store value
      act(() => {
        store.getState()._setValue('toggle', false);
      });

      // Rerender to pick up new values
      rerender();

      expect(result.current.visible).toBe(false);
    });
  });

  describe('useConditionEvaluator', () => {
    it('should create evaluator that works on-demand', () => {
      const { Wrapper } = createWrapper({ status: 'active' });

      const { result } = renderHook(() => useConditionEvaluator(), { wrapper: Wrapper });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'status',
          operator: 'equals',
          value: 'active',
        },
      };

      const evaluated = result.current('field1', conditions);
      expect(evaluated.visible).toBe(true);
    });

    it('should cache across multiple field evaluations', () => {
      const { Wrapper } = createWrapper({ shared: true });

      const { result } = renderHook(() => useConditionEvaluator(), { wrapper: Wrapper });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'shared',
          operator: 'equals',
          value: true,
        },
      };

      // Evaluate for multiple fields
      result.current('field1', conditions);
      result.current('field2', conditions);
      result.current('field3', conditions);

      // All should return true
      expect(result.current('field1', conditions).visible).toBe(true);
      expect(result.current('field2', conditions).visible).toBe(true);
      expect(result.current('field3', conditions).visible).toBe(true);
    });
  });

  describe('Operator Coverage', () => {
    const testOperator = (
      operator: string,
      fieldValue: unknown,
      conditionValue: unknown,
      expected: boolean
    ) => {
      it(`should evaluate ${operator} correctly (${fieldValue} ${operator} ${conditionValue} = ${expected})`, () => {
        const { Wrapper } = createWrapper({ testField: fieldValue });

        const conditions: ConditionalBehavior = {
          visible: {
            field: 'testField',
            operator: operator as any,
            value: conditionValue,
          },
        };

        const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
          wrapper: Wrapper,
        });

        expect(result.current.visible).toBe(expected);
      });
    };

    // Equality operators
    testOperator('equals', 'active', 'active', true);
    testOperator('equals', 'active', 'inactive', false);
    testOperator('notEquals', 'active', 'inactive', true);
    testOperator('notEquals', 'active', 'active', false);

    // String operators (contains)
    testOperator('contains', 'hello world', 'world', true);
    testOperator('contains', 'hello world', 'foo', false);

    // Numeric operators
    testOperator('greaterThan', 10, 5, true);
    testOperator('greaterThan', 5, 10, false);
    testOperator('lessThan', 5, 10, true);
    testOperator('lessThan', 10, 5, false);
    testOperator('greaterThanOrEqual', 10, 10, true);
    testOperator('lessThanOrEqual', 10, 10, true);

    // In operators
    testOperator('in', 'admin', ['admin', 'moderator'], true);
    testOperator('in', 'guest', ['admin', 'moderator'], false);
    testOperator('notIn', 'guest', ['admin', 'moderator'], true);
    testOperator('notIn', 'admin', ['admin', 'moderator'], false);

    // Existence operators
    testOperator('exists', 'value', undefined, true);
    testOperator('exists', null, undefined, false);
    testOperator('notExists', null, undefined, true);
    testOperator('notExists', 'value', undefined, false);
  });

  describe('Edge Cases', () => {
    it('should handle null values with notExists', () => {
      const { Wrapper } = createWrapper({ field: null });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'field',
          operator: 'notExists',
          value: undefined,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });

    it('should handle undefined values with notExists', () => {
      const { Wrapper } = createWrapper({});

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'nonExistent',
          operator: 'notExists',
          value: undefined,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });

    it('should handle numeric zero correctly', () => {
      const { Wrapper } = createWrapper({ count: 0 });

      const conditions: ConditionalBehavior = {
        visible: {
          field: 'count',
          operator: 'equals',
          value: 0,
        },
      };

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      expect(result.current.visible).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle many conditions efficiently', () => {
      const initialValues: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        initialValues[`field${i}`] = i;
      }

      const { Wrapper } = createWrapper(initialValues);

      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'or',
          field: '',
          operator: 'exists',
          conditions: Array.from({ length: 100 }, (_, i) => ({
            field: `field${i}`,
            operator: 'greaterThan' as const,
            value: 50,
          })),
        },
      };

      const start = performance.now();

      const { result } = renderHook(() => useFieldConditionsLazy('field1', { conditions }), {
        wrapper: Wrapper,
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
      console.log(`100 OR conditions evaluated in ${duration.toFixed(2)}ms`);

      // Should be visible (some fields > 50)
      expect(result.current.visible).toBe(true);
    });
  });
});
