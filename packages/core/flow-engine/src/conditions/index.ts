import { FieldId } from '@streamline/form-engine';
import type { NavigationCondition } from '../types/index';

/**
 * Mutable version of NavigationCondition for building
 */
type MutableNavigationCondition = {
  field?: FieldId;
  operator?: NavigationCondition['operator'];
  value?: any;
  logic?: 'and' | 'or';
  conditions?: NavigationCondition[];
};

/**
 * Condition evaluation utilities
 */
export class ConditionEvaluator {
  /**
   * Evaluate a single navigation condition
   */
  static evaluate(
    condition: NavigationCondition,
    data: Record<string, any>
  ): boolean {
    const fieldValue = condition.field ? data[condition.field] : undefined;

    let result = false;
    switch (condition.operator) {
      case 'equals':
        result = fieldValue === condition.value;
        break;
      case 'not_equals':
        result = fieldValue !== condition.value;
        break;
      case 'contains':
        result = String(fieldValue).includes(String(condition.value));
        break;
      case 'greater_than':
        result = Number(fieldValue) > Number(condition.value);
        break;
      case 'less_than':
        result = Number(fieldValue) < Number(condition.value);
        break;
      case 'exists':
        result = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        break;
    }

    // Handle nested conditions
    if (condition.conditions && condition.conditions.length > 0) {
      const conditionResults = condition.conditions.map(c => 
        ConditionEvaluator.evaluate(c, data)
      );
      
      if (condition.logic === 'or') {
        result = result || conditionResults.some(r => r);
      } else {
        result = result && conditionResults.every(r => r);
      }
    }

    return result;
  }

  /**
   * Evaluate multiple conditions with AND logic
   */
  static evaluateAll(
    conditions: NavigationCondition[],
    data: Record<string, any>
  ): boolean {
    return conditions.every(condition => 
      ConditionEvaluator.evaluate(condition, data)
    );
  }

  /**
   * Evaluate multiple conditions with OR logic
   */
  static evaluateAny(
    conditions: NavigationCondition[],
    data: Record<string, any>
  ): boolean {
    return conditions.some(condition => 
      ConditionEvaluator.evaluate(condition, data)
    );
  }
}

/**
 * Condition builder utilities
 */
export class ConditionBuilder {
  private condition: MutableNavigationCondition = {};

  /**
   * Set the field to evaluate
   */
  field(fieldId: FieldId): ConditionBuilder {
    this.condition.field = fieldId;
    return this;
  }

  /**
   * Set equals condition
   */
  equals(value: any): ConditionBuilder {
    this.condition.operator = 'equals';
    this.condition.value = value;
    return this;
  }

  /**
   * Set not equals condition
   */
  notEquals(value: any): ConditionBuilder {
    this.condition.operator = 'not_equals';
    this.condition.value = value;
    return this;
  }

  /**
   * Set contains condition
   */
  contains(value: string): ConditionBuilder {
    this.condition.operator = 'contains';
    this.condition.value = value;
    return this;
  }

  /**
   * Set greater than condition
   */
  greaterThan(value: number): ConditionBuilder {
    this.condition.operator = 'greater_than';
    this.condition.value = value;
    return this;
  }

  /**
   * Set less than condition
   */
  lessThan(value: number): ConditionBuilder {
    this.condition.operator = 'less_than';
    this.condition.value = value;
    return this;
  }

  /**
   * Set exists condition
   */
  exists(): ConditionBuilder {
    this.condition.operator = 'exists';
    return this;
  }

  /**
   * Add nested conditions with AND logic
   */
  and(...conditions: NavigationCondition[]): ConditionBuilder {
    this.condition.logic = 'and';
    this.condition.conditions = conditions;
    return this;
  }

  /**
   * Add nested conditions with OR logic
   */
  or(...conditions: NavigationCondition[]): ConditionBuilder {
    this.condition.logic = 'or';
    this.condition.conditions = conditions;
    return this;
  }

  /**
   * Build the final condition
   */
  build(): NavigationCondition {
    if (!this.condition.operator) {
      throw new Error('Condition operator is required');
    }
    return this.condition as NavigationCondition;
  }
}

/**
 * Factory function to create a condition builder
 */
export function createCondition(): ConditionBuilder {
  return new ConditionBuilder();
}

/**
 * Predefined condition factories
 */
export const Conditions = {
  /**
   * Create a field equals condition
   */
  fieldEquals: (fieldId: FieldId, value: any): NavigationCondition => 
    createCondition().field(fieldId).equals(value).build(),

  /**
   * Create a field not equals condition
   */
  fieldNotEquals: (fieldId: FieldId, value: any): NavigationCondition => 
    createCondition().field(fieldId).notEquals(value).build(),

  /**
   * Create a field exists condition
   */
  fieldExists: (fieldId: FieldId): NavigationCondition => 
    createCondition().field(fieldId).exists().build(),

  /**
   * Create a field contains condition
   */
  fieldContains: (fieldId: FieldId, value: string): NavigationCondition => 
    createCondition().field(fieldId).contains(value).build(),

  /**
   * Create a field greater than condition
   */
  fieldGreaterThan: (fieldId: FieldId, value: number): NavigationCondition => 
    createCondition().field(fieldId).greaterThan(value).build(),

  /**
   * Create a field less than condition
   */
  fieldLessThan: (fieldId: FieldId, value: number): NavigationCondition => 
    createCondition().field(fieldId).lessThan(value).build(),

  /**
   * Combine conditions with AND logic
   */
  and: (...conditions: NavigationCondition[]): NavigationCondition => ({
    operator: 'exists', // Dummy operator, actual evaluation done in nested conditions
    logic: 'and',
    conditions,
  }),

  /**
   * Combine conditions with OR logic
   */
  or: (...conditions: NavigationCondition[]): NavigationCondition => ({
    operator: 'exists', // Dummy operator, actual evaluation done in nested conditions
    logic: 'or',
    conditions,
  }),
}; 