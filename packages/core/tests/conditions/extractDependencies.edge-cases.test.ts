import { describe, expect, it } from 'vitest';
import { type ConditionConfig, extractConditionDependencies, when } from '../../src/conditions';

describe('extractConditionDependencies Edge Cases', () => {
  describe('Empty and Null Conditions', () => {
    it('should return empty array for null condition', () => {
      const deps = extractConditionDependencies(null);
      expect(deps).toEqual([]);
    });

    it('should return empty array for undefined condition', () => {
      const deps = extractConditionDependencies(undefined);
      expect(deps).toEqual([]);
    });

    it('should return empty array for condition with empty field', () => {
      const condition: ConditionConfig = {
        field: '',
        operator: 'equals',
        value: 'test',
      };
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual([]);
    });

    it('should handle condition with empty conditions array', () => {
      const condition: ConditionConfig = {
        field: 'testField',
        operator: 'equals',
        value: true,
        logicalOperator: 'and',
        conditions: [],
      };
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['testField']);
    });
  });

  describe('Complex Logical Structures', () => {
    it('should extract from deeply nested or conditions', () => {
      const condition = when('field1')
        .equals('a')
        .or(when('field2').equals('b'))
        .or(when('field3').equals('c'))
        .or(when('field4').equals('d'));

      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(4);
      expect(deps).toContain('field1');
      expect(deps).toContain('field2');
      expect(deps).toContain('field3');
      expect(deps).toContain('field4');
    });

    it('should extract from mixed and/or nesting', () => {
      const condition = when('a').equals('1').or(when('b').equals('2')).and(when('c').equals('3'));

      const deps = extractConditionDependencies(condition);
      expect(deps.length).toBeGreaterThanOrEqual(3);
      expect(deps).toContain('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
    });

    it('should handle 5 levels of nesting', () => {
      const condition = when('level0')
        .equals(0)
        .and(when('level1').equals(1))
        .and(when('level2').equals(2))
        .and(when('level3').equals(3))
        .and(when('level4').equals(4));

      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(5);
      expect(deps).toContain('level0');
      expect(deps).toContain('level1');
      expect(deps).toContain('level2');
      expect(deps).toContain('level3');
      expect(deps).toContain('level4');
    });
  });

  describe('Duplicate Field Handling', () => {
    it('should deduplicate same field appearing multiple times', () => {
      const condition = when('status').equals('active').or(when('status').notEquals('deleted'));

      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(1);
      expect(deps[0]).toBe('status');
    });

    it('should deduplicate across nested conditions', () => {
      const condition = when('user')
        .equals('admin')
        .and(when('role').equals('manager'))
        .or(when('user').equals('guest').and(when('role').equals('viewer')));

      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(2);
      expect(deps).toContain('user');
      expect(deps).toContain('role');
    });
  });

  describe('All Operator Types', () => {
    const operators = [
      { name: 'equals', builder: (field: string) => when(field).equals('test') },
      { name: 'notEquals', builder: (field: string) => when(field).notEquals('test') },
      { name: 'greaterThan', builder: (field: string) => when(field).greaterThan(10) },
      { name: 'lessThan', builder: (field: string) => when(field).lessThan(10) },
      {
        name: 'greaterThanOrEqual',
        builder: (field: string) => when(field).greaterThanOrEqual(10),
      },
      { name: 'lessThanOrEqual', builder: (field: string) => when(field).lessThanOrEqual(10) },
      { name: 'contains', builder: (field: string) => when(field).contains('test') },
      { name: 'notContains', builder: (field: string) => when(field).notContains('test') },
      { name: 'in', builder: (field: string) => when(field).in(['a', 'b']) },
      { name: 'notIn', builder: (field: string) => when(field).notIn(['a', 'b']) },
      { name: 'matches', builder: (field: string) => when(field).matches(/test/) },
      { name: 'exists', builder: (field: string) => when(field).exists() },
      { name: 'notExists', builder: (field: string) => when(field).notExists() },
    ];

    for (const { name, builder } of operators) {
      it(`should extract dependency for operator: ${name}`, () => {
        const condition = builder(`field_${name}`);
        const deps = extractConditionDependencies(condition);
        expect(deps).toHaveLength(1);
        expect(deps[0]).toBe(`field_${name}`);
      });
    }
  });

  describe('Field Path Formats', () => {
    it('should handle dotted field paths', () => {
      const condition = when('user.profile.name').equals('John');
      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(1);
      expect(deps[0]).toBe('user.profile.name');
    });

    it('should handle step-prefixed field paths', () => {
      const condition = when('step1.field1').equals('value');
      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(1);
      expect(deps[0]).toBe('step1.field1');
    });

    it('should handle Unicode field names', () => {
      const condition = when('日本語フィールド').equals('test');
      const deps = extractConditionDependencies(condition);
      expect(deps).toHaveLength(1);
      expect(deps[0]).toBe('日本語フィールド');
    });
  });

  describe('Value Types (for completeness)', () => {
    it('should work with boolean values', () => {
      const condition = when('isActive').equals(true);
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['isActive']);
    });

    it('should work with numeric values', () => {
      const condition = when('count').greaterThan(100);
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['count']);
    });

    it('should work with array values', () => {
      const condition = when('role').in(['admin', 'moderator', 'user']);
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['role']);
    });

    it('should work with null value', () => {
      const condition = when('deletedAt').equals(null);
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['deletedAt']);
    });
  });

  describe('ConditionBuilder Support', () => {
    it('should work with ConditionBuilder directly (not built)', () => {
      const condition = when('field1').equals('value');
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['field1']);
    });

    it('should work with built ConditionConfig', () => {
      const condition = when('field1').equals('value').build();
      const deps = extractConditionDependencies(condition);
      expect(deps).toEqual(['field1']);
    });
  });

  describe('Performance', () => {
    it('should handle 100 conditions efficiently', () => {
      // Build a large OR chain
      let condition = when('field0').equals(0);
      for (let i = 1; i < 100; i++) {
        condition = condition.or(when(`field${i}`).equals(i));
      }

      const start = performance.now();
      const deps = extractConditionDependencies(condition);
      const duration = performance.now() - start;

      expect(deps).toHaveLength(100);
      expect(duration).toBeLessThan(100);
      console.log(`100 conditions extracted in ${duration.toFixed(2)}ms`);
    });
  });
});
