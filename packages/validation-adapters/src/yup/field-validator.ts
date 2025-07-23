import type { FieldValidator, ValidationError, ValidationResult } from '@rilaykit/core';
import type { YupValidatorOptions } from '../types';

// Conditional import to avoid runtime dependency when Yup is not installed
let yup: any;
try {
  yup = require('yup');
} catch {
  // Yup not installed - will throw helpful error when used
  yup = null;
}

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Yup validation errors to Rilay validation errors
 */
const transformYupErrors = (errors: any[], options: YupValidatorOptions): ValidationError[] => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;

  return errors.map((error) => ({
    message: options.errorTransform ? options.errorTransform([error]) : error.message,
    code: error.type || 'VALIDATION_ERROR',
    path: error.path ? pathFormatter(error.path.split('.')) : undefined,
  }));
};

/**
 * Creates a Rilay field validator from a Yup schema
 *
 * @param schema - Yup schema to validate against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible field validator function
 *
 * @example
 * ```typescript
 * import * as yup from 'yup';
 * import { createYupValidator } from '@rilaykit/validation-adapters/yup';
 *
 * const emailValidator = createYupValidator(
 *   yup.string()
 *     .email('Please enter a valid email address')
 *     .required('Email is required')
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
export function createYupValidator<T = any>(
  schema: any, // yup.Schema<T> - using any to avoid hard dependency
  options: YupValidatorOptions = {}
): FieldValidator<T> {
  // Check if Yup is available
  if (!yup) {
    throw new Error(
      '@rilaykit/validation-adapters: Yup is required but not installed. ' +
        'Please install it with: npm install yup'
    );
  }

  // Validate that the schema is a Yup schema
  if (!schema || typeof schema.validate !== 'function') {
    throw new Error(
      '@rilaykit/validation-adapters: Invalid Yup schema provided. ' +
        'Expected a Yup schema with a validate method.'
    );
  }

  const { abortEarly = false, context, stripUnknown = false } = options;

  return async (value: T, _context): Promise<ValidationResult> => {
    const validationOptions = {
      abortEarly,
      context,
      stripUnknown,
    };

    const result = await schema.validate(value, validationOptions);

    if (result.error) {
      const errors = Array.isArray(result.error) ? result.error : [result.error];

      const transformedErrors = transformYupErrors(errors, options);
      return { isValid: false, errors: transformedErrors };
    }

    return { isValid: true, errors: [] };
  };
}

/**
 * Creates a Yup validator with predefined stripUnknown = false
 *
 * @param schema - Yup schema to validate against
 * @param options - Configuration options (stripUnknown will be set to false)
 * @returns A Rilay-compatible field validator function
 */
export function createYupStrictValidator<T = any>(
  schema: any,
  options: Omit<YupValidatorOptions, 'stripUnknown'> = {}
): FieldValidator<T> {
  return createYupValidator(schema, { ...options, stripUnknown: false });
}

/**
 * Creates a Yup validator with predefined stripUnknown = true
 *
 * @param schema - Yup schema to validate against
 * @param options - Configuration options (stripUnknown will be set to true)
 * @returns A Rilay-compatible field validator function
 */
export function createYupLenientValidator<T = any>(
  schema: any,
  options: Omit<YupValidatorOptions, 'stripUnknown'> = {}
): FieldValidator<T> {
  return createYupValidator(schema, { ...options, stripUnknown: true });
}
