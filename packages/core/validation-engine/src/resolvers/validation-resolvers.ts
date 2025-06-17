import type {
  FieldId,
  FormId,
  ValidationContext,
  ValidationResult,
  ValidatorFunction,
} from '@streamline/form-engine';
import { z } from 'zod';

/**
 * Validation resolver interface
 */
export interface ValidationResolver {
  readonly name: string;
  readonly version: string;
  resolve(schema: any, options?: any): ValidatorFunction;
  supports(schema: any): boolean;
}

/**
 * Resolver configuration
 */
export interface ResolverConfig {
  readonly defaultResolver?: string;
  readonly resolvers: Record<string, ValidationResolver>;
  readonly fallback?: ValidatorFunction;
}

/**
 * Validation resolver registry
 */
export class ValidationResolverRegistry {
  private resolvers = new Map<string, ValidationResolver>();
  private defaultResolver?: string;
  private fallbackValidator?: ValidatorFunction;

  constructor(config?: Partial<ResolverConfig>) {
    if (config?.resolvers) {
      for (const [name, resolver] of Object.entries(config.resolvers)) {
        this.register(name, resolver);
      }
    }

    this.defaultResolver = config?.defaultResolver;
    this.fallbackValidator = config?.fallback;
  }

  /**
   * Register a validation resolver
   */
  register(name: string, resolver: ValidationResolver): void {
    this.resolvers.set(name, resolver);
  }

  /**
   * Unregister a validation resolver
   */
  unregister(name: string): void {
    this.resolvers.delete(name);
  }

  /**
   * Get a validation resolver by name
   */
  get(name: string): ValidationResolver | undefined {
    return this.resolvers.get(name);
  }

  /**
   * Resolve a schema to a validator function
   */
  resolve(schema: any, resolverName?: string, options?: any): ValidatorFunction {
    // Try specific resolver first
    if (resolverName) {
      const resolver = this.resolvers.get(resolverName);
      if (resolver?.supports(schema)) {
        return resolver.resolve(schema, options);
      }
    }

    // Try default resolver
    if (this.defaultResolver) {
      const resolver = this.resolvers.get(this.defaultResolver);
      if (resolver?.supports(schema)) {
        return resolver.resolve(schema, options);
      }
    }

    // Try all resolvers
    for (const resolver of this.resolvers.values()) {
      if (resolver.supports(schema)) {
        return resolver.resolve(schema, options);
      }
    }

    // Use fallback if available
    if (this.fallbackValidator) {
      return this.fallbackValidator;
    }

    // No resolver found
    throw new Error(`No resolver found for schema type: ${typeof schema}`);
  }

  /**
   * Check if a schema can be resolved
   */
  canResolve(schema: any, resolverName?: string): boolean {
    try {
      this.resolve(schema, resolverName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all registered resolvers
   */
  getAll(): Record<string, ValidationResolver> {
    const result: Record<string, ValidationResolver> = {};
    for (const [name, resolver] of this.resolvers.entries()) {
      result[name] = resolver;
    }
    return result;
  }

  /**
   * Set default resolver
   */
  setDefault(resolverName: string): void {
    if (!this.resolvers.has(resolverName)) {
      throw new Error(`Resolver "${resolverName}" is not registered`);
    }
    this.defaultResolver = resolverName;
  }

  /**
   * Set fallback validator
   */
  setFallback(validator: ValidatorFunction): void {
    this.fallbackValidator = validator;
  }

  /**
   * Clear all resolvers
   */
  clear(): void {
    this.resolvers.clear();
    this.defaultResolver = undefined;
    this.fallbackValidator = undefined;
  }
}

/**
 * Zod schema resolver
 */
export class ZodResolver implements ValidationResolver {
  readonly name = 'zod';
  readonly version = '1.0.0';

  supports(schema: any): boolean {
    return schema instanceof z.ZodSchema || schema?._def !== undefined;
  }

  resolve(schema: z.ZodSchema, _options?: any): ValidatorFunction {
    return (value: any, _context: ValidationContext): ValidationResult => {
      try {
        schema.parse(value);
        return {
          isValid: true,
          errors: [],
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors = error.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            path: issue.path,
          }));

          return {
            isValid: false,
            errors,
          };
        }

        return {
          isValid: false,
          errors: [
            {
              code: 'unknown_error',
              message: error instanceof Error ? error.message : 'Unknown validation error',
            },
          ],
        };
      }
    };
  }
}

/**
 * JSON Schema resolver (basic implementation)
 */
export class JSONSchemaResolver implements ValidationResolver {
  readonly name = 'json-schema';
  readonly version = '1.0.0';

  supports(schema: any): boolean {
    return (
      schema &&
      typeof schema === 'object' &&
      (schema.type !== undefined || schema.properties !== undefined || schema.$schema !== undefined)
    );
  }

