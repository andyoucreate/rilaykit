/**
 * @fileoverview Clean validation utilities for Standard Schema
 *
 * This module provides utility functions for working with validation results
 * and managing validation contexts using Standard Schema exclusively.
 */

import type { ValidationContext, ValidationError, ValidationResult } from '../types';

// =================================================================
// VALUE CHECKS
// =================================================================

/**
 * Checks whether a value is considered "empty" for validation purposes.
 *
 * Handles: `undefined`, `null`, empty string, whitespace-only string,
 * empty array, and empty plain object.
 *
 * @returns `true` if the value is empty
 */
export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

// =================================================================
// RESULT BUILDERS
// =================================================================

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
