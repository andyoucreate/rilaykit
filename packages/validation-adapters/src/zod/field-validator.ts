import type { FieldValidator, ValidationError, ValidationResult } from '@rilaykit/core';
import type { ZodValidatorOptions } from '../types';

// Conditional import to avoid runtime dependency when Zod is not installed
let z: any;
try {
  z = require('zod');
} catch {
  // Zod not installed - will throw helpful error when used
  z = null;
}

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Zod issues to Rilay validation errors
 */
const transformZodIssues = (issues: any[], options: ZodValidatorOptions): ValidationError[] => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;

  return issues.map((issue) => ({
    message: options.errorTransform ? options.errorTransform([issue]) : issue.message,
    code: issue.code || 'VALIDATION_ERROR',
    path: issue.path && issue.path.length > 0 ? pathFormatter(issue.path) : undefined,
  }));
};

/**
 * Creates a Rilay field validator from a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible field validator function
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { createZodValidator } from '@rilaykit/validation-adapters/zod';
 *
 * const emailValidator = createZodValidator(
 *   z.string().email('Please enter a valid email'),
 *   { parseMode: 'async' }
 * );
 *
 * const form = factory.form()
 *   .add({
 *     id: 'email',
 *     type: 'email',
 *     validation: {
 *       validators: [emailValidator]
 *     }
 *   });
 * ```
 */
export function createZodValidator<T = any>(
  schema: any, // ZodSchema<T> - using any to avoid hard dependency
  options: ZodValidatorOptions = {}
): FieldValidator<T> {
  // Check if Zod is available
  if (!z) {
    throw new Error(
      '@rilaykit/validation-adapters: Zod is required but not installed. ' +
        'Please install it with: npm install zod'
    );
  }

  // Validate that the schema is a Zod schema
  if (!schema || typeof schema.parse !== 'function') {
    throw new Error(
      '@rilaykit/validation-adapters: Invalid Zod schema provided. ' +
        'Expected a Zod schema with a parse method.'
    );
  }

  const { parseMode = 'sync', abortEarly = false } = options;

  return async (value: T, _context): Promise<ValidationResult> => {
    try {
      // Choose parsing method based on options
      if (parseMode === 'async') {
        await schema.parseAsync(value);
      } else {
        schema.parse(value);
      }

      return { isValid: true, errors: [] };
    } catch (error) {
      // Handle Zod validation errors
      if (error && typeof error === 'object' && 'issues' in error) {
        const zodError = error as any; // ZodError

        let issues = zodError.issues;

        // Apply abortEarly option
        if (abortEarly && issues.length > 0) {
          issues = [issues[0]];
        }

        const errors = transformZodIssues(issues, options);

        return { isValid: false, errors };
      }

      // Re-throw non-Zod errors
      throw error;
    }
  };
}

/**
 * Creates a Zod validator with predefined sync parsing mode
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration options (parseMode will be set to 'sync')
 * @returns A Rilay-compatible field validator function
 */
export function createZodSyncValidator<T = any>(
  schema: any,
  options: Omit<ZodValidatorOptions, 'parseMode'> = {}
): FieldValidator<T> {
  return createZodValidator(schema, { ...options, parseMode: 'sync' });
}

/**
 * Creates a Zod validator with predefined async parsing mode
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration options (parseMode will be set to 'async')
 * @returns A Rilay-compatible field validator function
 */
export function createZodAsyncValidator<T = any>(
  schema: any,
  options: Omit<ZodValidatorOptions, 'parseMode'> = {}
): FieldValidator<T> {
  return createZodValidator(schema, { ...options, parseMode: 'async' });
}
