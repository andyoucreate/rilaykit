/**
 * @rilaykit/validation-adapters - Zod Integration
 *
 * This module provides seamless integration between Zod schemas and Rilay forms.
 * It includes field validators, form validators, and utility functions to make
 * working with Zod in Rilay applications as smooth as possible.
 */

// Field validators
export {
  createZodValidator,
  createZodSyncValidator,
  createZodAsyncValidator,
} from './field-validator';

// Form validators
export {
  createZodFormValidator,
  createZodFormValidatorWithFieldErrors,
  createZodSyncFormValidator,
  createZodAsyncFormValidator,
} from './form-validator';

// Utilities and presets
export {
  zodErrorTransforms,
  zodPathFormatters,
  zodValidatorPresets,
  createZodValidatorWithPreset,
  createZodFormValidatorWithPreset,
  isZodError,
  type ZodInfer,
} from './utils';

// Re-export types for convenience
export type { ZodValidatorOptions } from '../types';
