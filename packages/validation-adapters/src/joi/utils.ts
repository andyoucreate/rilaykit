import type { JoiValidatorOptions } from '../types';

/**
 * Utility functions for working with Joi schemas in Rilay
 */

/**
 * Common error transformations for Joi validation details
 */
export const joiErrorTransforms = {
  /**
   * Transforms Joi error messages to be more user-friendly
   */
  userFriendly: (details: any[]) => {
    if (details.length === 0) return 'Validation failed';

    const detail = details[0];

    // Map Joi error types to user-friendly messages
    switch (detail.type) {
      case 'any.required':
        return 'This field is required';

      case 'string.empty':
        return 'This field cannot be empty';

      case 'string.min':
        return `Must be at least ${detail.context?.limit} characters`;

      case 'string.max':
        return `Must be no more than ${detail.context?.limit} characters`;

      case 'string.email':
        return 'Please enter a valid email address';

      case 'string.uri':
        return 'Please enter a valid URL';

      case 'string.pattern.base':
        return 'Invalid format';

      case 'number.base':
        return 'Please enter a valid number';

      case 'number.min':
        return `Must be at least ${detail.context?.limit}`;

      case 'number.max':
        return `Must be no more than ${detail.context?.limit}`;

      case 'number.integer':
        return 'Must be a whole number';

      case 'number.positive':
        return 'Must be a positive number';

      case 'number.negative':
        return 'Must be a negative number';

      case 'date.base':
        return 'Please enter a valid date';

      case 'date.min':
        return `Date must be after ${detail.context?.limit}`;

      case 'date.max':
        return `Date must be before ${detail.context?.limit}`;

      case 'array.min':
        return `Must have at least ${detail.context?.limit} items`;

      case 'array.max':
        return `Must have no more than ${detail.context?.limit} items`;

      case 'array.unique':
        return 'Items must be unique';

      case 'object.unknown':
        return 'Unknown field not allowed';

      case 'any.only':
        return 'Invalid value';

      case 'alternatives.match':
        return 'Does not match any of the allowed alternatives';

      default:
        return detail.message || 'Validation failed';
    }
  },

  /**
   * Concatenates multiple error messages
   */
  concatenated: (details: any[], separator = '; ') => {
    return details.map((detail) => detail.message).join(separator);
  },

  /**
   * Returns the first error message only
   */
  firstOnly: (details: any[]) => {
    return details.length > 0 ? details[0].message : 'Validation failed';
  },
};

/**
 * Common path formatters for nested field errors
 */
export const joiPathFormatters = {
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
 * Predefined Joi validator options for common use cases
 */
export const joiValidatorPresets = {
  /**
   * Default options - strict validation with user-friendly errors
   */
  default: {
    allowUnknown: false,
    abortEarly: false,
    errorTransform: joiErrorTransforms.userFriendly,
    pathFormatter: joiPathFormatters.dotNotation,
  } as JoiValidatorOptions,

  /**
   * Strict options - no unknown keys, original Joi errors
   */
  strict: {
    allowUnknown: false,
    abortEarly: false,
  } as JoiValidatorOptions,

  /**
   * Fast options - abort on first error for better performance
   */
  fast: {
    allowUnknown: false,
    abortEarly: true,
    errorTransform: joiErrorTransforms.firstOnly,
  } as JoiValidatorOptions,

  /**
   * Lenient options - allow unknown keys
   */
  lenient: {
    allowUnknown: true,
    abortEarly: false,
    errorTransform: joiErrorTransforms.userFriendly,
    pathFormatter: joiPathFormatters.dotNotation,
  } as JoiValidatorOptions,

  /**
   * User-friendly options with concatenated errors
   */
  userFriendly: {
    allowUnknown: false,
    abortEarly: false,
    errorTransform: joiErrorTransforms.concatenated,
    pathFormatter: joiPathFormatters.humanReadable,
  } as JoiValidatorOptions,
};

/**
 * Helper to create a Joi validator with a preset configuration
 */
export function createJoiValidatorWithPreset<T = any>(
  schema: any,
  preset: keyof typeof joiValidatorPresets,
  overrides: Partial<JoiValidatorOptions> = {}
) {
  const { createJoiValidator } = require('./field-validator');
  const options = { ...joiValidatorPresets[preset], ...overrides };
  return createJoiValidator<T>(schema, options);
}

/**
 * Helper to create a Joi form validator with a preset configuration
 */
export function createJoiFormValidatorWithPreset<
  T extends Record<string, any> = Record<string, any>,
>(
  schema: any,
  preset: keyof typeof joiValidatorPresets,
  overrides: Partial<JoiValidatorOptions> = {}
) {
  const { createJoiFormValidator } = require('./form-validator');
  const options = { ...joiValidatorPresets[preset], ...overrides };
  return createJoiFormValidator<T>(schema, options);
}

/**
 * Type guard to check if an error is a Joi error
 */
export function isJoiError(error: unknown): error is { details: any[] } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'details' in error &&
    Array.isArray((error as any).details)
  );
}

/**
 * Extract common Joi validation options
 */
export function createJoiValidationOptions(options: JoiValidatorOptions) {
  return {
    abortEarly: options.abortEarly ?? false,
    allowUnknown: options.allowUnknown ?? false,
    context: options.context,
    errors: {
      label: 'key',
    },
  };
}

/**
 * Helper to create custom Joi messages for common validations
 */
export const joiMessages = {
  required: (fieldName: string) => ({
    'any.required': `${fieldName} is required`,
  }),

  email: (fieldName = 'Email') => ({
    'string.email': `${fieldName} must be a valid email address`,
    'string.empty': `${fieldName} cannot be empty`,
  }),

  password: (minLength = 8) => ({
    'string.min': `Password must be at least ${minLength} characters`,
    'string.empty': 'Password cannot be empty',
  }),

  number: (fieldName: string) => ({
    'number.base': `${fieldName} must be a number`,
    'number.min': `${fieldName} must be at least {#limit}`,
    'number.max': `${fieldName} must be no more than {#limit}`,
  }),
};
