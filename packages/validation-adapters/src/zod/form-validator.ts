import type { ValidationError, ValidationResult } from '@rilaykit/core';
import type { FormValidator, ZodValidatorOptions } from '../types';

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Zod issues to field-grouped validation errors
 */
const transformZodIssuesForForm = (
  issues: any[],
  options: ZodValidatorOptions
): Record<string, ValidationError[]> => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;
  const fieldErrors: Record<string, ValidationError[]> = {};

  issues.forEach((issue) => {
    const fieldPath = issue.path && issue.path.length > 0 ? pathFormatter(issue.path) : '_form'; // Form-level errors go to special '_form' key

    if (!fieldErrors[fieldPath]) {
      fieldErrors[fieldPath] = [];
    }

    fieldErrors[fieldPath].push({
      message: options.errorTransform ? options.errorTransform([issue]) : issue.message,
      code: issue.code || 'VALIDATION_ERROR',
      path: fieldPath !== '_form' ? fieldPath : undefined,
    });
  });

  return fieldErrors;
};

/**
 * Creates a Rilay form validator from a Zod schema
 *
 * @param schema - Zod object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible form validator function
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { createZodFormValidator } from '@rilaykit/validation-adapters/zod';
 *
 * const userSchema = z.object({
 *   email: z.string().email('Invalid email'),
 *   age: z.number().min(18, 'Must be 18 or older'),
 *   confirmPassword: z.string()
 * }).refine(data => data.password === data.confirmPassword, {
 *   message: "Passwords don't match",
 *   path: ["confirmPassword"]
 * });
 *
 * const formValidator = createZodFormValidator(userSchema);
 *
 * const form = factory.form()
 *   .setValidation({
 *     validators: [formValidator]
 *   });
 * ```
 */
export function createZodFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any, // ZodObject<any> - using any to avoid hard dependency
  options: ZodValidatorOptions = {}
): FormValidator<T> {
  // Validate that the schema is a Zod schema
  if (!schema || typeof schema.parse !== 'function') {
    throw new Error(
      '@rilaykit/validation-adapters: Invalid Zod schema provided. ' +
        'Expected a Zod schema with a parse method.'
    );
  }

  const { parseMode = 'sync', abortEarly = false } = options;

  return async (formData: T): Promise<ValidationResult> => {
    try {
      // Choose parsing method based on options
      if (parseMode === 'async') {
        await schema.parseAsync(formData);
      } else {
        schema.parse(formData);
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

        const fieldErrors = transformZodIssuesForForm(issues, options);

        // Convert to ValidationResult format
        // For form validation, we flatten field errors into a single errors array
        const allErrors: ValidationError[] = [];
        Object.entries(fieldErrors).forEach(([fieldPath, errors]) => {
          errors.forEach((error) => {
            allErrors.push({
              ...error,
              path: fieldPath !== '_form' ? fieldPath : undefined,
            });
          });
        });

        return { isValid: false, errors: allErrors };
      }

      // Re-throw non-Zod errors
      throw error;
    }
  };
}

/**
 * Creates a Zod form validator that returns field-grouped errors
 * This is useful when you need to know which fields have errors for UI purposes
 *
 * @param schema - Zod object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A function that returns field-grouped validation errors
 *
 * @example
 * ```typescript
 * const formValidator = createZodFormValidatorWithFieldErrors(userSchema);
 * const result = await formValidator(formData);
 *
 * if (!result.isValid) {
 *   console.log(result.fieldErrors.email); // Errors for email field
 *   console.log(result.fieldErrors.age);   // Errors for age field
 * }
 * ```
 */
export function createZodFormValidatorWithFieldErrors<
  T extends Record<string, any> = Record<string, any>,
>(
  schema: any,
  options: ZodValidatorOptions = {}
): (formData: T) => Promise<{
  isValid: boolean;
  fieldErrors: Record<string, ValidationError[]>;
  allErrors: ValidationError[];
}> {
  // Validate that the schema is a Zod schema
  if (!schema || typeof schema.parse !== 'function') {
    throw new Error(
      '@rilaykit/validation-adapters: Invalid Zod schema provided. ' +
        'Expected a Zod schema with a parse method.'
    );
  }

  const { parseMode = 'sync', abortEarly = false } = options;

  return async (formData: T) => {
    try {
      // Choose parsing method based on options
      if (parseMode === 'async') {
        await schema.parseAsync(formData);
      } else {
        schema.parse(formData);
      }

      return {
        isValid: true,
        fieldErrors: {},
        allErrors: [],
      };
    } catch (error) {
      // Handle Zod validation errors
      if (error && typeof error === 'object' && 'issues' in error) {
        const zodError = error as any; // ZodError

        let issues = zodError.issues;

        // Apply abortEarly option
        if (abortEarly && issues.length > 0) {
          issues = [issues[0]];
        }

        const fieldErrors = transformZodIssuesForForm(issues, options);

        // Flatten to allErrors array
        const allErrors: ValidationError[] = [];
        Object.entries(fieldErrors).forEach(([fieldPath, errors]) => {
          errors.forEach((error) => {
            allErrors.push({
              ...error,
              path: fieldPath !== '_form' ? fieldPath : undefined,
            });
          });
        });

        return {
          isValid: false,
          fieldErrors,
          allErrors,
        };
      }

      // Re-throw non-Zod errors
      throw error;
    }
  };
}

/**
 * Creates a sync Zod form validator
 */
export function createZodSyncFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<ZodValidatorOptions, 'parseMode'> = {}
): FormValidator<T> {
  return createZodFormValidator(schema, { ...options, parseMode: 'sync' });
}

/**
 * Creates an async Zod form validator
 */
export function createZodAsyncFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<ZodValidatorOptions, 'parseMode'> = {}
): FormValidator<T> {
  return createZodFormValidator(schema, { ...options, parseMode: 'async' });
}
