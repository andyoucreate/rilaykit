import type { ZodValidatorOptions } from '../types';

/**
 * Utility functions for working with Zod schemas in Rilay
 */

/**
 * Common error transformations for Zod issues
 */
export const zodErrorTransforms = {
  /**
   * Transforms Zod error messages to be more user-friendly
   */
  userFriendly: (issues: any[]) => {
    if (issues.length === 0) return 'Validation failed';
    
    const issue = issues[0];
    
    // Map Zod error codes to user-friendly messages
    switch (issue.code) {
      case 'invalid_type':
        if (issue.expected === 'string' && issue.received === 'undefined') {
          return 'This field is required';
        }
        if (issue.expected === 'number') {
          return 'Please enter a valid number';
        }
        return `Expected ${issue.expected}, received ${issue.received}`;
        
      case 'too_small':
        if (issue.type === 'string') {
          return issue.minimum === 1 
            ? 'This field is required'
            : `Must be at least ${issue.minimum} characters`;
        }
        if (issue.type === 'number') {
          return `Must be at least ${issue.minimum}`;
        }
        if (issue.type === 'array') {
          return `Must have at least ${issue.minimum} items`;
        }
        return issue.message;
        
      case 'too_big':
        if (issue.type === 'string') {
          return `Must be no more than ${issue.maximum} characters`;
        }
        if (issue.type === 'number') {
          return `Must be no more than ${issue.maximum}`;
        }
        if (issue.type === 'array') {
          return `Must have no more than ${issue.maximum} items`;
        }
        return issue.message;
        
      case 'invalid_string':
        switch (issue.validation) {
          case 'email':
            return 'Please enter a valid email address';
          case 'url':
            return 'Please enter a valid URL';
          case 'regex':
            return 'Invalid format';
          default:
            return issue.message;
        }
        
      case 'custom':
        // Custom validation messages should already be user-friendly
        return issue.message;
        
      default:
        return issue.message;
    }
  },

  /**
   * Concatenates multiple error messages
   */
  concatenated: (issues: any[], separator: string = '; ') => {
    return issues.map(issue => issue.message).join(separator);
  },

  /**
   * Returns the first error message only
   */
  firstOnly: (issues: any[]) => {
    return issues.length > 0 ? issues[0].message : 'Validation failed';
  }
};

/**
 * Common path formatters for nested field errors
 */
export const zodPathFormatters = {
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
    return first + rest.map(segment => `[${segment}]`).join('');
  },

  /**
   * Formats path as human-readable labels
   * Example: ['user', 'profile', 'name'] -> 'User Profile Name'
   */
  humanReadable: (path: (string | number)[]): string => {
    return path
      .map(segment => 
        typeof segment === 'string' 
          ? segment.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
          : segment.toString()
      )
      .join(' ');
  }
};

/**
 * Predefined Zod validator options for common use cases
 */
export const zodValidatorPresets = {
  /**
   * Default options - sync parsing with user-friendly errors
   */
  default: {
    parseMode: 'sync',
    errorTransform: zodErrorTransforms.userFriendly,
    pathFormatter: zodPathFormatters.dotNotation,
    abortEarly: false
  } as ZodValidatorOptions,

  /**
   * Strict options - sync parsing with original Zod errors
   */
  strict: {
    parseMode: 'sync',
    abortEarly: false
  } as ZodValidatorOptions,

  /**
   * Fast options - abort on first error for better performance
   */
  fast: {
    parseMode: 'sync',
    errorTransform: zodErrorTransforms.firstOnly,
    abortEarly: true
  } as ZodValidatorOptions,

  /**
   * Async options - for schemas with async refinements
   */
  async: {
    parseMode: 'async',
    errorTransform: zodErrorTransforms.userFriendly,
    pathFormatter: zodPathFormatters.dotNotation,
    abortEarly: false
  } as ZodValidatorOptions,

  /**
   * User-friendly options with concatenated errors
   */
  userFriendly: {
    parseMode: 'sync',
    errorTransform: zodErrorTransforms.concatenated,
    pathFormatter: zodPathFormatters.humanReadable,
    abortEarly: false
  } as ZodValidatorOptions
};

/**
 * Helper to create a Zod validator with a preset configuration
 */
export function createZodValidatorWithPreset<T = any>(
  schema: any,
  preset: keyof typeof zodValidatorPresets,
  overrides: Partial<ZodValidatorOptions> = {}
) {
  const { createZodValidator } = require('./field-validator');
  const options = { ...zodValidatorPresets[preset], ...overrides };
  return createZodValidator<T>(schema, options);
}

/**
 * Helper to create a Zod form validator with a preset configuration
 */
export function createZodFormValidatorWithPreset<T extends Record<string, any> = Record<string, any>>(
  schema: any,
  preset: keyof typeof zodValidatorPresets,
  overrides: Partial<ZodValidatorOptions> = {}
) {
  const { createZodFormValidator } = require('./form-validator');
  const options = { ...zodValidatorPresets[preset], ...overrides };
  return createZodFormValidator<T>(schema, options);
}

/**
 * Type guard to check if an error is a Zod error
 */
export function isZodError(error: unknown): error is { issues: any[] } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as any).issues)
  );
}

/**
 * Extract the schema type from a Zod schema (TypeScript helper)
 */
export type ZodInfer<T> = T extends { _output: infer U } ? U : never;