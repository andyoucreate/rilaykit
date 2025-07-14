/**
 * @fileoverview Validation adapters for popular validation libraries
 *
 * This module provides adapters that integrate popular validation libraries
 * like Zod with Rilay's validation system. Adapters convert external schemas
 * into Rilay validators while maintaining type safety and error handling.
 */

import type { FieldValidator, FormValidator, ValidationAdapter, ValidationContext } from '../types';
import { createErrorResult, createSuccessResult } from './utils';

/**
 * Generic schema interface that Zod and similar libraries implement
 */
interface ZodLikeSchema<T = any> {
  parse(value: unknown): T;
  safeParse(
    value: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { errors: Array<{ message: string; path: (string | number)[] }> } };
}

/**
 * Zod validation adapter that converts Zod schemas into Rilay validators
 *
 * This adapter provides seamless integration with Zod schemas, automatically
 * converting Zod validation errors into Rilay ValidationError objects while
 * preserving error messages and field paths.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { createZodAdapter } from '@rilaykit/core';
 *
 * const zodAdapter = createZodAdapter();
 * const emailValidator = zodAdapter.createFieldValidator(
 *   z.string().email('Invalid email format')
 * );
 * ```
 */
export class ZodValidationAdapter implements ValidationAdapter<ZodLikeSchema> {
  readonly name = 'ZodValidationAdapter';
  readonly version = '1.0.0';

  /**
   * Creates a field validator from a Zod schema
   *
   * @param schema - The Zod schema to convert
   * @returns A FieldValidator function compatible with Rilay
   *
   * @example
   * ```typescript
   * const emailSchema = z.string().email();
   * const validator = adapter.createFieldValidator(emailSchema);
   * ```
   */
  createFieldValidator<T>(schema: ZodLikeSchema<T>): FieldValidator<T> {
    return (value: T, _context: ValidationContext): ReturnType<FieldValidator> => {
      try {
        const result = schema.safeParse(value);

        if (!result.success) {
          const errors = result.error.errors.map((err) => ({
            message: err.message,
            code: 'VALIDATION_ERROR',
            path: err.path.join('.'),
          }));

          return {
            isValid: false,
            errors,
          };
        }

        return createSuccessResult();
      } catch (error) {
        return createErrorResult(
          error instanceof Error ? error.message : 'Validation failed',
          'VALIDATION_ERROR'
        );
      }
    };
  }

  /**
   * Creates a form validator from a Zod object schema
   *
   * @param schema - The Zod object schema to convert
   * @returns A FormValidator function compatible with Rilay
   *
   * @example
   * ```typescript
   * const formSchema = z.object({
   *   email: z.string().email(),
   *   password: z.string().min(8)
   * });
   * const validator = adapter.createFormValidator(formSchema);
   * ```
   */
  createFormValidator<T>(schema: ZodLikeSchema<T>): FormValidator<T> {
    return (formData: T, _context: ValidationContext): ReturnType<FormValidator> => {
      try {
        const result = schema.safeParse(formData);

        if (!result.success) {
          const errors = result.error.errors.map((err) => ({
            message: err.message,
            code: 'VALIDATION_ERROR',
            path: err.path.join('.'),
          }));

          return {
            isValid: false,
            errors,
          };
        }

        return createSuccessResult();
      } catch (error) {
        return createErrorResult(
          error instanceof Error ? error.message : 'Form validation failed',
          'VALIDATION_ERROR'
        );
      }
    };
  }
}

/**
 * Creates a new Zod validation adapter instance
 *
 * @returns A configured ZodValidationAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createZodAdapter();
 * ```
 */
export function createZodAdapter(): ZodValidationAdapter {
  return new ZodValidationAdapter();
}

/**
 * Helper function to create a field validator directly from a Zod schema
 *
 * This is a convenience function that creates an adapter and field validator
 * in a single call, useful for simple use cases.
 *
 * @param schema - The Zod schema to convert
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { zodFieldValidator } from '@rilaykit/core';
 *
 * const emailValidator = zodFieldValidator(z.string().email());
 * ```
 */
export function zodFieldValidator<T>(schema: ZodLikeSchema<T>): FieldValidator<T> {
  const adapter = createZodAdapter();
  return adapter.createFieldValidator(schema);
}

/**
 * Helper function to create a form validator directly from a Zod schema
 *
 * @param schema - The Zod object schema to convert
 * @returns A FormValidator function
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { zodFormValidator } from '@rilaykit/core';
 *
 * const formValidator = zodFormValidator(z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8)
 * }));
 * ```
 */
export function zodFormValidator<T>(schema: ZodLikeSchema<T>): FormValidator<T> {
  const adapter = createZodAdapter();
  return adapter.createFormValidator(schema);
}
