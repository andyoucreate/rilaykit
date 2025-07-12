import { z } from 'zod';
import type {
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidatorFunction,
} from '../types';

/**
 * Create a `Zod`-based validator
 * @param schema - Zod schema to validate against
 * @returns Validator function
 */
export const createZodValidator = <T>(schema: z.ZodSchema<T>): ValidatorFunction => {
  return async (value) => {
    try {
      await schema.parseAsync(value);

      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      // Check if it's a ZodError by looking for the errors property
      if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
        return {
          isValid: false,
          errors: error.errors.map((err: any) => ({
            code: err.code,
            message: err.message,
            path: err.path ? err.path.map(String) : [],
          })),
        };
      }

      return {
        isValid: false,
        errors: [
          {
            code: 'unknown',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
};

/**
 * Create a custom validator from a validation function
 * @param validationFn - Function that returns boolean, string, or Promise
 * @returns Validator function
 */
export const createCustomValidator = (
  validationFn: (
    value: any,
    context: ValidationContext
  ) => boolean | string | Promise<boolean | string>
): ValidatorFunction => {
  return async (value, context, _props) => {
    try {
      const result = await validationFn(value, context);

      if (result === true) {
        return { isValid: true, errors: [] };
      }

      if (result === false) {
        return {
          isValid: false,
          errors: [
            {
              code: 'validation_failed',
              message: 'Validation failed',
            },
          ],
        };
      }

      // If it's a string, it's the error message
      return {
        isValid: false,
        errors: [
          {
            code: 'validation_failed',
            message: String(result),
          },
        ],
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            code: 'validation_error',
            message: error instanceof Error ? error.message : 'Validation error',
          },
        ],
      };
    }
  };
};

/**
 * Combine multiple validators
 * @param validators - Array of validators to combine
 * @param mode - 'all' (all must pass) or 'any' (at least one must pass)
 * @returns Combined validator function
 */
export const combineValidators = (
  validators: ValidatorFunction[],
  mode: 'all' | 'any' = 'all'
): ValidatorFunction => {
  return async (value, context, props) => {
    const results = await Promise.all(
      validators.map((validator) => validator(value, context, props))
    );

    if (mode === 'all') {
      const allErrors = results.flatMap((result) => result.errors);

      return {
        isValid: results.every((result) => result.isValid),
        errors: allErrors,
      };
    }
    // mode === 'any'
    const hasValidResult = results.some((result) => result.isValid);

    if (hasValidResult) {
      return {
        isValid: true,
        errors: [],
      };
    }
    const allErrors = results.flatMap((result) => result.errors);
    return {
      isValid: false,
      errors: allErrors,
    };
  };
};

/**
 * Create a conditional validator that only runs when condition is met
 * @param condition - Function to determine if validation should run
 * @param validator - Validator to run when condition is true
 * @returns Conditional validator function
 */
export const createConditionalValidator = (
  condition: (value: any, context: ValidationContext) => boolean,
  validator: ValidatorFunction
): ValidatorFunction => {
  return async (value, context, props) => {
    if (!condition(value, context)) {
      return { isValid: true, errors: [] };
    }

    return validator(value, context, props);
  };
};

/**
 * Common validation patterns
 */
export const commonValidators = {
  /**
   * Required field validator
   */
  required: (message = 'This field is required'): ValidatorFunction =>
    createCustomValidator((value) => {
      if (value === null || value === undefined || value === '') {
        return message;
      }
      return true;
    }),

  /**
   * Email validation
   */
  email: (message = 'Invalid email format'): ValidatorFunction =>
    createZodValidator(z.string().email(message)),

  /**
   * Minimum length validation
   */
  minLength: (min: number, message?: string): ValidatorFunction =>
    createZodValidator(z.string().min(min, message || `Minimum ${min} characters required`)),

  /**
   * Maximum length validation
   */
  maxLength: (max: number, message?: string): ValidatorFunction =>
    createZodValidator(z.string().max(max, message || `Maximum ${max} characters allowed`)),

  /**
   * Pattern/regex validation
   */
  pattern: (regex: RegExp, message = 'Invalid format'): ValidatorFunction =>
    createZodValidator(z.string().regex(regex, message)),

  /**
   * Number range validation
   */
  numberRange: (min?: number, max?: number, message?: string): ValidatorFunction => {
    let schema = z.number();

    if (min !== undefined) {
      schema = schema.min(min, message || `Value must be at least ${min}`);
    }

    if (max !== undefined) {
      schema = schema.max(max, message || `Value must be at most ${max}`);
    }

    return createZodValidator(schema);
  },

  /**
   * URL validation
   */
  url: (message = 'Invalid URL format'): ValidatorFunction =>
    createZodValidator(z.string().url(message)),

  /**
   * Phone number validation (basic)
   */
  phoneNumber: (message = 'Invalid phone number format'): ValidatorFunction =>
    createZodValidator(z.string().regex(/^\+?[\d\s\-\(\)]+$/, message)),

  /**
   * Custom async validation with debouncing
   */
  asyncValidation: (
    asyncFn: (value: any, context: ValidationContext) => Promise<boolean | string>,
    debounceMs = 300
  ): ValidatorFunction => {
    const debounceMap = new Map<string, NodeJS.Timeout>();

    return (value, context, _props) => {
      return new Promise((resolve) => {
        const key = `${context.fieldId}-${JSON.stringify(value)}`;

        // Clear existing timeout
        if (debounceMap.has(key)) {
          clearTimeout(debounceMap.get(key)!);
        }

        // Set new timeout
        const timeout = setTimeout(async () => {
          try {
            const result = await asyncFn(value, context);

            if (result === true) {
              resolve({ isValid: true, errors: [] });
            } else {
              resolve({
                isValid: false,
                errors: [
                  {
                    code: 'async_validation_failed',
                    message: typeof result === 'string' ? result : 'Async validation failed',
                  },
                ],
              });
            }
          } catch (error) {
            resolve({
              isValid: false,
              errors: [
                {
                  code: 'async_validation_error',
                  message: error instanceof Error ? error.message : 'Async validation error',
                },
              ],
            });
          } finally {
            debounceMap.delete(key);
          }
        }, debounceMs);

        debounceMap.set(key, timeout);
      });
    };
  },
};

/**
 * Utility to create validation result
 * @param isValid - Whether validation passed
 * @param errors - Array of errors (optional)
 * @returns ValidationResult object
 */
export const createValidationResult = (
  isValid: boolean,
  errors: ValidationError[] = []
): ValidationResult => ({
  isValid,
  errors,
});

/**
 * Utility to create validation error
 * @param code - Error code
 * @param message - Error message
 * @param path - Error path (optional)
 * @returns ValidationError object
 */
export const createValidationError = (
  code: string,
  message: string,
  path?: string[]
): ValidationError => ({
  code,
  message,
  path,
});
