// Re-export types from form-engine
export type {
  FieldId,
  FieldValidationConfig,
  FormId,
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidatorFunction,
} from '@streamline/form-engine';

// Core validation engine exports
export {
  AsyncValidator,
  AsyncValidatorRegistry,
  createAsyncValidator,
  debounce,
  getAsyncValidatorRegistry,
  type AsyncValidationResult,
  type DebouncedValidatorOptions,
} from './async/async-validator';

export * from './cache';
export * from './engine';

export {
  createFieldLayer,
  createFlowLayer,
  createGlobalLayer,
  createGroupLayer,
  createPageLayer,
  evaluateConditions,
  ValidationLayerBuilder,
  ValidationLayerRegistry,
  ValidationLevel,
  type ValidationCondition,
  type ValidationLayer,
} from './layers';

export * from './resolvers/validation-resolvers';
export * from './validators/common-validators';
export * from './validators/zod-validator';

// Validation engine version
export const VERSION = '1.0.0';

// Convenience function to create a validation engine with common setup
export { createValidationEngine, getValidationEngine } from './engine';
