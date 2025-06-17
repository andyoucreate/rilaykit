import type {
  FieldId,
  ValidationContext,
  ValidationResult,
  ValidatorFunction,
} from '@streamline/form-engine';

/**
 * Validation levels in hierarchical order
 */
export enum ValidationLevel {
  FIELD = 1,
  GROUP = 2,
  PAGE = 3,
  FLOW = 4,
  GLOBAL = 5,
}

/**
 * Validation layer configuration
 */
export interface ValidationLayer {
  id: string;
  level: ValidationLevel;
  priority: number;
  validator: ValidatorFunction | AsyncValidatorFunction;
  async?: boolean;
  stopOnError?: boolean;
  dependencies?: FieldId[];
  fieldId?: FieldId;
  groupId?: string;
  pageId?: string;
  conditions?: ValidationCondition[];
  metadata?: Record<string, any>;
}

/**
 * Async validator function type
 */
export type AsyncValidatorFunction = (
  value: any,
  context: ValidationContext
) => Promise<ValidationResult>;

/**
 * Validation condition for conditional validation
 */
export interface ValidationCondition {
  field: FieldId;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'exists'
    | 'not_exists';
  value?: any;
}

/**
 * Validation layer builder for fluent API
 */
export class ValidationLayerBuilder {
  private layer: Partial<ValidationLayer> = {};

  constructor(id: string, level: ValidationLevel) {
    this.layer.id = id;
    this.layer.level = level;
    this.layer.priority = 0;
  }

  /**
   * Set validation priority (lower = higher priority)
   */
  priority(priority: number): this {
    this.layer.priority = priority;
    return this;
  }

  /**
   * Set the validator function
   */
  validator(validator: ValidatorFunction | AsyncValidatorFunction, async = false): this {
    this.layer.validator = validator;
    this.layer.async = async;
    return this;
  }

  /**
   * Set async validator function
   */
  asyncValidator(validator: AsyncValidatorFunction): this {
    this.layer.validator = validator;
    this.layer.async = true;
    return this;
  }

  /**
   * Configure to stop on first error
   */
  stopOnError(stop = true): this {
    this.layer.stopOnError = stop;
    return this;
  }

  /**
   * Set field dependencies
   */
  dependsOn(...fieldIds: FieldId[]): this {
    this.layer.dependencies = fieldIds;
    return this;
  }

  /**
   * Set target field ID (for field-level validation)
   */
  forField(fieldId: FieldId): this {
    this.layer.fieldId = fieldId;
    return this;
  }

  /**
   * Set target group ID (for group-level validation)
   */
  forGroup(groupId: string): this {
    this.layer.groupId = groupId;
    return this;
  }

  /**
   * Set target page ID (for page-level validation)
   */
  forPage(pageId: string): this {
    this.layer.pageId = pageId;
    return this;
  }

  /**
   * Add validation conditions
   */
  when(...conditions: ValidationCondition[]): this {
    this.layer.conditions = conditions;
    return this;
  }

  /**
   * Add metadata
   */
  metadata(metadata: Record<string, any>): this {
    this.layer.metadata = metadata;
    return this;
  }

  /**
   * Build the validation layer
   */
  build(): ValidationLayer {
    if (!this.layer.validator) {
      throw new Error('Validator function is required');
    }

    return this.layer as ValidationLayer;
  }
}

/**
 * Create a field-level validation layer
 */
export function createFieldLayer(id: string): ValidationLayerBuilder {
  return new ValidationLayerBuilder(id, ValidationLevel.FIELD);
}

/**
 * Create a group-level validation layer
 */
export function createGroupLayer(id: string): ValidationLayerBuilder {
  return new ValidationLayerBuilder(id, ValidationLevel.GROUP);
}

/**
 * Create a page-level validation layer
 */
export function createPageLayer(id: string): ValidationLayerBuilder {
  return new ValidationLayerBuilder(id, ValidationLevel.PAGE);
}

/**
 * Create a flow-level validation layer
 */
export function createFlowLayer(id: string): ValidationLayerBuilder {
  return new ValidationLayerBuilder(id, ValidationLevel.FLOW);
}

/**
 * Create a global validation layer
 */
export function createGlobalLayer(id: string): ValidationLayerBuilder {
  return new ValidationLayerBuilder(id, ValidationLevel.GLOBAL);
}

/**
 * Evaluate validation conditions
 */
export function evaluateConditions(
  conditions: ValidationCondition[],
  formData: Record<string, any>
): boolean {
  return conditions.every((condition) => {
    const fieldValue = formData[condition.field];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
      case 'not_contains':
        return typeof fieldValue === 'string' && !fieldValue.includes(condition.value);
      case 'greater_than':
        return typeof fieldValue === 'number' && fieldValue > condition.value;
      case 'less_than':
        return typeof fieldValue === 'number' && fieldValue < condition.value;
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null || fieldValue === '';
      default:
        return false;
    }
  });
}

/**
 * Validation layer registry for managing layers
 */
export class ValidationLayerRegistry {
  private layers = new Map<string, ValidationLayer>();

  /**
   * Register a validation layer
   */
  register(layer: ValidationLayer): void {
    this.layers.set(layer.id, layer);
  }

  /**
   * Unregister a validation layer
   */
  unregister(layerId: string): void {
    this.layers.delete(layerId);
  }

  /**
   * Get a validation layer by ID
   */
  get(layerId: string): ValidationLayer | undefined {
    return this.layers.get(layerId);
  }

  /**
   * Get all layers for a specific level
   */
  getByLevel(level: ValidationLevel): ValidationLayer[] {
    return Array.from(this.layers.values())
      .filter((layer) => layer.level === level)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get all layers
   */
  getAll(): ValidationLayer[] {
    return Array.from(this.layers.values()).sort(
      (a, b) => a.level - b.level || a.priority - b.priority
    );
  }

  /**
   * Clear all layers
   */
  clear(): void {
    this.layers.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    byLevel: Record<ValidationLevel, number>;
  } {
    const byLevel = {} as Record<ValidationLevel, number>;

    for (const level of Object.values(ValidationLevel)) {
      if (typeof level === 'number') {
        byLevel[level] = 0;
      }
    }

    for (const layer of this.layers.values()) {
      byLevel[layer.level]++;
    }

    return {
      total: this.layers.size,
      byLevel,
    };
  }
}
