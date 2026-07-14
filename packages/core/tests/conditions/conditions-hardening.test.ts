import { describe, expect, test } from 'vitest';
import { evaluateCondition, when } from '../../src/conditions';

describe('Condition hardening', () => {
  describe('matches operator (Bug 1)', () => {
    test('does not throw on an invalid regex pattern and evaluates to false', () => {
      const condition = when('x').matches('[').build();
      expect(() => evaluateCondition(condition, { x: 'anything' })).not.toThrow();
      expect(evaluateCondition(condition, { x: 'anything' })).toBe(false);
    });

    test('preserves RegExp flags (case-insensitive) at evaluation time', () => {
      const condition = when('x').matches(/abc/i).build();
      expect(evaluateCondition(condition, { x: 'ABC' })).toBe(true);
    });
  });

  describe('notContains operator (Bug 6)', () => {
    test('is vacuously true for non-string/array field values', () => {
      const condition = when('x').notContains('a').build();
      expect(evaluateCondition(condition, { x: undefined })).toBe(true);
      expect(evaluateCondition(condition, { x: 5 })).toBe(true);
    });

    test('keeps real string/array semantics', () => {
      const condition = when('x').notContains('a').build();
      expect(evaluateCondition(condition, { x: 'banana' })).toBe(false);
      expect(evaluateCondition(condition, { x: ['a', 'b'] })).toBe(false);
      expect(evaluateCondition(condition, { x: ['c', 'd'] })).toBe(true);
    });
  });
});
