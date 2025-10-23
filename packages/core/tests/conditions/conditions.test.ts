import { describe, expect, test } from 'vitest';
import { evaluateCondition, when } from '../../src/conditions';

describe('Condition System', () => {
  describe('Basic Conditions', () => {
    test('equals condition', () => {
      const condition = when('field1').equals('value1').build();
      expect(evaluateCondition(condition, { field1: 'value1' })).toBe(true);
      expect(evaluateCondition(condition, { field1: 'value2' })).toBe(false);
    });

    test('notEquals condition', () => {
      const condition = when('field1').notEquals('value1').build();
      expect(evaluateCondition(condition, { field1: 'value2' })).toBe(true);
      expect(evaluateCondition(condition, { field1: 'value1' })).toBe(false);
    });

    test('greaterThan condition', () => {
      const condition = when('age').greaterThan(18).build();
      expect(evaluateCondition(condition, { age: 25 })).toBe(true);
      expect(evaluateCondition(condition, { age: 15 })).toBe(false);
      expect(evaluateCondition(condition, { age: 18 })).toBe(false);
    });

    test('lessThan condition', () => {
      const condition = when('age').lessThan(65).build();
      expect(evaluateCondition(condition, { age: 25 })).toBe(true);
      expect(evaluateCondition(condition, { age: 70 })).toBe(false);
      expect(evaluateCondition(condition, { age: 65 })).toBe(false);
    });

    test('contains condition for strings', () => {
      const condition = when('name').contains('John').build();
      expect(evaluateCondition(condition, { name: 'John Doe' })).toBe(true);
      expect(evaluateCondition(condition, { name: 'Jane Smith' })).toBe(false);
    });

    test('contains condition for arrays', () => {
      const condition = when('products').contains('provident').build();
      expect(evaluateCondition(condition, { products: ['health', 'provident'] })).toBe(true);
      expect(evaluateCondition(condition, { products: ['health', 'auto'] })).toBe(false);
      expect(evaluateCondition(condition, { products: [] })).toBe(false);
    });

    test('notContains condition for arrays', () => {
      const condition = when('products').notContains('provident').build();
      expect(evaluateCondition(condition, { products: ['health', 'auto'] })).toBe(true);
      expect(evaluateCondition(condition, { products: ['health', 'provident'] })).toBe(false);
      expect(evaluateCondition(condition, { products: [] })).toBe(true);
    });

    test('in condition', () => {
      const condition = when('status').in(['active', 'pending']).build();
      expect(evaluateCondition(condition, { status: 'active' })).toBe(true);
      expect(evaluateCondition(condition, { status: 'pending' })).toBe(true);
      expect(evaluateCondition(condition, { status: 'inactive' })).toBe(false);
    });

    test('exists condition', () => {
      const condition = when('field1').exists().build();
      expect(evaluateCondition(condition, { field1: 'value' })).toBe(true);
      expect(evaluateCondition(condition, { field1: null })).toBe(false);
      expect(evaluateCondition(condition, {})).toBe(false);
    });
  });

  describe('Complex Conditions', () => {
    test('AND conditions', () => {
      const condition = when('age').greaterThan(18).and(when('status').equals('active')).build();

      expect(evaluateCondition(condition, { age: 25, status: 'active' })).toBe(true);
      expect(evaluateCondition(condition, { age: 15, status: 'active' })).toBe(false);
      expect(evaluateCondition(condition, { age: 25, status: 'inactive' })).toBe(false);
    });

    test('OR conditions', () => {
      const condition = when('type').equals('premium').or(when('age').greaterThan(65)).build();

      expect(evaluateCondition(condition, { type: 'premium', age: 30 })).toBe(true);
      expect(evaluateCondition(condition, { type: 'basic', age: 70 })).toBe(true);
      expect(evaluateCondition(condition, { type: 'basic', age: 30 })).toBe(false);
    });
  });

  describe('Nested Field Access', () => {
    test('nested object field access', () => {
      const condition = when('user.profile.age').greaterThan(18).build();
      const data = {
        user: {
          profile: {
            age: 25,
          },
        },
      };

      expect(evaluateCondition(condition, data)).toBe(true);
    });

    test('missing nested field', () => {
      const condition = when('user.profile.missing').exists().build();
      const data = {
        user: {
          profile: {
            age: 25,
          },
        },
      };

      expect(evaluateCondition(condition, data)).toBe(false);
    });

    test('step and field with identical names (persons.coveredPersons)', () => {
      // Common workflow pattern: step "persons" with field "coveredPersons"
      const condition = when('persons.coveredPersons').contains('spouse').build();
      const data = {
        persons: {
          coveredPersons: ['spouse', 'children'],
        },
      };

      expect(evaluateCondition(condition, data)).toBe(true);
    });

    test('step and field with exact same name (coveredPersons.coveredPersons)', () => {
      // Edge case: step "coveredPersons" with field "coveredPersons"
      // This is the problematic scenario mentioned by the user
      const condition = when('coveredPersons.coveredPersons').contains('spouse').build();
      const data = {
        coveredPersons: {
          coveredPersons: ['spouse', 'children'],
        },
      };

      expect(evaluateCondition(condition, data)).toBe(true);
      expect(
        evaluateCondition(condition, { coveredPersons: { coveredPersons: ['children'] } })
      ).toBe(false);
    });

    test('multiple levels of identical naming', () => {
      // Test the exact scenario from QuotePricingFlow
      const sirenCondition = when('siren.siren.value').equals('949140511').build();
      const sirenData = {
        siren: {
          siren: {
            value: '949140511',
            label: 'Lily SARL (75001)',
          },
        },
      };
      expect(evaluateCondition(sirenCondition, sirenData)).toBe(true);

      const legalFormCondition = when('legalForm.legalForm').equals('sarl').build();
      const legalFormData = {
        legalForm: {
          legalForm: 'sarl',
        },
      };
      expect(evaluateCondition(legalFormCondition, legalFormData)).toBe(true);
    });

    test('identical naming with flattened data (combined structure)', () => {
      // This tests the scenario where both nested and flattened keys exist
      // (as created by combineWorkflowDataForConditions)
      const condition = when('coveredPersons.coveredPersons').contains('spouse').build();
      const data = {
        // Both nested structure (original)
        coveredPersons: {
          coveredPersons: ['spouse', 'children'],
        },
        // AND flattened structure (for conditions)
        'coveredPersons.coveredPersons': ['spouse', 'children'],
      };

      expect(evaluateCondition(condition, data)).toBe(true);
    });
  });

  describe('Builder Pattern', () => {
    test('fluent API with method chaining', () => {
      const builder = when('field1').equals('value1');
      expect(builder).toBeDefined();

      const condition = builder.build();
      expect(condition.field).toBe('field1');
      expect(condition.operator).toBe('equals');
      expect(condition.value).toBe('value1');
    });

    test('evaluate directly from builder', () => {
      const result = when('field1').equals('value1').evaluate({ field1: 'value1' });
      expect(result).toBe(true);
    });
  });
});
