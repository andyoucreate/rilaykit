/**
 * @rilaykit/validation-adapters - Joi Integration
 *
 * This module provides seamless integration between Joi schemas and Rilay forms.
 * It includes field validators, form validators, and utility functions to make
 * working with Joi in Rilay applications as smooth as possible.
 */

// Field validators
export {
  createJoiLenientValidator,
  createJoiStrictValidator,
  createJoiValidator,
} from './field-validator';

// Form validators
export {
  createJoiFormValidator,
  createJoiFormValidatorWithFieldErrors,
  createJoiLenientFormValidator,
  createJoiStrictFormValidator,
} from './form-validator';

// Utilities and helpers
export {
  createJoiFormValidatorWithPreset,
  createJoiValidationOptions,
  createJoiValidatorWithPreset,
  isJoiError,
  joiErrorTransforms,
  joiMessages,
  joiPathFormatters,
  joiValidatorPresets,
} from './utils';

// Re-export types for convenience
export type { JoiValidatorOptions } from '../types';
