/**
 * @rilaykit/validation-adapters
 *
 * Validation adapters for popular schema libraries to integrate with Rilay forms.
 * This package provides seamless integration between external validation libraries
 * and Rilay's powerful form and workflow system.
 *
 * Supported libraries:
 * - Zod (✅ Available)
 * - Yup (✅ Available)
 * - Joi (✅ Available)
 */

// Export all types
export type {
  AdapterFactory,
  BaseValidatorOptions,
  FormAdapterFactory,
  FormValidationResult,
  FormValidator,
  JoiValidatorOptions,
  SchemaType,
  YupValidatorOptions,
  ZodValidatorOptions,
} from './types';

// Zod integration
export * from './zod';

// Yup integration
export * from './yup';

// Joi integration
export * from './joi';
