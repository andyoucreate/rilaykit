import type { YupValidatorOptions } from '../types';

/**
 * Utility functions for working with Yup schemas in Rilay
 */

/**
 * Common error transformations for Yup validation errors
 */
export const yupErrorTransforms = {
  /**
   * Transforms Yup error messages to be more user-friendly
   */
  userFriendly: (errors: any[]) => {
    if (errors.length === 0) return 'Validation failed';

    const error = errors[0];

    // Map Yup error types to user-friendly messages
    switch (error.type) {
      case 'required':
        return 'This field is required';

      case 'email':
        return 'Please enter a valid email address';

      case 'url':
        return 'Please enter a valid URL';

      case 'min':
        if (error.params?.min && typeof error.params.min === 'number') {
          return `Must be at least ${error.params.min}`;
        }
        return error.message;

      case 'max':
        if (error.params?.max && typeof error.params.max === 'number') {
          return `Must be no more than ${error.params.max}`;
        }
        return error.message;

      case 'minLength':
      case 'length':
        if (error.params?.min && typeof error.params.min === 'number') {
          return `Must be at least ${error.params.min} characters`;
        }
        return error.message;

      case 'maxLength':
        if (error.params?.max && typeof error.params.max === 'number') {
          return `Must be no more than ${error.params.max} characters`;
        }
        return error.message;

      case 'typeError':
        if (error.message.includes('number')) {
          return 'Please enter a valid number';
        }
        if (error.message.includes('date')) {
          return 'Please enter a valid date';
        }
        return 'Invalid format';

      case 'matches':
        return 'Invalid format';

      case 'oneOf':
        return 'Invalid value';

      case 'notOneOf':
        return 'This value is not allowed';

      case 'positive':
        return 'Must be a positive number';

      case 'negative':
        return 'Must be a negative number';

      case 'integer':
        return 'Must be a whole number';

      default:
        return error.message || 'Validation failed';
    }
  },

  /**
   * Concatenates multiple error messages
   */
  concatenated: (errors: any[], separator = '; ') => {
    return errors.map((error) => error.message).join(separator);
  },

  /**
   * Returns the first error message only
   */
  firstOnly: (errors: any[]) => {
    return errors.length > 0 ? errors[0].message : 'Validation failed';
  },
};

/**
 * Common path formatters for nested field errors
 */
export const yupPathFormatters = {
  /**
   * Formats path as dot notation (default)
   * Example: ['user', 'profile', 'name'] -> 'user.profile.name'
   */
  dotNotation: (path: (string | number)[]): string => {
    return path.join('.');
  },

  /**
   * Formats path as bracket notation
   * Example: ['user', 'profile', 'name'] -> 'user[profile][name]'
   */
  bracketNotation: (path: (string | number)[]): string => {
    if (path.length === 0) return '';
    const [first, ...rest] = path;
    return first + rest.map((segment) => `[${segment}]`).join('');
  },

  /**
   * Formats path as human-readable labels
   * Example: ['user', 'profile', 'name'] -> 'User Profile Name'
   */
  humanReadable: (path: (string | number)[]): string => {
    return path
      .map((segment) =>
        typeof segment === 'string'
          ? segment.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
          : segment.toString()
      )
      .join(' ');
  },
};

/**
 * Predefined Yup validator options for common use cases
 */
export const yupValidatorPresets = {
  /**
   * Default options - strict validation with user-friendly errors
   */
  default: {
    stripUnknown: false,
    abortEarly: false,
    errorTransform: yupErrorTransforms.userFriendly,
    pathFormatter: yupPathFormatters.dotNotation,
  } as YupValidatorOptions,

  /**
   * Strict options - no unknown keys, original Yup errors
   */
  strict: {
    stripUnknown: false,
    abortEarly: false,
  } as YupValidatorOptions,

  /**
   * Fast options - abort on first error for better performance
   */
  fast: {
    stripUnknown: false,
    abortEarly: true,
    errorTransform: yupErrorTransforms.firstOnly,
  } as YupValidatorOptions,

  /**
   * Lenient options - strip unknown keys
   */
  lenient: {
    stripUnknown: true,
    abortEarly: false,
    errorTransform: yupErrorTransforms.userFriendly,
    pathFormatter: yupPathFormatters.dotNotation,
  } as YupValidatorOptions,

  /**
   * User-friendly options with concatenated errors
   */
  userFriendly: {
    stripUnknown: false,
    abortEarly: false,
    errorTransform: yupErrorTransforms.concatenated,
    pathFormatter: yupPathFormatters.humanReadable,
  } as YupValidatorOptions,
};

/**
 * Helper to create a Yup validator with a preset configuration
 */
export function createYupValidatorWithPreset<T = any>(
  schema: any,
  preset: keyof typeof yupValidatorPresets,
  overrides: Partial<YupValidatorOptions> = {}
) {
  const { createYupValidator } = require('./field-validator');
  const options = { ...yupValidatorPresets[preset], ...overrides };
  return createYupValidator<T>(schema, options);
}

/**
 * Helper to create a Yup form validator with a preset configuration
 */
export function createYupFormValidatorWithPreset<
  T extends Record<string, any> = Record<string, any>,
>(
  schema: any,
  preset: keyof typeof yupValidatorPresets,
  overrides: Partial<YupValidatorOptions> = {}
) {
  const { createYupFormValidator } = require('./form-validator');
  const options = { ...yupValidatorPresets[preset], ...overrides };
  return createYupFormValidator<T>(schema, options);
}

/**
 * Type guard to check if an error is a Yup error
 */
export function isYupError(
  error: unknown
): error is { message: string; path?: string; type?: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  );
}

/**
 * Extract common Yup validation options
 */
export function createYupValidationOptions(options: YupValidatorOptions) {
  return {
    abortEarly: options.abortEarly ?? false,
    stripUnknown: options.stripUnknown ?? false,
    context: options.context,
  };
}

/**
 * Helper to create custom Yup schemas for common validations
 */
export const yupSchemas = {
  /**
   * Email validation schema
   */
  email: (fieldName = 'Email') => {
    const yup = require('yup');
    return yup
      .string()
      .email(`${fieldName} must be a valid email address`)
      .required(`${fieldName} is required`);
  },

  /**
   * Password validation schema
   */
  password: (minLength = 8, fieldName = 'Password') => {
    const yup = require('yup');
    return yup
      .string()
      .min(minLength, `${fieldName} must be at least ${minLength} characters`)
      .required(`${fieldName} is required`);
  },

  /**
   * Age validation schema
   */
  age: (minAge = 18, fieldName = 'Age') => {
    const yup = require('yup');
    return yup
      .number()
      .integer(`${fieldName} must be a whole number`)
      .min(minAge, `${fieldName} must be at least ${minAge}`)
      .required(`${fieldName} is required`);
  },

  /**
   * Phone number validation schema (basic)
   */
  phone: (fieldName = 'Phone number') => {
    const yup = require('yup');
    return yup
      .string()
      .matches(/^[\+]?[\d\s\-\(\)]{10,}$/, `${fieldName} must be a valid phone number`)
      .required(`${fieldName} is required`);
  },
};
