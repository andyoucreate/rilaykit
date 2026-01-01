import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionDependencyGraph, when } from '../../src/conditions';

describe('ConditionDependencyGraph', () => {
  let graph: ConditionDependencyGraph;

  beforeEach(() => {
    graph = new ConditionDependencyGraph();
  });

  describe('addField', () => {
    it('should add a field without conditions', () => {
      graph.addField('field1', undefined);

      expect(graph.size).toBe(1);
      expect(graph.getDependencies('field1')).toEqual([]);
    });

    it('should add a field with simple visible condition', () => {
      graph.addField('dependentField', {
        visible: when('triggerField').equals('show'),
      });

      expect(graph.getDependencies('dependentField')).toEqual(['triggerField']);
    });

    it('should add a field with multiple condition types', () => {
      graph.addField('complexField', {
        visible: when('trigger1').equals('show'),
        disabled: when('trigger2').equals(true),
        required: when('trigger3').exists(),
      });

      const deps = graph.getDependencies('complexField');
      expect(deps).toHaveLength(3);
      expect(deps).toContain('trigger1');
      expect(deps).toContain('trigger2');
      expect(deps).toContain('trigger3');
    });

    it('should add a field with nested AND/OR conditions', () => {
      graph.addField('nestedField', {
        visible: when('field1').equals('a').and(when('field2').equals('b')),
      });

      const deps = graph.getDependencies('nestedField');
      expect(deps).toHaveLength(2);
      expect(deps).toContain('field1');
      expect(deps).toContain('field2');
    });

    it('should deduplicate dependencies', () => {
      graph.addField('dedupField', {
        visible: when('sameField').equals('a'),
        disabled: when('sameField').equals('b'),
      });

      const deps = graph.getDependencies('dedupField');
      expect(deps).toEqual(['sameField']);
    });
  });

  describe('getAffectedFields', () => {
    beforeEach(() => {
      graph.addField('field1', {
        visible: when('trigger').equals('show'),
      });
      graph.addField('field2', {
        visible: when('trigger').equals('showAll'),
      });
      graph.addField('field3', {
        visible: when('otherTrigger').exists(),
      });
    });

    it('should return all fields affected by a change', () => {
      const affected = graph.getAffectedFields('trigger');

      expect(affected).toHaveLength(2);
      expect(affected).toContain('field1');
      expect(affected).toContain('field2');
    });

    it('should return empty array for unknown path', () => {
      const affected = graph.getAffectedFields('unknownPath');
      expect(affected).toEqual([]);
    });

    it('should only return fields depending on specific path', () => {
      const affected = graph.getAffectedFields('otherTrigger');

      expect(affected).toHaveLength(1);
      expect(affected).toContain('field3');
    });
  });

  describe('getAffectedFieldsMultiple', () => {
    beforeEach(() => {
      graph.addField('field1', { visible: when('path1').exists() });
      graph.addField('field2', { visible: when('path2').exists() });
      graph.addField('field3', { visible: when('path1').equals('a').and(when('path3').exists()) });
    });

    it('should return all fields affected by multiple changes', () => {
      const affected = graph.getAffectedFieldsMultiple(['path1', 'path2']);

      expect(affected).toHaveLength(3);
      expect(affected).toContain('field1');
      expect(affected).toContain('field2');
      expect(affected).toContain('field3');
    });

    it('should deduplicate results', () => {
      // path1 affects both field1 and field3
      const affected = graph.getAffectedFieldsMultiple(['path1']);

      expect(affected).toHaveLength(2);
      expect(affected).toContain('field1');
      expect(affected).toContain('field3');
    });
  });

  describe('removeField', () => {
    it('should remove a field from the graph', () => {
      graph.addField('field1', { visible: when('trigger').exists() });
      graph.addField('field2', { visible: when('trigger').exists() });

      expect(graph.size).toBe(2);

      graph.removeField('field1');

      expect(graph.size).toBe(1);
      expect(graph.getDependencies('field1')).toEqual([]);
    });

    it('should update reverse dependencies when removing', () => {
      graph.addField('field1', { visible: when('trigger').exists() });

      expect(graph.getAffectedFields('trigger')).toContain('field1');

      graph.removeField('field1');

      expect(graph.getAffectedFields('trigger')).toEqual([]);
    });

    it('should handle removing non-existent field', () => {
      graph.removeField('nonExistent');
      expect(graph.size).toBe(0);
    });
  });

  describe('hasDependencies', () => {
    it('should return true for fields with dependencies', () => {
      graph.addField('withDeps', { visible: when('trigger').exists() });
      expect(graph.hasDependencies('withDeps')).toBe(true);
    });

    it('should return false for fields without dependencies', () => {
      graph.addField('noDeps', undefined);
      expect(graph.hasDependencies('noDeps')).toBe(false);
    });

    it('should return false for unknown fields', () => {
      expect(graph.hasDependencies('unknown')).toBe(false);
    });
  });

  describe('getAllFields', () => {
    it('should return all field IDs', () => {
      graph.addField('field1', undefined);
      graph.addField('field2', { visible: when('x').exists() });
      graph.addField('field3', undefined);

      const fields = graph.getAllFields();
      expect(fields).toHaveLength(3);
      expect(fields).toContain('field1');
      expect(fields).toContain('field2');
      expect(fields).toContain('field3');
    });
  });

  describe('getAllDependencyPaths', () => {
    it('should return all unique dependency paths', () => {
      graph.addField('field1', { visible: when('path1').exists() });
      graph.addField('field2', { visible: when('path2').exists() });
      graph.addField('field3', { visible: when('path1').equals('a') });

      const paths = graph.getAllDependencyPaths();
      expect(paths).toHaveLength(2);
      expect(paths).toContain('path1');
      expect(paths).toContain('path2');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      graph.addField('field1', { visible: when('trigger').exists() });
      graph.addField('field2', { visible: when('trigger').exists() });

      expect(graph.size).toBe(2);

      graph.clear();

      expect(graph.size).toBe(0);
      expect(graph.getAllFields()).toEqual([]);
      expect(graph.getAllDependencyPaths()).toEqual([]);
    });
  });

  describe('toDebugObject', () => {
    it('should return debug representation', () => {
      graph.addField('field1', { visible: when('trigger').exists() });
      graph.addField('field2', { visible: when('trigger').equals('a') });

      const debug = graph.toDebugObject();

      expect(debug.fields.field1).toEqual(['trigger']);
      expect(debug.fields.field2).toEqual(['trigger']);
      expect(debug.reverseDeps.trigger).toContain('field1');
      expect(debug.reverseDeps.trigger).toContain('field2');
    });
  });

  describe('Nested path dependencies', () => {
    it('should handle nested paths correctly', () => {
      graph.addField('field1', {
        visible: when('step1.field1').equals('show'),
      });
      graph.addField('field2', {
        visible: when('step2.nested.value').exists(),
      });

      expect(graph.getAffectedFields('step1.field1')).toContain('field1');
      expect(graph.getAffectedFields('step2.nested.value')).toContain('field2');
      expect(graph.getAffectedFields('step1')).toEqual([]); // Exact match only
    });
  });

  describe('Complex scenarios', () => {
    it('should handle form with many conditional fields', () => {
      // Simulate a form with 10 fields, 5 of which depend on a "type" field
      for (let i = 0; i < 5; i++) {
        graph.addField(`typeDependent${i}`, {
          visible: when('type').equals(`option${i}`),
        });
      }
      for (let i = 5; i < 10; i++) {
        graph.addField(`independent${i}`, undefined);
      }

      const affectedByType = graph.getAffectedFields('type');
      expect(affectedByType).toHaveLength(5);

      for (let i = 0; i < 5; i++) {
        expect(affectedByType).toContain(`typeDependent${i}`);
      }
    });

    it('should handle cascading dependencies', () => {
      // field1 depends on trigger1
      // field2 depends on field1 (but graph doesn't know about value cascading)
      graph.addField('field1', { visible: when('trigger1').exists() });
      graph.addField('field2', { visible: when('field1').equals('active') });

      // When trigger1 changes, only field1 is directly affected
      expect(graph.getAffectedFields('trigger1')).toEqual(['field1']);

      // When field1 changes, field2 is affected
      expect(graph.getAffectedFields('field1')).toEqual(['field2']);
    });
  });
});
