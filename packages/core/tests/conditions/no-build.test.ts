import { describe, expect, test } from 'vitest';
import { evaluateCondition, when } from '../../src/conditions';

describe('Condition System - No Build Required', () => {
  test('should work directly without .build()', () => {
    const condition = when('field1').equals('value1');

    // Should work as ConditionConfig directly
    expect(evaluateCondition(condition, { field1: 'value1' })).toBe(true);
    expect(evaluateCondition(condition, { field1: 'value2' })).toBe(false);

    // Properties should be accessible
    expect(condition.field).toBe('field1');
    expect(condition.operator).toBe('equals');
    expect(condition.value).toBe('value1');
  });

  test('should work with complex conditions without .build()', () => {
    const complexCondition = when('age').greaterThan(18).and(when('status').equals('active'));

    expect(evaluateCondition(complexCondition, { age: 25, status: 'active' })).toBe(true);
    expect(evaluateCondition(complexCondition, { age: 15, status: 'active' })).toBe(false);

    expect(complexCondition.logicalOperator).toBe('and');
    expect(complexCondition.conditions).toHaveLength(2);
  });

  test('should work with evaluate method directly', () => {
    const condition = when('field1').equals('value1');

    expect(condition.evaluate({ field1: 'value1' })).toBe(true);
    expect(condition.evaluate({ field1: 'value2' })).toBe(false);
  });

  test('should still work with .build() for backward compatibility', () => {
    const condition = when('field1').equals('value1').build();

    expect(evaluateCondition(condition, { field1: 'value1' })).toBe(true);
    expect(condition.field).toBe('field1');
    expect(condition.operator).toBe('equals');
    expect(condition.value).toBe('value1');
  });

  test('should handle OR conditions without .build()', () => {
    const condition = when('type').equals('premium').or(when('age').greaterThan(65));

    expect(evaluateCondition(condition, { type: 'premium', age: 30 })).toBe(true);
    expect(evaluateCondition(condition, { type: 'basic', age: 70 })).toBe(true);
    expect(evaluateCondition(condition, { type: 'basic', age: 30 })).toBe(false);
  });
});
