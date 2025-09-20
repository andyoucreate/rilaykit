/**
 * @fileoverview Unified Standard Schema validation system
 *
 * This module provides a clean, unified validation system based entirely on Standard Schema.
 * It includes built-in validators, utilities, and seamless integration with external
 * Standard Schema compatible libraries like Zod, Yup, and Joi.
 *
 * @example
 * ```typescript
 * import { required, email } from '@rilaykit/core';
 * import { z } from 'zod';
 *
 * // All validation uses the same unified API
 * const form = rilay.form('user')
 *   .add({
 *     id: 'email',
 *     type: 'input',
 *     validation: {
 *       validate: [required(), z.string().email()] // Mix RilayKit + external libs!
 *     }
 *   });
 * ```
 */

// Core validation types (re-exported from types)
export type {
  FieldValidationConfig,
  FormValidationConfig,
  InferInput,
  InferOutput,
  StandardSchema,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from '../types';

// Essential validation utilities
export {
  createErrorResult,
  createSuccessResult,
  createValidationContext,
  createValidationResult,
} from './utils';

// Built-in validators (Standard Schema implementations)
export {
  async,
  combine,
  custom,
  email,
  max,
  maxLength,
  min,
  minLength,
  number,
  pattern,
  required,
  url,
} from './validators';

// Unified validation system (main API)
export {
  hasUnifiedValidation,
  validateFormWithUnifiedConfig,
  validateWithUnifiedConfig,
} from './unified-utils';

// Advanced utilities (for edge cases)
export {
  combineSchemas,
  createStandardValidator,
  getSchemaInfo,
  hasSchemaTypes,
  isStandardSchema,
  isValidationRule,
  normalizeValidationRules,
  validateWithStandardSchema,
} from './unified-utils';
