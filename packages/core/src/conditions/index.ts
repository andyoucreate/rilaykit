export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'contains'
  | 'notContains'
  | 'in'
  | 'notIn'
  | 'matches'
  | 'exists'
  | 'notExists';

export type LogicalOperator = 'and' | 'or';

export type ConditionValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export interface ConditionConfig {
  field: string;
  operator: ConditionOperator;
  value?: ConditionValue;
  conditions?: ConditionConfig[];
  logicalOperator?: LogicalOperator;
}

export type ConditionEvaluator = (data: Record<string, any>) => boolean;

export interface ConditionBuilder extends ConditionConfig {
  equals(value: ConditionValue): ConditionBuilder;
  notEquals(value: ConditionValue): ConditionBuilder;
  greaterThan(value: number): ConditionBuilder;
  lessThan(value: number): ConditionBuilder;
  greaterThanOrEqual(value: number): ConditionBuilder;
  lessThanOrEqual(value: number): ConditionBuilder;
  contains(value: string): ConditionBuilder;
  notContains(value: string): ConditionBuilder;
  in(values: Array<string | number | boolean>): ConditionBuilder;
  notIn(values: Array<string | number | boolean>): ConditionBuilder;
  matches(pattern: string | RegExp): ConditionBuilder;
  exists(): ConditionBuilder;
  notExists(): ConditionBuilder;
  and(condition: ConditionBuilder | ConditionConfig): ConditionBuilder;
  or(condition: ConditionBuilder | ConditionConfig): ConditionBuilder;
  build(): ConditionConfig;
  evaluate(data: Record<string, any>): boolean;
}

class ConditionBuilderImpl implements ConditionBuilder {
  public field: string;
  public operator: ConditionOperator;
  public value?: ConditionValue;
  public conditions?: ConditionConfig[];
  public logicalOperator?: LogicalOperator;

  constructor(field: string) {
    this.field = field;
    this.operator = 'exists';
    this.conditions = [];
  }

  equals(value: ConditionValue): ConditionBuilder {
    this.operator = 'equals';
    this.value = value;
    return this;
  }

  notEquals(value: ConditionValue): ConditionBuilder {
    this.operator = 'notEquals';
    this.value = value;
    return this;
  }

  greaterThan(value: number): ConditionBuilder {
    this.operator = 'greaterThan';
    this.value = value;
    return this;
  }

  lessThan(value: number): ConditionBuilder {
    this.operator = 'lessThan';
    this.value = value;
    return this;
  }

  greaterThanOrEqual(value: number): ConditionBuilder {
    this.operator = 'greaterThanOrEqual';
    this.value = value;
    return this;
  }

  lessThanOrEqual(value: number): ConditionBuilder {
    this.operator = 'lessThanOrEqual';
    this.value = value;
    return this;
  }

  contains(value: string): ConditionBuilder {
    this.operator = 'contains';
    this.value = value;
    return this;
  }

  notContains(value: string): ConditionBuilder {
    this.operator = 'notContains';
    this.value = value;
    return this;
  }

  in(values: Array<string | number | boolean>): ConditionBuilder {
    this.operator = 'in';
    this.value = values;
    return this;
  }

  notIn(values: Array<string | number | boolean>): ConditionBuilder {
    this.operator = 'notIn';
    this.value = values;
    return this;
  }

  matches(pattern: string | RegExp): ConditionBuilder {
    this.operator = 'matches';
    this.value = pattern instanceof RegExp ? pattern.source : pattern;
    return this;
  }

  exists(): ConditionBuilder {
    this.operator = 'exists';
    this.value = undefined;
    return this;
  }

  notExists(): ConditionBuilder {
    this.operator = 'notExists';
    this.value = undefined;
    return this;
  }

  and(condition: ConditionBuilder | ConditionConfig): ConditionBuilder {
    const newCondition = 'build' in condition ? condition.build() : condition;
    const currentConfig = {
      field: this.field,
      operator: this.operator,
      value: this.value,
      conditions: this.conditions,
      logicalOperator: this.logicalOperator,
    };

    this.field = '';
    this.operator = 'exists';
    this.value = undefined;
    this.conditions = [currentConfig, newCondition];
    this.logicalOperator = 'and';

    return this;
  }

  or(condition: ConditionBuilder | ConditionConfig): ConditionBuilder {
    const newCondition = 'build' in condition ? condition.build() : condition;
    const currentConfig = {
      field: this.field,
      operator: this.operator,
      value: this.value,
      conditions: this.conditions,
      logicalOperator: this.logicalOperator,
    };

    this.field = '';
    this.operator = 'exists';
    this.value = undefined;
    this.conditions = [currentConfig, newCondition];
    this.logicalOperator = 'or';

    return this;
  }

