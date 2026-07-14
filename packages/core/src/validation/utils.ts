/**
 * @fileoverview Clean validation utilities for Standard Schema
 *
 * This module provides utility functions for working with validation results
 * and managing validation contexts using Standard Schema exclusively.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FieldError, ValidationContext, ValidationResult } from '../types';

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
// SCHEMA COMBINATION
// =================================================================

type CombinedResult<T> = StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>;

/**
 * Runs a list of Standard Schemas as a pipeline over a single value.
 *
 * - Stays SYNCHRONOUS as long as no sub-schema returns a Promise, so a
 *   combination of purely-synchronous validators yields a plain result (never
 *   a Promise). It switches to an async path only once a sub-schema actually
 *   validates asynchronously.
 * - THREADS the value: each sub-schema validates the output of the previous
 *   successful one (pipe semantics), so coercions compose.
 * - ACCUMULATES issues from every sub-schema (issues never short-circuit the
 *   value threading), preserving the established combined error shape.
 */
export function runCombinedSchemas<T>(
  schemas: readonly StandardSchemaV1<T>[],
  value: unknown
): CombinedResult<T> {
  const allIssues: StandardSchemaV1.Issue[] = [];
  let currentValue = value;

  for (let index = 0; index < schemas.length; index++) {
    const result = schemas[index]['~standard'].validate(currentValue);

    if (result instanceof Promise) {
      return finishCombinedAsync(schemas, index, result, currentValue, allIssues);
    }

    if (result.issues) {
      allIssues.push(...result.issues);
    } else {
      currentValue = result.value;
    }
  }

  return allIssues.length > 0 ? { issues: allIssues } : { value: currentValue as T };
}

/**
 * Async continuation of {@link runCombinedSchemas}, entered only after a
 * sub-schema returned a Promise. Awaits the pending result then keeps threading
 * the value and accumulating issues across any remaining sub-schemas.
 */
async function finishCombinedAsync<T>(
  schemas: readonly StandardSchemaV1<T>[],
  pendingIndex: number,
  pending: Promise<StandardSchemaV1.Result<T>>,
  valueSoFar: unknown,
  issuesSoFar: StandardSchemaV1.Issue[]
): Promise<StandardSchemaV1.Result<T>> {
  const allIssues = [...issuesSoFar];
  let currentValue = valueSoFar;

  const applyResult = (result: StandardSchemaV1.Result<T>): void => {
    if (result.issues) {
      allIssues.push(...result.issues);
    } else {
      currentValue = result.value;
    }
  };

  applyResult(await pending);

  for (let index = pendingIndex + 1; index < schemas.length; index++) {
    const result = schemas[index]['~standard'].validate(currentValue);
    applyResult(result instanceof Promise ? await result : result);
  }

  return allIssues.length > 0 ? { issues: allIssues } : { value: currentValue as T };
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
  errors: FieldError[] = []
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
  const allErrors: FieldError[] = [];
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
