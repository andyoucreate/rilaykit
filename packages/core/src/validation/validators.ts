/**
 * Built-in validators implementing Standard Schema interface
 * All RilayKit validators now implement Standard Schema for consistency
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isEmptyValue } from './utils';

// =================================================================
// STANDARD SCHEMA VALIDATORS - RILAY BUILT-INS
// =================================================================

/**
 * Required field validator - Standard Schema implementation
 */
export function required(message = 'This field is required'): StandardSchemaV1<any> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        return isEmptyValue(value) ? { issues: [{ message, path: undefined }] } : { value };
      },
    },
  };
}

/**
 * Email validation - Standard Schema implementation
 */
export function email(message = 'Please enter a valid email address'): StandardSchemaV1<string> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return { issues: [{ message: 'Email must be a string' }] };
        }

        return emailRegex.test(value) ? { value } : { issues: [{ message }] };
      },
      types: {
        input: '' as string,
        output: '' as string,
      },
    },
  };
}

/**
 * URL validation - Standard Schema implementation
 */
export function url(message = 'Please enter a valid URL'): StandardSchemaV1<string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return { issues: [{ message: 'URL must be a string' }] };
        }

        try {
          new URL(value);
          return { value };
        } catch {
          return { issues: [{ message }] };
        }
      },
      types: {
        input: '' as string,
        output: '' as string,
      },
    },
  };
}

/**
 * Minimum length validation - Standard Schema implementation
 */
export function minLength(min: number, message?: string): StandardSchemaV1<string> {
  const defaultMessage = `Must be at least ${min} characters long`;

  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return { issues: [{ message: 'Value must be a string' }] };
        }

        return value.length >= min
          ? { value }
          : { issues: [{ message: message || defaultMessage }] };
      },
      types: {
        input: '' as string,
        output: '' as string,
      },
    },
  };
}

/**
 * Maximum length validation - Standard Schema implementation
 */
export function maxLength(max: number, message?: string): StandardSchemaV1<string> {
  const defaultMessage = `Must be no more than ${max} characters long`;

  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return { issues: [{ message: 'Value must be a string' }] };
        }

        return value.length <= max
          ? { value }
          : { issues: [{ message: message || defaultMessage }] };
      },
      types: {
        input: '' as string,
        output: '' as string,
      },
    },
  };
}

/**
 * Pattern validation - Standard Schema implementation
 */
export function pattern(
  regex: RegExp,
  message = 'Value does not match required pattern'
): StandardSchemaV1<string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        if (typeof value !== 'string') {
          return { issues: [{ message: 'Value must be a string' }] };
        }

        return regex.test(value) ? { value } : { issues: [{ message }] };
      },
      types: {
        input: '' as string,
        output: '' as string,
      },
    },
  };
}

/**
 * Number validation - Standard Schema implementation
 */
export function number(message = 'Must be a valid number'): StandardSchemaV1<number> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        const num = typeof value === 'string' ? Number(value) : value;

        if (typeof num !== 'number' || Number.isNaN(num)) {
          return { issues: [{ message }] };
        }

        return { value: num };
      },
      types: {
        input: 0 as number,
        output: 0 as number,
      },
    },
  };
}

/**
 * Minimum value validation - Standard Schema implementation
 */
export function min(minValue: number, message?: string): StandardSchemaV1<number> {
  const defaultMessage = `Must be at least ${minValue}`;

  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        const num = typeof value === 'string' ? Number(value) : value;

        if (typeof num !== 'number' || Number.isNaN(num)) {
          return { issues: [{ message: 'Value must be a number' }] };
        }

        return num >= minValue
          ? { value: num }
          : { issues: [{ message: message || defaultMessage }] };
      },
      types: {
        input: 0 as number,
        output: 0 as number,
      },
    },
  };
}

/**
 * Maximum value validation - Standard Schema implementation
 */
export function max(maxValue: number, message?: string): StandardSchemaV1<number> {
  const defaultMessage = `Must be no more than ${maxValue}`;

  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        const num = typeof value === 'string' ? Number(value) : value;

        if (typeof num !== 'number' || Number.isNaN(num)) {
          return { issues: [{ message: 'Value must be a number' }] };
        }

        return num <= maxValue
          ? { value: num }
          : { issues: [{ message: message || defaultMessage }] };
      },
      types: {
        input: 0 as number,
        output: 0 as number,
      },
    },
  };
}

/**
 * Custom validator - Standard Schema implementation
 */
export function custom<T>(
  fn: (value: T) => boolean,
  message = 'Validation failed'
): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: (value: unknown) => {
        try {
          const isValid = fn(value as T);
          return isValid ? { value: value as T } : { issues: [{ message }] };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : message,
              },
            ],
          };
        }
      },
    },
  };
}

/**
 * Async validator - Standard Schema implementation
 */
export function async<T>(
  fn: (value: T) => Promise<boolean>,
  message = 'Async validation failed'
): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: async (value: unknown) => {
        try {
          const isValid = await fn(value as T);
          return isValid ? { value: value as T } : { issues: [{ message }] };
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : message,
              },
            ],
          };
        }
      },
    },
  };
}

/**
 * Utility to combine multiple Standard Schema validators
 * This creates a new Standard Schema that runs all validations
 */
export function combine<T>(...schemas: StandardSchemaV1<T>[]): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'rilaykit',
      validate: async (value: unknown) => {
        const allIssues: StandardSchemaV1.Issue[] = [];
        let finalValue = value;

        for (const schema of schemas) {
          let result = schema['~standard'].validate(value);

          // Handle async validation
          if (result instanceof Promise) {
            result = await result;
          }

          if (result.issues) {
            allIssues.push(...result.issues);
          } else {
            finalValue = result.value;
          }
        }

        return allIssues.length > 0 ? { issues: allIssues } : { value: finalValue as T };
      },
    },
  };
}
