/**
 * @fileoverview Custom hooks for workflow management
 *
 * This module exports custom hooks that encapsulate specific aspects of workflow behavior:
 * - useWorkflowState: Manages workflow state with reducer pattern
 * - useWorkflowConditions: Handles step and field conditional logic
 * - useWorkflowNavigation: Manages navigation between workflow steps
 * - useWorkflowSubmission: Handles workflow submission workflow
 * - useWorkflowAnalytics: Manages workflow analytics and tracking
 * - useConditionEvaluation: Evaluates conditional behaviors (from existing code)
 * - usePersistence: Manages workflow persistence with adapters
 *
 * These hooks enable a cleaner, more maintainable WorkflowProvider by separating concerns.
 */

export { useConditionEvaluation } from './useConditionEvaluation';
export { usePersistence } from './usePersistence';
export { useStepMetadata } from './useStepMetadata';
export { useWorkflowAnalytics } from './useWorkflowAnalytics';
export { useWorkflowConditions } from './useWorkflowConditions';
export { useWorkflowNavigation } from './useWorkflowNavigation';
export { useWorkflowState } from './useWorkflowState';
export { useWorkflowSubmission } from './useWorkflowSubmission';
