/**
 * @fileoverview Built-in validators
 *
 * This module provides a comprehensive set of built-in validators for common
 * validation scenarios. These validators follow the FieldValidator interface
 * and can be used standalone or combined with other validators.
 */

import type { FieldValidator, ValidationContext, ValidationResult } from '../types';
import { createErrorResult, createSuccessResult } from './utils';

/**
 * Validates that a value is not empty, null, or undefined
 *
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const nameValidator = required('Name is required');
 * ```
 */
export function required(message = 'This field is required'): FieldValidator {
  return (value: any): ReturnType<FieldValidator> => {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return createErrorResult(message, 'REQUIRED');
    }
    return createSuccessResult();
  };
}

/**
 * Validates minimum string length
 *
 * @param min - Minimum length required
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const passwordValidator = minLength(8, 'Password must be at least 8 characters');
 * ```
 */
export function minLength(min: number, message?: string): FieldValidator<string> {
  return (value: string): ReturnType<FieldValidator> => {
    if (!value || value.length < min) {
      return createErrorResult(
        message || `Must be at least ${min} characters long`,
        'MIN_LENGTH',
        `length.${min}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Validates maximum string length
 *
 * @param max - Maximum length allowed
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const bioValidator = maxLength(500, 'Bio must be under 500 characters');
 * ```
 */
export function maxLength(max: number, message?: string): FieldValidator<string> {
  return (value: string): ReturnType<FieldValidator> => {
    if (value && value.length > max) {
      return createErrorResult(
        message || `Must be no more than ${max} characters long`,
        'MAX_LENGTH',
        `length.${max}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Validates that a string matches a regular expression pattern
 *
 * @param regex - The regular expression pattern
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const phoneValidator = pattern(/^\d{3}-\d{3}-\d{4}$/, 'Invalid phone format');
 * ```
 */
export function pattern(regex: RegExp, message?: string): FieldValidator<string> {
  return (value: string): ReturnType<FieldValidator> => {
    if (value && !regex.test(value)) {
      return createErrorResult(
        message || 'Invalid format',
        'PATTERN_MISMATCH',
        `pattern.${regex.source}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Email validation using a comprehensive regex pattern
 *
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const emailValidator = email('Please enter a valid email address');
 * ```
 */
export function email(message = 'Please enter a valid email address'): FieldValidator<string> {
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return (value: string): ReturnType<FieldValidator> => {
    if (value && !emailRegex.test(value)) {
      return createErrorResult(message, 'INVALID_EMAIL');
    }
    return createSuccessResult();
  };
}

/**
 * URL validation using a comprehensive regex pattern
 *
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const websiteValidator = url('Please enter a valid URL');
 * ```
 */
export function url(message = 'Please enter a valid URL'): FieldValidator<string> {
  const urlRegex =
    /^https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?$/;

  return (value: string): ReturnType<FieldValidator> => {
    if (value && !urlRegex.test(value)) {
      return createErrorResult(message, 'INVALID_URL');
    }
    return createSuccessResult();
  };
}

/**
 * Validates that a value is a valid number
 *
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const ageValidator = number('Age must be a valid number');
 * ```
 */
export function number(message = 'Must be a valid number'): FieldValidator<string | number> {
  return (value: string | number): ReturnType<FieldValidator> => {
    const numValue = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
      return createErrorResult(message, 'INVALID_NUMBER');
    }
    return createSuccessResult();
  };
}

/**
 * Validates minimum numeric value
 *
 * @param minValue - Minimum value allowed
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const ageValidator = min(18, 'Must be at least 18 years old');
 * ```
 */
export function min(minValue: number, message?: string): FieldValidator<string | number> {
  return (value: string | number): ReturnType<FieldValidator> => {
    const numValue = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isNaN(numValue) && numValue < minValue) {
      return createErrorResult(
        message || `Must be at least ${minValue}`,
        'MIN_VALUE',
        `min.${minValue}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Validates maximum numeric value
 *
 * @param maxValue - Maximum value allowed
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const scoreValidator = max(100, 'Score cannot exceed 100');
 * ```
 */
export function max(maxValue: number, message?: string): FieldValidator<string | number> {
  return (value: string | number): ReturnType<FieldValidator> => {
    const numValue = typeof value === 'string' ? Number.parseFloat(value) : value;
    if (!Number.isNaN(numValue) && numValue > maxValue) {
      return createErrorResult(
        message || `Must be no more than ${maxValue}`,
        'MAX_VALUE',
        `max.${maxValue}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Creates a custom validator from a validation function
 *
 * @param validateFn - Custom validation function
 * @param message - Error message for failed validation
 * @param code - Optional error code
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const evenNumberValidator = custom(
 *   (value) => Number(value) % 2 === 0,
 *   'Number must be even',
 *   'NOT_EVEN'
 * );
 * ```
 */
export function custom<T>(
  validateFn: (value: T, context: ValidationContext) => boolean,
  message: string,
  code?: string
): FieldValidator<T> {
  return (value: T, context: ValidationContext): ReturnType<FieldValidator> => {
    if (!validateFn(value, context)) {
      return createErrorResult(message, code || 'CUSTOM_VALIDATION_FAILED');
    }
    return createSuccessResult();
  };
}

/**
 * Creates a validator that checks if a value matches another field's value
 *
 * @param targetFieldId - ID of the field to match against
 * @param message - Custom error message (optional)
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const confirmPasswordValidator = matchField('password', 'Passwords must match');
 * ```
 */
export function matchField(targetFieldId: string, message?: string): FieldValidator {
  return (value: any, context: ValidationContext): ReturnType<FieldValidator> => {
    const targetValue = context.allFormData?.[targetFieldId];
    if (value !== targetValue) {
      return createErrorResult(
        message || 'Fields must match',
        'FIELD_MISMATCH',
        `match.${targetFieldId}`
      );
    }
    return createSuccessResult();
  };
}

/**
 * Creates a validator that only validates when a condition is met
 *
 * @param condition - Function that determines if validation should run
 * @param validator - The validator to run conditionally
 * @returns A FieldValidator function
 *
 * @example
 * ```typescript
 * const conditionalValidator = validateWhen(
 *   (value, context) => context.allFormData?.userType === 'premium',
 *   required('Premium users must provide this field')
 * );
 * ```
 */
export function validateWhen<T>(
  condition: (value: T, context: ValidationContext) => boolean,
  validator: FieldValidator<T>
): FieldValidator<T> {
  return (value: T, context: ValidationContext): ReturnType<FieldValidator> => {
    if (!condition(value, context)) {
      return createSuccessResult();
    }
    return validator(value, context);
  };
}

/**
 * Creates an async custom validator from a validation function
 *
 * @param validateFn - Async custom validation function that returns a Promise<boolean>
 * @param message - Error message for failed validation
 * @param code - Optional error code
 * @returns A FieldValidator function that returns a Promise
 *
 * @example
 * ```typescript
 * const checkEmailUnique = customAsync(
 *   async (email) => {
 *     const response = await fetch(`/api/check-email?email=${email}`);
 *     const data = await response.json();
 *     return data.isUnique;
 *   },
 *   'Email address is already taken',
 *   'EMAIL_NOT_UNIQUE'
 * );
 * ```
 */
export function async<T>(
  validateFn: (value: T, context: ValidationContext) => Promise<boolean>,
  message: string,
  code?: string
): FieldValidator<T> {
  return async (value: T, context: ValidationContext): Promise<ValidationResult> => {
    try {
      const isValid = await validateFn(value, context);
      if (!isValid) {
        return createErrorResult(message, code || 'ASYNC_VALIDATION_FAILED');
      }
      return createSuccessResult();
    } catch (error) {
      return createErrorResult(
        error instanceof Error ? error.message : 'Async validation error',
        'ASYNC_ERROR'
      );
    }
  };
}
