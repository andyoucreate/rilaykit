/**
 * @fileoverview Validation system exports
 *
 * This module provides a comprehensive validation system for Rilay forms and workflows.
 * It includes type-safe validators, adapters for popular validation libraries,
 * and utilities for managing validation state.
 *
 * @example
 * ```typescript
 * import { createZodAdapter, createFieldValidator } from '@rilaykit/core';
 *
 * const zodAdapter = createZodAdapter();
 * const emailValidator = zodAdapter.createFieldValidator(z.string().email());
 * ```
 */

// Core validation types (re-exported from types)
export type {
  FieldValidationConfig,
  FieldValidator,
  FormValidationConfig,
  FormValidator,
  StepValidationConfig,
  StepValidator,
  ValidationAdapter,
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidationSchema,
} from '../types';

// Validation utilities
export {
  combineValidationResults,
  createValidationContext,
  createValidationResult,
  runValidators,
  runValidatorsAsync,
} from './utils';

// Built-in validators
export {
  async,
  custom,
  email,
  matchField,
  max,
  maxLength,
  min,
  minLength,
  number,
  pattern,
  required,
  url,
  when,
} from './validators';

// Validation adapters
export {
  createZodAdapter,
  zodFieldValidator,
  zodFormValidator,
  zodStepValidator,
  ZodValidationAdapter,
} from './adapters';
