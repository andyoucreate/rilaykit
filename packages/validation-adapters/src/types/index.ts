import type { FieldValidator, ValidationError, ValidationResult } from '@rilaykit/core';

/**
 * Common options for all validation adapters
 */
export interface BaseValidatorOptions {
  /**
   * Custom error transformation function
   * @param errors - Array of adapter-specific errors
   * @returns Transformed error message
   */
  errorTransform?: (errors: any[]) => string;

  /**
   * Whether to stop on first error or collect all errors
   * @default false
   */
  abortEarly?: boolean;
}

/**
 * Options specific to Zod validator
 */
export interface ZodValidatorOptions extends BaseValidatorOptions {
  /**
   * Parsing mode for Zod validation
   * @default 'sync'
   */
  parseMode?: 'sync' | 'async';

  /**
   * Custom path formatting for nested field errors
   * @param path - Array representing the field path
   * @returns Formatted path string
   */
  pathFormatter?: (path: (string | number)[]) => string;
}

/**
 * Options specific to Yup validator
 */
export interface YupValidatorOptions extends BaseValidatorOptions {
  /**
   * Yup validation context
   */
  context?: Record<string, any>;

  /**
   * Whether to strip unknown keys
   * @default false
   */
  stripUnknown?: boolean;

  /**
   * Custom path formatting for nested field errors
   * @param path - Array representing the field path
   * @returns Formatted path string
   */
  pathFormatter?: (path: (string | number)[]) => string;
}

/**
 * Options specific to Joi validator
 */
export interface JoiValidatorOptions extends BaseValidatorOptions {
  /**
   * Joi validation context
   */
  context?: Record<string, any>;

  /**
   * Whether to allow unknown keys
   * @default false
   */
  allowUnknown?: boolean;

  /**
   * Custom path formatting for nested field errors
   * @param path - Array representing the field path
   * @returns Formatted path string
   */
  pathFormatter?: (path: (string | number)[]) => string;
}

/**
 * Result of form-level validation with field-specific errors
 */
export interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, ValidationError[]>;
}

/**
 * Form validator function type
 */
export type FormValidator<T = Record<string, any>> = (
  formData: T
) => ValidationResult | Promise<ValidationResult>;

/**
 * Utility type for extracting schema type from validation library schemas
 */
export type SchemaType<T> = T extends { _output: infer U }
  ? U // Zod
  : T extends { __outputType: infer U }
    ? U // Yup
    : T extends { _valids: any }
      ? any // Joi
      : unknown;

/**
 * Adapter factory function type
 */
export type AdapterFactory<TSchema, TOptions = BaseValidatorOptions> = <T = SchemaType<TSchema>>(
  schema: TSchema,
  options?: TOptions
) => FieldValidator<T>;

/**
 * Form adapter factory function type
 */
export type FormAdapterFactory<TSchema, TOptions = BaseValidatorOptions> = <
  T = SchemaType<TSchema>,
>(
  schema: TSchema,
  options?: TOptions
) => FormValidator<T>;