  build(): ConditionConfig {
    return {
      field: this.field,
      operator: this.operator,
      value: this.value,
      conditions: this.conditions,
      logicalOperator: this.logicalOperator,
    };
  }

  evaluate(data: Record<string, any>): boolean {
    return evaluateCondition(this, data);
  }
}

export function when(field: string): ConditionBuilder {
  return new ConditionBuilderImpl(field);
}

export function evaluateCondition(condition: ConditionConfig, data: Record<string, any>): boolean {
  if (condition.conditions && condition.conditions.length > 0) {
    const results = condition.conditions.map((c) => evaluateCondition(c, data));

    if (condition.logicalOperator === 'or') {
      return results.some((r) => r);
    }
    return results.every((r) => r);
  }

  const fieldValue = getFieldValue(data, condition.field);

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;

    case 'notEquals':
      return fieldValue !== condition.value;

    case 'greaterThan':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue > condition.value
      );

    case 'lessThan':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue < condition.value
      );

    case 'greaterThanOrEqual':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue >= condition.value
      );

    case 'lessThanOrEqual':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue <= condition.value
      );

    case 'contains':
      // Support for string contains
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue.includes(condition.value);
      }
      // Support for array contains
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(condition.value);
      }
      return false;

    case 'notContains':
      // Support for string notContains
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return !fieldValue.includes(condition.value);
      }
      // Support for array notContains
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(condition.value);
      }
      return false;

    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);

    case 'notIn':
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);

    case 'matches': {
      if (typeof fieldValue !== 'string' || typeof condition.value !== 'string') {
        return false;
      }
      const regex = new RegExp(condition.value);
      return regex.test(fieldValue);
    }
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;

    case 'notExists':
      return fieldValue === undefined || fieldValue === null;

    default:
      return false;
  }
}

function getFieldValue(data: Record<string, any>, fieldPath: string): any {
  const parts = fieldPath.split('.');
  let value: any = data;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }

  return value;
}

export type { ConditionBuilder as Condition };

// Re-export ConditionDependencyGraph
export { ConditionDependencyGraph } from './ConditionDependencyGraph';

// =================================================================
// DEPENDENCY EXTRACTION
// =================================================================

/**
 * Extracts all field paths that a condition depends on.
 *
 * This is useful for building a dependency graph that knows which
 * conditions need to be re-evaluated when a specific field changes.
 *
 * @param condition - The condition to extract dependencies from
 * @returns An array of unique field paths
 *
 * @example
 * ```ts
 * const condition = when('field1').equals('value').and(when('field2').exists());
 * const deps = extractConditionDependencies(condition.build());
 * // deps = ['field1', 'field2']
 *
 * const nestedCondition = when('step1.field1').equals('value');
 * const nestedDeps = extractConditionDependencies(nestedCondition.build());
 * // nestedDeps = ['step1.field1']
 * ```
 */
export function extractConditionDependencies(
  condition: ConditionConfig | ConditionBuilder | undefined | null
): string[] {
  if (!condition) {
    return [];
  }

  // Convert ConditionBuilder to ConditionConfig if needed
  const config: ConditionConfig = 'build' in condition ? condition.build() : condition;

  const dependencies = new Set<string>();

  function extractFromConfig(cfg: ConditionConfig): void {
    // Add the field from this condition (if not empty)
    if (cfg.field && cfg.field.trim() !== '') {
      dependencies.add(cfg.field);
    }

    // Recursively extract from nested conditions
    if (cfg.conditions && cfg.conditions.length > 0) {
      for (const nestedCondition of cfg.conditions) {
        extractFromConfig(nestedCondition);
      }
    }
  }

  extractFromConfig(config);

  return Array.from(dependencies);
}

/**
 * Extracts dependencies from multiple conditions (e.g., visible, disabled, required).
 *
 * @param behaviors - Object containing condition configurations
 * @returns An array of unique field paths from all conditions
 */
export function extractAllDependencies(
  behaviors: Record<string, ConditionConfig | ConditionBuilder | undefined | null>
): string[] {
  const allDependencies = new Set<string>();

  for (const condition of Object.values(behaviors)) {
    if (condition) {
      const deps = extractConditionDependencies(condition);
      for (const dep of deps) {
        allDependencies.add(dep);
      }
    }
  }

  return Array.from(allDependencies);
}
