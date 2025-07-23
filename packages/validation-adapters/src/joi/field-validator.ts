import type { FieldValidator, ValidationError, ValidationResult } from '@rilaykit/core';
import type { JoiValidatorOptions } from '../types';

// Conditional import to avoid runtime dependency when Joi is not installed
let Joi: any;
try {
  Joi = require('joi');
} catch {
  // Joi not installed - will throw helpful error when used
  Joi = null;
}

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Joi validation errors to Rilay validation errors
 */
const transformJoiErrors = (details: any[], options: JoiValidatorOptions): ValidationError[] => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;

  return details.map((detail) => ({
    message: options.errorTransform ? options.errorTransform([detail]) : detail.message,
    code: detail.type || 'VALIDATION_ERROR',
    path: detail.path && detail.path.length > 0 ? pathFormatter(detail.path) : undefined,
  }));
};

/**
 * Creates a Rilay field validator from a Joi schema
 *
 * @param schema - Joi schema to validate against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible field validator function
 *
 * @example
 * ```typescript
 * import Joi from 'joi';
 * import { createJoiValidator } from '@rilaykit/validation-adapters/joi';
 *
 * const emailValidator = createJoiValidator(
 *   Joi.string().email().required().messages({
 *     'string.email': 'Please enter a valid email address',
 *     'any.required': 'Email is required'
 *   })
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
export function createJoiValidator<T = any>(
  schema: any, // Joi.Schema - using any to avoid hard dependency
  options: JoiValidatorOptions = {}
): FieldValidator<T> {
  // Check if Joi is available
  if (!Joi) {
    throw new Error(
      '@rilaykit/validation-adapters: Joi is required but not installed. ' +
        'Please install it with: npm install joi'
    );
  }

  // Validate that the schema is a Joi schema
  if (!schema || typeof schema.validate !== 'function') {
    throw new Error(
      '@rilaykit/validation-adapters: Invalid Joi schema provided. ' +
        'Expected a Joi schema with a validate method.'
    );
  }

  const { abortEarly = false, context, allowUnknown = false } = options;

  return async (value: T, _context): Promise<ValidationResult> => {
    try {
      const validationOptions = {
        abortEarly,
        context,
        allowUnknown,
        errors: {
          label: 'key',
        },
      };

      const result = schema.validate(value, validationOptions);

      if (result.error) {
        const details = result.error.details || [];

        const errors = transformJoiErrors(details, options);
        return { isValid: false, errors };
      }

      return { isValid: true, errors: [] };
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Creates a Joi validator with predefined allowUnknown = false
 *
 * @param schema - Joi schema to validate against
 * @param options - Configuration options (allowUnknown will be set to false)
 * @returns A Rilay-compatible field validator function
 */
export function createJoiStrictValidator<T = any>(
  schema: any,
  options: Omit<JoiValidatorOptions, 'allowUnknown'> = {}
): FieldValidator<T> {
  return createJoiValidator(schema, { ...options, allowUnknown: false });
}

/**
 * Creates a Joi validator with predefined allowUnknown = true
 *
 * @param schema - Joi schema to validate against
 * @param options - Configuration options (allowUnknown will be set to true)
 * @returns A Rilay-compatible field validator function
 */
export function createJoiLenientValidator<T = any>(
  schema: any,
  options: Omit<JoiValidatorOptions, 'allowUnknown'> = {}
): FieldValidator<T> {
  return createJoiValidator(schema, { ...options, allowUnknown: true });
}