  resolve(schema: any, _options?: any): ValidatorFunction {
    return (value: any, _context: ValidationContext): ValidationResult => {
      // Basic JSON Schema validation
      const errors: any[] = [];

      if (schema.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== schema.type) {
          errors.push({
            code: 'invalid_type',
            message: `Expected ${schema.type}, got ${actualType}`,
          });
        }
      }

      if (schema.required && Array.isArray(schema.required)) {
        for (const requiredField of schema.required) {
          if (value[requiredField] === undefined || value[requiredField] === null) {
            errors.push({
              code: 'required',
              message: `Field "${requiredField}" is required`,
              path: [requiredField],
            });
          }
        }
      }

      if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) {
        errors.push({
          code: 'min_length',
          message: `Must be at least ${schema.minLength} characters long`,
        });
      }

      if (schema.maxLength && typeof value === 'string' && value.length > schema.maxLength) {
        errors.push({
          code: 'max_length',
          message: `Must be no more than ${schema.maxLength} characters long`,
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    };
  }
}

/**
 * Function-based resolver for custom validator functions
 */
export class FunctionResolver implements ValidationResolver {
  readonly name = 'function';
  readonly version = '1.0.0';

  supports(schema: any): boolean {
    return typeof schema === 'function';
  }

  resolve(schema: ValidatorFunction, _options?: any): ValidatorFunction {
    return schema;
  }
}

/**
 * Object-based resolver for validation configuration objects
 */
export class ObjectResolver implements ValidationResolver {
  readonly name = 'object';
  readonly version = '1.0.0';

  supports(schema: any): boolean {
    return (
      schema &&
      typeof schema === 'object' &&
      schema.validate &&
      typeof schema.validate === 'function'
    );
  }

  resolve(schema: { validate: ValidatorFunction }, _options?: any): ValidatorFunction {
    return schema.validate;
  }
}

/**
 * Create default resolver registry with built-in resolvers
 */
export function createDefaultResolverRegistry(): ValidationResolverRegistry {
  const registry = new ValidationResolverRegistry();

  // Register built-in resolvers
  registry.register('zod', new ZodResolver());
  registry.register('json-schema', new JSONSchemaResolver());
  registry.register('function', new FunctionResolver());
  registry.register('object', new ObjectResolver());

  // Set Zod as default resolver
  registry.setDefault('zod');

  return registry;
}

/**
 * Global resolver registry instance
 */
let globalRegistry: ValidationResolverRegistry | null = null;

/**
 * Get the global resolver registry
 */
export function getResolverRegistry(): ValidationResolverRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultResolverRegistry();
  }
  return globalRegistry;
}

/**
 * Resolve a schema using the global registry
 */
export function resolveSchema(
  schema: any,
  resolverName?: string,
  options?: any
): ValidatorFunction {
  return getResolverRegistry().resolve(schema, resolverName, options);
}

/**
 * Multi-schema resolver that can handle different schema types
 */
export class MultiSchemaResolver {
  private registry: ValidationResolverRegistry;

  constructor(registry?: ValidationResolverRegistry) {
    this.registry = registry || getResolverRegistry();
  }

  /**
   * Resolve multiple schemas for different fields
   */
  resolveFields(schemas: Record<FieldId, any>): Record<FieldId, ValidatorFunction> {
    const validators: Record<FieldId, ValidatorFunction> = {} as Record<FieldId, ValidatorFunction>;

    for (const [fieldId, schema] of Object.entries(schemas)) {
      validators[fieldId as FieldId] = this.registry.resolve(schema);
    }

    return validators;
  }

  /**
   * Resolve a form-level schema
   */
  resolveForm(_formId: FormId, schema: any): ValidatorFunction {
    return this.registry.resolve(schema);
  }

  /**
   * Create a composite validator from multiple schemas
   */
  createComposite(schemas: Record<string, any>): ValidatorFunction {
    const validators = Object.entries(schemas).map(([key, schema]) => ({
      key,
      validator: this.registry.resolve(schema),
    }));

    return async (value: any, context: ValidationContext): Promise<ValidationResult> => {
      const errors: any[] = [];
      const warnings: any[] = [];

      for (const { key, validator } of validators) {
        const fieldValue = typeof value === 'object' ? value[key] : value;
        const result = await validator(fieldValue, {
          ...context,
          fieldId: key as FieldId,
        });

        if (!result.isValid) {
          errors.push(
            ...result.errors.map((error) => ({
              ...error,
              path: [key, ...(error.path || [])],
            }))
          );
        }

        if (result.warnings) {
          warnings.push(
            ...result.warnings.map((warning) => ({
              ...warning,
              path: [key, ...(warning.path || [])],
            }))
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    };
  }
}
