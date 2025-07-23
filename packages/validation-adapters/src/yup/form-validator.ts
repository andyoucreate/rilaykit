import type { ValidationError, ValidationResult } from '@rilaykit/core';
import type { FormValidator, YupValidatorOptions } from '../types';

// Conditional import to avoid runtime dependency when Yup is not installed
let yup: any;
try {
  yup = require('yup');
} catch {
  yup = null;
}

/**
 * Default path formatter for nested fields
 */
const defaultPathFormatter = (path: (string | number)[]): string => {
  return path.join('.');
};

/**
 * Transform Yup validation errors to field-grouped validation errors
 */
const transformYupErrorsForForm = (
  errors: any[],
  options: YupValidatorOptions
): Record<string, ValidationError[]> => {
  const pathFormatter = options.pathFormatter || defaultPathFormatter;
  const fieldErrors: Record<string, ValidationError[]> = {};

  for (const error of errors) {
    const fieldPath = error.path ? pathFormatter(error.path.split('.')) : '_form'; // Form-level errors go to special '_form' key

    if (!fieldErrors[fieldPath]) {
      fieldErrors[fieldPath] = [];
    }

    fieldErrors[fieldPath].push({
      message: options.errorTransform ? options.errorTransform([error]) : error.message,
      code: error.type || 'VALIDATION_ERROR',
      path: fieldPath !== '_form' ? fieldPath : undefined,
    });
  }

  return fieldErrors;
};

/**
 * Creates a Rilay form validator from a Yup schema
 *
 * @param schema - Yup object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A Rilay-compatible form validator function
 *
 * @example
 * ```typescript
 * import * as yup from 'yup';
 * import { createYupFormValidator } from '@rilaykit/validation-adapters/yup';
 *
 * const userSchema = yup.object({
 *   email: yup.string()
 *     .email('Invalid email address')
 *     .required('Email is required'),
 *   age: yup.number()
 *     .min(18, 'Must be 18 or older')
 *     .required('Age is required'),
 *   confirmPassword: yup.string()
 *     .required('Confirm password is required')
 *     .oneOf([yup.ref('password')], 'Passwords must match')
 * });
 *
 * const formValidator = createYupFormValidator(userSchema);
 *
 * const form = factory.form()
 *   .setValidation({
 *     validators: [formValidator]
 *   });
 * ```
 */
export function createYupFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any, // yup.ObjectSchema<any> - using any to avoid hard dependency
  options: YupValidatorOptions = {}
): FormValidator<T> {
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

  return async (formData: T): Promise<ValidationResult> => {
    const validationOptions = {
      abortEarly,
      context,
      stripUnknown,
    };

    const result = await schema.validate(formData, validationOptions);

    if (result.error) {
      const errors = Array.isArray(result.error) ? result.error : [result.error];

      const fieldErrors = transformYupErrorsForForm(errors, options);

      // Convert to ValidationResult format
      const allErrors: ValidationError[] = [];
      for (const [fieldPath, errorList] of Object.entries(fieldErrors)) {
        for (const error of errorList) {
          allErrors.push({
            ...error,
            path: fieldPath !== '_form' ? fieldPath : undefined,
          });
        }
      }

      return { isValid: false, errors: allErrors };
    }

    return { isValid: true, errors: [] };
  };
}

/**
 * Creates a Yup form validator that returns field-grouped errors
 * This is useful when you need to know which fields have errors for UI purposes
 *
 * @param schema - Yup object schema to validate the entire form against
 * @param options - Configuration options for the validator
 * @returns A function that returns field-grouped validation errors
 *
 * @example
 * ```typescript
 * const formValidator = createYupFormValidatorWithFieldErrors(userSchema);
 * const result = await formValidator(formData);
 *
 * if (!result.isValid) {
 *   console.log(result.fieldErrors.email); // Errors for email field
 *   console.log(result.fieldErrors.age);   // Errors for age field
 * }
 * ```
 */
export function createYupFormValidatorWithFieldErrors<
  T extends Record<string, any> = Record<string, any>,
>(
  schema: any,
  options: YupValidatorOptions = {}
): (formData: T) => Promise<{
  isValid: boolean;
  fieldErrors: Record<string, ValidationError[]>;
  allErrors: ValidationError[];
}> {
  // Check if Yup is available
  if (!yup) {
    throw new Error(
      '@rilaykit/validation-adapters: Yup is required but not installed. ' +
        'Please install it with: npm install yup'
    );
  }

  const { abortEarly = false, context, stripUnknown = false } = options;

  return async (formData: T) => {
    const validationOptions = {
      abortEarly,
      context,
      stripUnknown,
    };

    const result = await schema.validate(formData, validationOptions);

    if (result.error) {
      const errors = Array.isArray(result.error) ? result.error : [result.error];

      const fieldErrors = transformYupErrorsForForm(errors, options);

      // Flatten to allErrors array
      const allErrors: ValidationError[] = [];
      for (const [fieldPath, errorList] of Object.entries(fieldErrors)) {
        for (const error of errorList) {
          allErrors.push({
            ...error,
            path: fieldPath !== '_form' ? fieldPath : undefined,
          });
        }
      }

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
  };
}

/**
 * Creates a strict Yup form validator (stripUnknown = false)
 */
export function createYupStrictFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<YupValidatorOptions, 'stripUnknown'> = {}
): FormValidator<T> {
  return createYupFormValidator(schema, { ...options, stripUnknown: false });
}

/**
 * Creates a lenient Yup form validator (stripUnknown = true)
 */
export function createYupLenientFormValidator<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  options: Omit<YupValidatorOptions, 'stripUnknown'> = {}
): FormValidator<T> {
  return createYupFormValidator(schema, { ...options, stripUnknown: true });
}
