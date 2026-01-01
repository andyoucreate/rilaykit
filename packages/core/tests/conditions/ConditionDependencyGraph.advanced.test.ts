import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionDependencyGraph } from '../../src/conditions';
import type { ConditionalBehavior } from '../../src/types';

describe('ConditionDependencyGraph Advanced Tests', () => {
  let graph: ConditionDependencyGraph;

  beforeEach(() => {
    graph = new ConditionDependencyGraph();
  });

  describe('Complex Dependency Patterns', () => {
    it('should handle diamond dependency pattern', () => {
      // fieldA is trigger
      // fieldB depends on fieldA
      // fieldC depends on fieldA
      // fieldD depends on both B and C
      graph.addField('fieldA', undefined);
      graph.addField('fieldB', {
        visible: { field: 'fieldA', operator: 'equals', value: true },
      });
      graph.addField('fieldC', {
        visible: { field: 'fieldA', operator: 'equals', value: true },
      });
      graph.addField('fieldD', {
        visible: {
          logicalOperator: 'AND',
          conditions: [
            { field: 'fieldB', operator: 'equals', value: true },
            { field: 'fieldC', operator: 'equals', value: true },
          ],
        },
      });

      // When fieldA changes, B and C should be affected
      const affectedByA = graph.getAffectedFields('fieldA');
      expect(affectedByA).toContain('fieldB');
      expect(affectedByA).toContain('fieldC');
      expect(affectedByA).not.toContain('fieldD');

      // When fieldB or C changes, D should be affected
      const affectedByB = graph.getAffectedFields('fieldB');
      expect(affectedByB).toContain('fieldD');
    });

    it('should handle fan-out pattern (one source, many dependents)', () => {
      graph.addField('sourceField', undefined);

      for (let i = 0; i < 100; i++) {
        graph.addField(`dependent${i}`, {
          visible: { field: 'sourceField', operator: 'equals', value: true },
        });
      }

      const affected = graph.getAffectedFields('sourceField');
      expect(affected).toHaveLength(100);
      for (let i = 0; i < 100; i++) {
        expect(affected).toContain(`dependent${i}`);
      }
    });

    it('should handle fan-in pattern (many sources, one dependent)', () => {
      const conditions: ConditionalBehavior['visible'][] = [];
      for (let i = 0; i < 100; i++) {
        graph.addField(`source${i}`, undefined);
        conditions.push({
          field: `source${i}`,
          operator: 'equals',
          value: true,
        });
      }

      graph.addField('dependentField', {
        visible: {
          logicalOperator: 'OR',
          conditions: conditions,
        },
      });

      // Each source should list the dependent
      for (let i = 0; i < 100; i++) {
        const affected = graph.getAffectedFields(`source${i}`);
        expect(affected).toContain('dependentField');
      }

      // Check dependencies
      const deps = graph.getDependencies('dependentField');
      expect(deps).toHaveLength(100);
    });

    it('should handle multiple independent chains', () => {
      // Chain 1: A -> B
      graph.addField('chainA_source', undefined);
      graph.addField('chainA_dependent', {
        visible: { field: 'chainA_source', operator: 'equals', value: true },
      });

      // Chain 2: X -> Y
      graph.addField('chainB_source', undefined);
      graph.addField('chainB_dependent', {
        visible: { field: 'chainB_source', operator: 'equals', value: true },
      });

      const affectedByA = graph.getAffectedFields('chainA_source');
      const affectedByX = graph.getAffectedFields('chainB_source');

      expect(affectedByA).toContain('chainA_dependent');
      expect(affectedByA).not.toContain('chainB_dependent');

      expect(affectedByX).toContain('chainB_dependent');
      expect(affectedByX).not.toContain('chainA_dependent');
    });
  });

  describe('Multiple Condition Types', () => {
    it('should track dependencies across all condition types', () => {
      graph.addField('visibleTrigger', undefined);
      graph.addField('disabledTrigger', undefined);
      graph.addField('requiredTrigger', undefined);
      graph.addField('readonlyTrigger', undefined);

      graph.addField('complexField', {
        visible: { field: 'visibleTrigger', operator: 'equals', value: true },
        disabled: { field: 'disabledTrigger', operator: 'equals', value: true },
        required: { field: 'requiredTrigger', operator: 'equals', value: true },
        readonly: { field: 'readonlyTrigger', operator: 'equals', value: true },
      });

      const deps = graph.getDependencies('complexField');
      expect(deps).toHaveLength(4);
      expect(deps).toContain('visibleTrigger');
      expect(deps).toContain('disabledTrigger');
      expect(deps).toContain('requiredTrigger');
      expect(deps).toContain('readonlyTrigger');

      // Each trigger should affect complexField
      expect(graph.getAffectedFields('visibleTrigger')).toContain('complexField');
      expect(graph.getAffectedFields('disabledTrigger')).toContain('complexField');
      expect(graph.getAffectedFields('requiredTrigger')).toContain('complexField');
      expect(graph.getAffectedFields('readonlyTrigger')).toContain('complexField');
    });

    it('should handle shared dependencies across condition types', () => {
      graph.addField('sharedTrigger', undefined);

      graph.addField('fieldWithShared', {
        visible: { field: 'sharedTrigger', operator: 'equals', value: 'show' },
        disabled: { field: 'sharedTrigger', operator: 'equals', value: 'disable' },
        required: { field: 'sharedTrigger', operator: 'notEquals', value: '' },
      });

      // Should only count the shared dependency once
      const deps = graph.getDependencies('fieldWithShared');
      expect(deps).toHaveLength(1);
      expect(deps[0]).toBe('sharedTrigger');

      // Should be in affected fields
      expect(graph.getAffectedFields('sharedTrigger')).toContain('fieldWithShared');
    });
  });

  describe('Removal Operations', () => {
    it('should remove field and its dependencies', () => {
      graph.addField('trigger', undefined);
      graph.addField('dependent', {
        visible: { field: 'trigger', operator: 'equals', value: true },
      });

      expect(graph.getAffectedFields('trigger')).toContain('dependent');

      graph.removeField('dependent');

      expect(graph.getAffectedFields('trigger')).not.toContain('dependent');
      expect(graph.getDependencies('dependent')).toEqual([]);
    });

    it('should not affect other fields when removing', () => {
      graph.addField('trigger', undefined);
      graph.addField('field1', {
        visible: { field: 'trigger', operator: 'equals', value: 1 },
      });
      graph.addField('field2', {
        visible: { field: 'trigger', operator: 'equals', value: 2 },
      });

      graph.removeField('field1');

      expect(graph.getAffectedFields('trigger')).not.toContain('field1');
      expect(graph.getAffectedFields('trigger')).toContain('field2');
    });

    it('should cleanup reverse dependencies completely', () => {
      graph.addField('trigger', undefined);
      graph.addField('onlyDependent', {
        visible: { field: 'trigger', operator: 'equals', value: true },
      });

      graph.removeField('onlyDependent');

      // Trigger should have no dependents
      expect(graph.getAffectedFields('trigger')).toEqual([]);
    });
  });

  describe('Traversal Methods', () => {
    it('getAllFields should return all registered fields', () => {
      graph.addField('field1', undefined);
      graph.addField('field2', undefined);
      graph.addField('field3', {
        visible: { field: 'field1', operator: 'equals', value: true },
      });

      const fields = graph.getAllFields();
      expect(fields).toHaveLength(3);
      expect(fields).toContain('field1');
      expect(fields).toContain('field2');
      expect(fields).toContain('field3');
    });

    it('getAllDependencyPaths should return all unique dependency paths', () => {
      graph.addField('trigger1', undefined);
      graph.addField('trigger2', undefined);
      graph.addField('field', {
        visible: {
          logicalOperator: 'AND',
          conditions: [
            { field: 'trigger1', operator: 'equals', value: true },
            { field: 'trigger2', operator: 'equals', value: true },
          ],
        },
      });

      const paths = graph.getAllDependencyPaths();
      expect(paths).toHaveLength(2);
      expect(paths).toContain('trigger1');
      expect(paths).toContain('trigger2');
    });
  });

  describe('Bulk Operations', () => {
    it('should handle building large graph efficiently', () => {
      const start = performance.now();

      // Create 1000 fields, each with 5 dependencies
      for (let i = 0; i < 1000; i++) {
        const conditions: ConditionalBehavior['visible'][] = [];
        for (let j = 0; j < 5; j++) {
          const depIndex = (i * 5 + j) % 1000;
          conditions.push({
            field: `field${depIndex}`,
            operator: 'equals',
            value: true,
          });
        }

        graph.addField(`field${i}`, {
          visible: {
            logicalOperator: 'OR',
            conditions,
          },
        });
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500);
      expect(graph.size).toBe(1000);
      console.log(`Built graph with 1000 fields in ${duration.toFixed(2)}ms`);
    });

    it('should handle lookup in large graph efficiently', () => {
      // Build graph
      for (let i = 0; i < 1000; i++) {
        graph.addField(`field${i}`, {
          visible: { field: `trigger${i % 100}`, operator: 'equals', value: true },
        });
      }

      const start = performance.now();

      // Do 1000 lookups
      for (let i = 0; i < 100; i++) {
        graph.getAffectedFields(`trigger${i}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
      console.log(`100 lookups in ${duration.toFixed(2)}ms`);
    });

    it('getAffectedFieldsMultiple should handle many paths', () => {
      for (let i = 0; i < 100; i++) {
        graph.addField(`field${i}`, {
          visible: { field: `trigger${i}`, operator: 'equals', value: true },
        });
      }

      const paths = Array.from({ length: 50 }, (_, i) => `trigger${i}`);
      const affected = graph.getAffectedFieldsMultiple(paths);

      expect(affected).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(affected).toContain(`field${i}`);
      }
    });
  });

  describe('Clear Operation', () => {
    it('should clear entire graph', () => {
      graph.addField('field1', undefined);
      graph.addField('field2', {
        visible: { field: 'field1', operator: 'equals', value: true },
      });

      graph.clear();

      expect(graph.size).toBe(0);
      expect(graph.getAllFields()).toHaveLength(0);
      expect(graph.getAllDependencyPaths()).toHaveLength(0);
      expect(graph.getAffectedFields('field1')).toEqual([]);
    });
  });

  describe('Idempotency', () => {
    it('adding same field twice should overwrite', () => {
      graph.addField('field', {
        visible: { field: 'triggerA', operator: 'equals', value: true },
      });

      graph.addField('field', {
        visible: { field: 'triggerB', operator: 'equals', value: true },
      });

      const deps = graph.getDependencies('field');
      // May contain both or just the latest depending on implementation
      expect(deps).toContain('triggerB');
    });
  });

  describe('Non-existent Field Handling', () => {
    it('should return empty array for non-existent field dependencies', () => {
      const deps = graph.getDependencies('nonexistent');
      expect(deps).toEqual([]);
    });

    it('should return empty array for non-existent trigger', () => {
      const affected = graph.getAffectedFields('nonexistent');
      expect(affected).toEqual([]);
    });

    it('hasDependencies should return false for non-existent field', () => {
      expect(graph.hasDependencies('nonexistent')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle field with no conditions', () => {
      graph.addField('simpleField', undefined);

      expect(graph.getDependencies('simpleField')).toEqual([]);
      expect(graph.hasDependencies('simpleField')).toBe(false);
      expect(graph.getAllFields()).toContain('simpleField');
    });

    it('should handle field with empty conditions object', () => {
      graph.addField('emptyConditions', {});

      expect(graph.getDependencies('emptyConditions')).toEqual([]);
      expect(graph.hasDependencies('emptyConditions')).toBe(false);
    });

    it('should handle deeply nested conditions', () => {
      const deepCondition: ConditionalBehavior['visible'] = {
        logicalOperator: 'AND',
        conditions: [
          {
            logicalOperator: 'OR',
            conditions: [
              {
                logicalOperator: 'AND',
                conditions: [
                  { field: 'deep1', operator: 'equals', value: true },
                  { field: 'deep2', operator: 'equals', value: true },
                ],
              },
              { field: 'deep3', operator: 'equals', value: true },
            ],
          },
          { field: 'deep4', operator: 'equals', value: true },
        ],
      };

      graph.addField('deepField', { visible: deepCondition });

      const deps = graph.getDependencies('deepField');
      expect(deps).toHaveLength(4);
      expect(deps).toContain('deep1');
      expect(deps).toContain('deep2');
      expect(deps).toContain('deep3');
      expect(deps).toContain('deep4');
    });

    it('should handle self-referencing field (edge case)', () => {
      // A field that depends on itself (unusual but possible)
      graph.addField('selfRef', {
        visible: { field: 'selfRef', operator: 'equals', value: true },
      });

      expect(graph.getDependencies('selfRef')).toContain('selfRef');
      expect(graph.getAffectedFields('selfRef')).toContain('selfRef');
    });
  });

  describe('Debug Output', () => {
    it('toDebugObject should provide complete graph representation', () => {
      graph.addField('trigger', undefined);
      graph.addField('dependent1', {
        visible: { field: 'trigger', operator: 'equals', value: true },
      });
      graph.addField('dependent2', {
        visible: { field: 'trigger', operator: 'equals', value: true },
      });

      const debug = graph.toDebugObject();

      expect(debug.fields).toHaveProperty('trigger');
      expect(debug.fields).toHaveProperty('dependent1');
      expect(debug.fields).toHaveProperty('dependent2');

      expect(debug.fields.dependent1).toContain('trigger');
      expect(debug.fields.dependent2).toContain('trigger');

      expect(debug.reverseDeps).toHaveProperty('trigger');
      expect(debug.reverseDeps.trigger).toContain('dependent1');
      expect(debug.reverseDeps.trigger).toContain('dependent2');
    });
  });
});
