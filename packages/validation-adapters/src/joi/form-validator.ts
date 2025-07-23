import type { ValidationError, ValidationResult } from '@rilaykit/core';
import type { FormValidator, JoiValidatorOptions } from '../types';

// Conditional import to avoid runtime dependency when Joi is not installed
let Joi: any;
try {
  Joi = require('joi');
} catch {
  Joi = null;
}

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Joi validation errors to field-grouped validation errors
 */
const transformJoiErrorsForForm = (
  details: any[],
  options: JoiValidatorOptions
): Record<string, ValidationError[]> => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;
  const fieldErrors: Record<string, ValidationError[]> = {};

  details.forEach((detail) => {
    const fieldPath = detail.path && detail.path.length > 0 ? pathFormatter(detail.path) : '_form'; // Form-level errors go to special '_form' key

    if (!fieldErrors[fieldPath]) {
      fieldErrors[fieldPath] = [];
    }

    fieldErrors[fieldPath].push({
      message: options.errorTransform ? options.errorTransform([detail]) : detail.message,
      code: detail.type || 'VALIDATION_ERROR',
      path: fieldPath !== '_form' ? fieldPath : undefined,
    });
  });

  return fieldErrors;
};

/**
 * Creates a Rilay form validator from a Joi schema
 *
 * @param schema - Joi object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible form validator function
 *
 * @example
 * ```typescript
 * import Joi from 'joi';
 * import { createJoiFormValidator } from '@rilaykit/validation-adapters/joi';
 *
 * const userSchema = Joi.object({
 *   email: Joi.string().email().required().messages({
 *     'string.email': 'Invalid email address',
 *     'any.required': 'Email is required'
 *   }),
 *   age: Joi.number().min(18).required().messages({
 *     'number.min': 'Must be 18 or older',
 *     'any.required': 'Age is required'
 *   }),
 *   confirmPassword: Joi.string().required()
 * }).when(Joi.object({
 *   password: Joi.exist()
 * }).unknown(), {
 *   then: Joi.object({
 *     confirmPassword: Joi.valid(Joi.ref('password')).messages({
 *       'any.only': 'Passwords must match'
 *     })
 *   })
 * });
 *
 * const formValidator = createJoiFormValidator(userSchema);
 *
 * const form = factory.form()
 *   .setValidation({
 *     validators: [formValidator]
 *   });
 * ```
 */
export function createJoiFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any, // Joi.ObjectSchema<any> - using any to avoid hard dependency
  options: JoiValidatorOptions = {}
): FormValidator<T> {
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

  return async (formData: T): Promise<ValidationResult> => {
    try {
      const validationOptions = {
        abortEarly,
        context,
        allowUnknown,
        errors: {
          label: 'key',
        },
      };

      const result = schema.validate(formData, validationOptions);

      if (result.error) {
        const details = result.error.details || [];

        const fieldErrors = transformJoiErrorsForForm(details, options);

        // Convert to ValidationResult format
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

      return { isValid: true, errors: [] };
    } catch (error) {
      // Re-throw non-Joi errors
      throw error;
    }
  };
}

/**
 * Creates a Joi form validator that returns field-grouped errors
 * This is useful when you need to know which fields have errors for UI purposes
 *
 * @param schema - Joi object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A function that returns field-grouped validation errors
 *
 * @example
 * ```typescript
 * const formValidator = createJoiFormValidatorWithFieldErrors(userSchema);
 * const result = await formValidator(formData);
 *
 * if (!result.isValid) {
 *   console.log(result.fieldErrors.email); // Errors for email field
 *   console.log(result.fieldErrors.age);   // Errors for age field
 * }
 * ```
 */
export function createJoiFormValidatorWithFieldErrors<
  T extends Record<string, any> = Record<string, any>,
>(
  schema: any,
  options: JoiValidatorOptions = {}
): (formData: T) => Promise<{
  isValid: boolean;
  fieldErrors: Record<string, ValidationError[]>;
  allErrors: ValidationError[];
}> {
  // Check if Joi is available
  if (!Joi) {
    throw new Error(
      '@rilaykit/validation-adapters: Joi is required but not installed. ' +
        'Please install it with: npm install joi'
    );
  }

  const { abortEarly = false, context, allowUnknown = false } = options;

  return async (formData: T) => {
    try {
      const validationOptions = {
        abortEarly,
        context,
        allowUnknown,
        errors: {
          label: 'key',
        },
      };

      const result = schema.validate(formData, validationOptions);

      if (result.error) {
        const details = result.error.details || [];

        const fieldErrors = transformJoiErrorsForForm(details, options);

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

      return {
        isValid: true,
        fieldErrors: {},
        allErrors: [],
      };
    } catch (error) {
      // Re-throw non-Joi errors
      throw error;
    }
  };
}

/**
 * Creates a strict Joi form validator (allowUnknown = false)
 */
export function createJoiStrictFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<JoiValidatorOptions, 'allowUnknown'> = {}
): FormValidator<T> {
  return createJoiFormValidator(schema, { ...options, allowUnknown: false });
}

/**
 * Creates a lenient Joi form validator (allowUnknown = true)
 */
export function createJoiLenientFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<JoiValidatorOptions, 'allowUnknown'> = {}
): FormValidator<T> {
  return createJoiFormValidator(schema, { ...options, allowUnknown: true });
}
