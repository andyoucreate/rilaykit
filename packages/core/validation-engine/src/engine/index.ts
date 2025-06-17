import type { FieldId, FormId, ValidationContext, ValidationResult } from '@streamline/form-engine';
import { ValidationCache } from '../cache';
import { type ValidationLayer, ValidationLevel } from '../layers';

/**
 * Core validation engine implementing hierarchical validation system
 * Supports Field → Group → Page → Flow → Global validation levels
 */
export class ValidationEngine {
  private layers = new Map<string, ValidationLayer[]>();
  private cache: ValidationCache;
  private pendingValidations = new Map<string, Promise<ValidationResult>>();
  private middleware: ValidationMiddleware[] = [];

  constructor(options: ValidationEngineOptions = {}) {
    this.cache = new ValidationCache({ maxSize: options.cacheSize });
  }

  /**
   * Add a validation layer to the engine
   */
  addLayer(formId: FormId, layer: ValidationLayer): void {
    const formLayers = this.layers.get(formId) || [];
    formLayers.push(layer);

    // Sort by level first, then by priority
    formLayers.sort((a, b) => a.level - b.level || a.priority - b.priority);
    this.layers.set(formId, formLayers);
  }

  /**
   * Remove a validation layer
   */
  removeLayer(formId: FormId, layerId: string): void {
    const formLayers = this.layers.get(formId);
    if (formLayers) {
      const filtered = formLayers.filter((layer) => layer.id !== layerId);
      this.layers.set(formId, filtered);
    }
  }

  /**
   * Add validation middleware
   */
  use(middleware: ValidationMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Validate a single field
   */
  async validateField(
    formId: FormId,
    fieldId: FieldId,
    value: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const cacheKey = this.cache.generateKey(formId, fieldId, value);

    // Check cache first
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Check if validation is already pending
    const pendingKey = `${formId}:${fieldId}`;
    if (this.pendingValidations.has(pendingKey)) {
      return this.pendingValidations.get(pendingKey)!;
    }

    // Perform validation
    const validationPromise = this.performFieldValidation(formId, fieldId, value, context);
    this.pendingValidations.set(pendingKey, validationPromise);

    try {
      const result = await validationPromise;
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.pendingValidations.delete(pendingKey);
    }
  }

  /**
   * Validate a group of fields
   */
  async validateGroup(
    formId: FormId,
    fieldIds: FieldId[],
    values: Record<string, any>,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    // First validate individual fields
    for (const fieldId of fieldIds) {
      const fieldResult = await this.validateField(formId, fieldId, values[fieldId], context);
      results.push(fieldResult);
    }

    // Then validate group-level rules
    const groupResults = await this.performGroupValidation(formId, fieldIds, values, context);
    results.push(...groupResults);

    return this.combineResults(results);
  }

  /**
   * Validate entire form
   */
  async validateForm(
    formId: FormId,
    data: Record<string, any>,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const layers = this.layers.get(formId) || [];
    const results: ValidationResult[] = [];

    // Execute all validation layers
    for (const layer of layers) {
      const result = await this.executeLayer(layer, data, context);
      results.push(result);

      // Stop on first error if configured
      if (!result.isValid && layer.stopOnError) {
        break;
      }
    }

    return this.combineResults(results);
  }

  /**
   * Clear validation cache
   */
  clearCache(formId?: FormId): void {
    if (formId) {
      this.cache.clearForm(formId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get validation statistics
   */
  getStats(): ValidationStats {
    return {
      cacheSize: this.cache.size,
      pendingValidations: this.pendingValidations.size,
      registeredLayers: this.layers.size,
      middleware: this.middleware.length,
    };
  }

  private async performFieldValidation(
    formId: FormId,
    fieldId: FieldId,
    value: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const layers = this.layers.get(formId) || [];
    const fieldLayers = layers.filter(
      (layer) =>
        layer.level === ValidationLevel.FIELD && (!layer.fieldId || layer.fieldId === fieldId)
    );

    const results: ValidationResult[] = [];

    for (const layer of fieldLayers) {
      const result = await this.executeLayer(layer, value, context);
      results.push(result);

      // Stop on first error for field-level validation
      if (!result.isValid && layer.stopOnError !== false) {
        break;
      }
    }

    return this.combineResults(results);
  }

  private async performGroupValidation(
    formId: FormId,
    fieldIds: FieldId[],
    values: Record<string, any>,
    context: ValidationContext
  ): Promise<ValidationResult[]> {
    const layers = this.layers.get(formId) || [];
    const groupLayers = layers.filter(
      (layer) =>
        layer.level === ValidationLevel.GROUP &&
        layer.dependencies?.some((dep: FieldId) => fieldIds.includes(dep))
    );

    const results: ValidationResult[] = [];

    for (const layer of groupLayers) {
      const result = await this.executeLayer(layer, values, context);
      results.push(result);
    }

    return results;
  }

  private async executeLayer(
    layer: ValidationLayer,
    value: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    // Apply middleware
    let result: ValidationResult;

    try {
      // Execute middleware chain
      const middlewareContext = {
        layer,
        value,
        context,
      };

      await this.executeMiddleware(middlewareContext);

      // Execute the actual validator
      if (layer.async) {
        result = await layer.validator(value, context);
      } else {
        result = layer.validator(value, context) as ValidationResult;
      }
    } catch (error) {
      result = {
        isValid: false,
        errors: [
          {
            code: 'validation_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }

    return result;
  }

  private async executeMiddleware(context: ValidationMiddlewareContext): Promise<void> {
    for (const middleware of this.middleware) {
      await middleware(context);
    }
  }

  private combineResults(results: ValidationResult[]): ValidationResult {
    const errors = results.flatMap((r) => r.errors);
    const warnings = results.flatMap((r) => r.warnings || []);

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Destroy the validation engine and clean up resources
   */
  destroy(): void {
    this.layers.clear();
    this.cache.clear();
    this.pendingValidations.clear();
    this.middleware.length = 0;
  }
}

// Types and interfaces
export interface ValidationEngineOptions {
  cacheSize?: number;
  defaultTimeout?: number;
}

export interface ValidationStats {
  cacheSize: number;
  pendingValidations: number;
  registeredLayers: number;
  middleware: number;
}

export interface ValidationMiddlewareContext {
  layer: ValidationLayer;
  value: any;
  context: ValidationContext;
}

export type ValidationMiddleware = (context: ValidationMiddlewareContext) => Promise<void> | void;

// Singleton instance
let globalValidationEngine: ValidationEngine | null = null;

/**
 * Get the global validation engine instance
 */
export function getValidationEngine(): ValidationEngine {
  if (!globalValidationEngine) {
    globalValidationEngine = new ValidationEngine();
  }
  return globalValidationEngine;
}

/**
 * Create a new validation engine instance
 */
export function createValidationEngine(options?: ValidationEngineOptions): ValidationEngine {
  return new ValidationEngine(options);
}
