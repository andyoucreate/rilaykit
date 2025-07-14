/**
 * @fileoverview Validation utilities
 *
 * This module provides utility functions for working with validation results,
 * combining validators, and managing validation contexts.
 */

import type {
  FieldValidator,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from '../types';

/**
 * Creates a validation result object
 *
 * @param isValid - Whether the validation passed
 * @param errors - Array of validation errors (empty if valid)
 * @returns A complete ValidationResult object
 *
 * @example
 * ```typescript
 * const result = createValidationResult(false, [
 *   { message: 'Email is required', code: 'REQUIRED' }
 * ]);
 * ```
 */
export function createValidationResult(
  isValid: boolean,
  errors: ValidationError[] = []
): ValidationResult {
  return {
    isValid,
    errors: [...errors], // Clone to prevent mutation
  };
}

/**
 * Creates a successful validation result
 *
 * @returns A successful ValidationResult with no errors
 *
 * @example
 * ```typescript
 * const success = createSuccessResult();
 * ```
 */
export function createSuccessResult(): ValidationResult {
  return createValidationResult(true, []);
}

/**
 * Creates a failed validation result with a single error
 *
 * @param message - The error message
 * @param code - Optional error code
 * @param path - Optional field path
 * @returns A failed ValidationResult
 *
 * @example
 * ```typescript
 * const error = createErrorResult('Email is invalid', 'INVALID_EMAIL');
 * ```
 */
export function createErrorResult(message: string, code?: string, path?: string): ValidationResult {
  return createValidationResult(false, [{ message, code, path }]);
}

/**
 * Combines multiple validation results into a single result
 *
 * The combined result is valid only if all input results are valid.
 * All errors from all results are included in the combined result.
 *
 * @param results - Array of ValidationResult objects to combine
 * @returns A single ValidationResult combining all inputs
 *
 * @example
 * ```typescript
 * const combined = combineValidationResults([
 *   emailValidator(value),
 *   requiredValidator(value),
 *   minLengthValidator(value)
 * ]);
 * ```
 */
export function combineValidationResults(results: ValidationResult[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  let isValid = true;

  for (const result of results) {
    if (!result.isValid) {
      isValid = false;
    }
    allErrors.push(...result.errors);
  }

  return createValidationResult(isValid, allErrors);
}

/**
 * Runs multiple synchronous validators and combines their results
 *
 * @param validators - Array of validators to run
 * @param value - The value to validate
 * @param context - Validation context
 * @returns Combined validation result
 *
 * @example
 * ```typescript
 * const result = runValidators([
 *   required,
 *   email,
 *   minLength(5)
 * ], emailValue, context);
 * ```
 */
export function runValidators<T>(
  validators: FieldValidator<T>[],
  value: T,
  context: ValidationContext
): ValidationResult {
  const results = validators.map((validator) => {
    const result = validator(value, context);
    // Handle both sync and async validators (await if promise)
    if (result instanceof Promise) {
      throw new Error('Use runValidatorsAsync for async validators');
    }
    return result;
  });

  return combineValidationResults(results);
}

/**
 * Runs multiple asynchronous validators and combines their results
 *
 * @param validators - Array of validators to run (can be sync or async)
 * @param value - The value to validate
 * @param context - Validation context
 * @returns Promise resolving to combined validation result
 *
 * @example
 * ```typescript
 * const result = await runValidatorsAsync([
 *   required,
 *   email,
 *   checkEmailUnique  // async validator
 * ], emailValue, context);
 * ```
 */
export async function runValidatorsAsync<T>(
  validators: FieldValidator<T>[],
  value: T,
  context: ValidationContext
): Promise<ValidationResult> {
  const results = await Promise.all(validators.map((validator) => validator(value, context)));

  return combineValidationResults(results);
}

/**
 * Creates a validation context object
 *
 * @param options - Context configuration options
 * @returns A complete ValidationContext object
 *
 * @example
 * ```typescript
 * const context = createValidationContext({
 *   fieldId: 'email',
 *   formId: 'registration',
 *   allFormData: { email: 'test@example.com', name: 'John' }
 * });
 * ```
 */
export function createValidationContext(
  options: Partial<ValidationContext> = {}
): ValidationContext {
  return {
    fieldId: options.fieldId,
    formId: options.formId,
    stepId: options.stepId,
    workflowId: options.workflowId,
    allFormData: options.allFormData || {},
    stepData: options.stepData || {},
    workflowData: options.workflowData || {},
  };
}

/**
 * Debounces a validation function to prevent excessive calls
 *
 * @param validator - The validator function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced validator function
 *
 * @example
 * ```typescript
 * const debouncedValidator = debounceValidator(emailValidator, 300);
 * ```
 */
export function debounceValidator<T>(
  validator: FieldValidator<T>,
  delay: number
): FieldValidator<T> {
  let timeoutId: NodeJS.Timeout | null = null;

  return (value: T, context: ValidationContext): Promise<ValidationResult> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await validator(value, context);
          resolve(result);
        } catch (error) {
          const errorResult = createErrorResult(
            error instanceof Error ? error.message : 'Validation error',
            'VALIDATION_ERROR'
          );
          resolve(errorResult);
        }
      }, delay);
    });
  };
}
