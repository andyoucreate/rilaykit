import type { ConditionConfig, ConditionalBehavior } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { scopeConditions } from '../../src/utils/scope-conditions';

describe('scopeConditions', () => {
  const templateFieldIds = new Set(['name', 'qty', 'price', 'type']);
  const repeatableId = 'items';
  const itemKey = 'k2';

  describe('basic scoping', () => {
    it('should prefix template field references in visible condition', () => {
      const conditions: ConditionalBehavior = {
        visible: { type: 'equals', field: 'type', value: 'physical' },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible).toEqual({
        type: 'equals',
        field: 'items[k2].type',
        value: 'physical',
      });
    });

    it('should scope all condition types', () => {
      const conditions: ConditionalBehavior = {
        visible: { type: 'equals', field: 'type', value: 'a' },
        disabled: { type: 'equals', field: 'name', value: 'locked' },
        required: { type: 'notEmpty', field: 'qty' },
        readonly: { type: 'equals', field: 'price', value: 0 },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible!.field).toBe('items[k2].type');
      expect(scoped.disabled!.field).toBe('items[k2].name');
      expect(scoped.required!.field).toBe('items[k2].qty');
      expect(scoped.readonly!.field).toBe('items[k2].price');
    });

    it('should not prefix global field references', () => {
      const conditions: ConditionalBehavior = {
        visible: { type: 'equals', field: 'country', value: 'US' },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible!.field).toBe('country');
    });

    it('should handle mixed template and global references', () => {
      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'AND',
          conditions: [
            { type: 'equals', field: 'type', value: 'physical' },
            { type: 'equals', field: 'country', value: 'US' },
          ],
        },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible!.conditions![0].field).toBe('items[k2].type');
      expect(scoped.visible!.conditions![1].field).toBe('country');
    });
  });

  describe('nested conditions', () => {
    it('should recursively scope nested AND/OR conditions', () => {
      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'OR',
          conditions: [
            {
              logicalOperator: 'AND',
              conditions: [
                { type: 'equals', field: 'type', value: 'physical' },
                { type: 'greaterThan', field: 'qty', value: 0 },
              ],
            },
            { type: 'equals', field: 'name', value: 'special' },
          ],
        },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      // Nested AND group
      const andGroup = scoped.visible!.conditions![0];
      expect(andGroup.conditions![0].field).toBe('items[k2].type');
      expect(andGroup.conditions![1].field).toBe('items[k2].qty');

      // Top-level OR sibling
      expect(scoped.visible!.conditions![1].field).toBe('items[k2].name');
    });

    it('should handle deeply nested conditions with global refs', () => {
      const conditions: ConditionalBehavior = {
        visible: {
          logicalOperator: 'AND',
          conditions: [
            {
              logicalOperator: 'OR',
              conditions: [
                { type: 'equals', field: 'type', value: 'x' },
                {
                  logicalOperator: 'AND',
                  conditions: [
                    { type: 'equals', field: 'globalField', value: 'yes' },
                    { type: 'equals', field: 'qty', value: 5 },
                  ],
                },
              ],
            },
          ],
        },
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      const orGroup = scoped.visible!.conditions![0];
      expect(orGroup.conditions![0].field).toBe('items[k2].type');

      const innerAndGroup = orGroup.conditions![1];
      expect(innerAndGroup.conditions![0].field).toBe('globalField'); // Not scoped
      expect(innerAndGroup.conditions![1].field).toBe('items[k2].qty');
    });
  });

  describe('edge cases', () => {
    it('should handle empty conditions', () => {
      const conditions: ConditionalBehavior = {};

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped).toEqual({});
    });

    it('should handle conditions without field reference', () => {
      const conditions: ConditionalBehavior = {
        visible: { type: 'custom' } as ConditionConfig,
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible!.field).toBeUndefined();
    });

    it('should preserve non-field properties', () => {
      const conditions: ConditionalBehavior = {
        visible: {
          type: 'equals',
          field: 'type',
          value: 'physical',
          operator: 'strictEquals',
        } as ConditionConfig,
      };

      const scoped = scopeConditions(conditions, repeatableId, itemKey, templateFieldIds);

      expect(scoped.visible!.type).toBe('equals');
      expect((scoped.visible! as any).value).toBe('physical');
      expect((scoped.visible! as any).operator).toBe('strictEquals');
    });

    it('should return different item keys for different items', () => {
      const conditions: ConditionalBehavior = {
        visible: { type: 'equals', field: 'type', value: 'a' },
      };

      const scopedK0 = scopeConditions(conditions, 'items', 'k0', templateFieldIds);
      const scopedK5 = scopeConditions(conditions, 'items', 'k5', templateFieldIds);

      expect(scopedK0.visible!.field).toBe('items[k0].type');
      expect(scopedK5.visible!.field).toBe('items[k5].type');
    });
  });
});
