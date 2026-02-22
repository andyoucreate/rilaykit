/**
 * @fileoverview Custom hooks for form management
 *
 * GRANULAR HOOKS (recommended - minimal re-renders):
 * - useFieldValue: Get field value with granular subscription
 * - useFieldState: Get complete field state
 * - useFieldActions: Get stable action references for a field
 * - useFieldConditions: Get field conditions
 * - useFormSubmitting: Get form submitting state
 * - useFormValid: Get form validity
 *
 * UTILITY HOOKS:
 * - useConditionEvaluation: Evaluates conditional behaviors
 * - useFormConditions: Specialized hook for form conditional logic
 */

// Condition evaluation
export * from './useConditionEvaluation';
export * from './useFieldConditionsLazy';
export * from './useFormConditions';

// Zustand-based hooks
export * from './useFormSubmissionWithStore';
export * from './useFormValidationWithStore';

// Repeatable fields
export { useRepeatableField, type UseRepeatableFieldReturn } from './use-repeatable-field';

// Monitoring
export { useFormMonitoring } from './useFormMonitoring';
export type { UseFormMonitoringProps, UseFormMonitoringReturn } from './useFormMonitoring';
