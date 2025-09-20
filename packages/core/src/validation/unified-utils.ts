/**
 * Unified validation utilities for Standard Schema only
 * These replace the old validator-based system with a clean Standard Schema approach
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
  FieldValidationConfig,
  FormValidationConfig,
  StandardSchema,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from '../types';
// =================================================================
// STANDARD SCHEMA CORE FUNCTIONS
// =================================================================

/**
 * Checks if a value implements the Standard Schema interface
 */
export function isStandardSchema(value: any): value is StandardSchema {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    '~standard' in value &&
    value['~standard'] !== null &&
    typeof value['~standard'] === 'object' &&
    value['~standard'].version === 1 &&
    typeof value['~standard'].vendor === 'string' &&
    typeof value['~standard'].validate === 'function'
  );
}

/**
 * Validates a value using a Standard Schema
 */
export async function validateWithStandardSchema<T extends StandardSchema>(
  schema: T,
  value: unknown
): Promise<ValidationResult> {
  if (!isStandardSchema(schema)) {
    throw new Error('Invalid Standard Schema: missing ~standard property or invalid structure');
  }

  try {
    let result = schema['~standard'].validate(value);

    // Handle async validation
    if (result instanceof Promise) {
      result = await result;
    }

    // Check if validation failed
    if (result.issues) {
      const errors: ValidationError[] = result.issues.map((issue) => ({
        message: issue.message,
        code: 'VALIDATION_ERROR',
        path: formatIssuePath(issue.path),
      }));

      return {
        isValid: false,
        errors,
      };
    }

    // Validation succeeded
    return {
      isValid: true,
      errors: [],
      value: result.value,
    };
  } catch (error) {
    // Handle any unexpected errors
    return {
      isValid: false,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Validation failed',
          code: 'VALIDATION_ERROR',
        },
      ],
    };
  }
}

/**
 * Format Standard Schema issue path to a string
 */
function formatIssuePath(
  path: readonly (PropertyKey | StandardSchemaV1.PathSegment)[] | undefined
): string | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  return path
    .map((segment) => {
      if (typeof segment === 'object' && 'key' in segment) {
        return String(segment.key);
      }
      return String(segment);
    })
    .join('.');
}

/**
 * Utility to extract input type from Standard Schema at runtime (for debugging)
 */
export function getSchemaInfo(schema: StandardSchema): {
  vendor: string;
  version: number;
  hasTypes: boolean;
} {
  if (!isStandardSchema(schema)) {
    throw new Error('Invalid Standard Schema');
  }

  return {
    vendor: schema['~standard'].vendor,
    version: schema['~standard'].version,
    hasTypes: Boolean(schema['~standard'].types),
  };
}

/**
 * Type guard to check if a schema has type information
 */
export function hasSchemaTypes<T extends StandardSchema>(
  schema: T
): schema is T & { '~standard': { types: NonNullable<T['~standard']['types']> } } {
  return isStandardSchema(schema) && Boolean(schema['~standard'].types);
}

// =================================================================
// UNIFIED VALIDATION SYSTEM
// =================================================================

/**
 * Validates a value using unified validation config
 * Handles single schemas, arrays of schemas, and combines results
 */
export async function validateWithUnifiedConfig<T>(
  config: FieldValidationConfig<T>,
  value: T,
  _context: ValidationContext
): Promise<ValidationResult> {
  if (!config.validate) {
    return { isValid: true, errors: [] };
  }

  const schemas = Array.isArray(config.validate) ? config.validate : [config.validate];
  const allErrors: ValidationError[] = [];

  for (const schema of schemas) {
    if (!isStandardSchema(schema)) {
      allErrors.push({
        message: 'Invalid validation rule: must implement Standard Schema interface',
        code: 'INVALID_SCHEMA',
      });
      continue;
    }

    try {
      const result = await validateWithStandardSchema(schema as StandardSchema, value);

      if (!result.isValid) {
        allErrors.push(...result.errors);
      }
    } catch (error) {
      allErrors.push({
        message: error instanceof Error ? error.message : 'Validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Validates form data using unified validation config
 */
export async function validateFormWithUnifiedConfig<T extends Record<string, any>>(
  config: FormValidationConfig<T>,
  formData: T,
  _context: ValidationContext
): Promise<ValidationResult> {
  if (!config.validate) {
    return { isValid: true, errors: [] };
  }

  const schemas = Array.isArray(config.validate) ? config.validate : [config.validate];
  const allErrors: ValidationError[] = [];

  for (const schema of schemas) {
    if (!isStandardSchema(schema)) {
      allErrors.push({
        message: 'Invalid validation rule: must implement Standard Schema interface',
        code: 'INVALID_SCHEMA',
      });
      continue;
    }

    try {
      const result = await validateWithStandardSchema(schema as StandardSchema, formData);

      if (!result.isValid) {
        allErrors.push(...result.errors);
      }
    } catch (error) {
      allErrors.push({
        message: error instanceof Error ? error.message : 'Form validation error',
        code: 'FORM_VALIDATION_ERROR',
      });
    }
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Checks if a field validation config has any validation rules
 */
export function hasUnifiedValidation(
  config: FieldValidationConfig | FormValidationConfig
): boolean {
  return Boolean(config.validate);
}

/**
 * Combines multiple Standard Schemas into a single schema
 * This is useful for combining built-in validators with external schemas
 */
export function combineSchemas<T>(...schemas: StandardSchemaV1<T>[]): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit-combined',
      validate: async (value: unknown) => {
        const allIssues: StandardSchemaV1.Issue[] = [];
        let finalValue = value;

        for (const schema of schemas) {
          let result = schema['~standard'].validate(value);

          // Handle async validation
          if (result instanceof Promise) {
            result = await result;
          }

          if (result.issues) {
            allIssues.push(...result.issues);
          } else {
            finalValue = result.value;
          }
        }

        return allIssues.length > 0 ? { issues: allIssues } : { value: finalValue as T };
      },
    },
  };
}

// contextAware function removed - use form-level validation for context-dependent validation

/**
 * Utility to create a Standard Schema from any validation function
 * This helps migrate existing validators to Standard Schema
 */
export function createStandardValidator<T>(
  validateFn: (
    value: T,
    context?: ValidationContext
  ) => ValidationResult | Promise<ValidationResult>,
  vendor = 'rilaykit'
): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: async (value: unknown) => {
        try {
          const result = await validateFn(value as T, {});

          if (result.isValid) {
            return { value: value as T };
          }

          const issues = result.errors.map((error) => ({
            message: error.message,
            path: error.path ? [error.path] : undefined,
          }));
          return { issues };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : 'Validation failed',
              },
            ],
          };
        }
      },
    },
  };
}

/**
 * Type guard to check if value is a Standard Schema or array of Standard Schemas
 */
export function isValidationRule(value: any): value is StandardSchema | StandardSchema[] {
  if (Array.isArray(value)) {
    return value.every(isStandardSchema);
  }
  return isStandardSchema(value);
}

/**
 * Normalizes validation config to always return an array of Standard Schemas
 */
export function normalizeValidationRules<T>(
  validate: StandardSchema<T> | StandardSchema<T>[] | undefined
): StandardSchema<T>[] {
  if (!validate) {
    return [];
  }

  if (Array.isArray(validate)) {
    return validate;
  }

  return [validate];
}
