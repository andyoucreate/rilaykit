/**
 * @fileoverview Custom hooks for form management
 *
 * This module exports custom hooks that encapsulate specific aspects of form behavior:
 * - useFormState: Manages form state with reducer pattern
 * - useFormValidation: Handles all validation logic
 * - useFormSubmission: Manages form submission workflow
 * - useConditionEvaluation: Evaluates conditional behaviors
 * - useFormConditions: Specialized hook for form conditional logic
 *
 * These hooks enable a cleaner, more maintainable FormProvider by separating concerns.
 */

export * from './useConditionEvaluation';
export * from './useFormConditions';
export * from './useFormState';
export * from './useFormSubmission';
export * from './useFormValidation';

export { useFormMonitoring } from './useFormMonitoring';
export type { UseFormMonitoringProps, UseFormMonitoringReturn } from './useFormMonitoring';
