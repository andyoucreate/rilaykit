// =============================================================================
// @rilaykit/forms — ISOMORPHIC entry (safe in a React Server Component).
// React components and hooks live behind `@rilaykit/forms/react`, which carries
// the `'use client'` boundary. Nothing here imports React (verified: the store
// hooks and their module-level `createContext` are in ./stores/formStoreContext).
// =============================================================================

// Builders
export { form as FormBuilder, form, resolveFormConfig } from './builders/form';
export type { FieldConfig } from './builders/form';
export { RepeatableBuilder } from './builders/repeatable-builder';

// Vanilla store factory (imported from the vanilla file, NOT the ./stores barrel,
// which also re-exports the client-only hooks)
export { createFormStore, type FormStore, type FormStoreState } from './stores/formStore';

// Utilities
export {
  structureFormValues,
  flattenRepeatableValues,
  buildCompositeKey,
  parseCompositeKey,
} from './utils/repeatable-data';
export {
  evaluateConditionLive,
  isFieldVisibleInData,
  isRepeatableVisible,
  pickVisibleSubmitValues,
  resolveFieldConditionalBehavior,
} from './utils/submit-visibility';
export type { VisibleSubmitValues } from './utils/submit-visibility';

// Schema layer (JSON form definitions)
export * from './schema';
