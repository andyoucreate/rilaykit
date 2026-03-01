// =============================================================================
// @rilaykit/core — all exports
// =============================================================================
export * from '@rilaykit/core';

// =============================================================================
// @rilaykit/forms — all exports (includes useConditionEvaluation)
// =============================================================================
export * from '@rilaykit/forms';

// =============================================================================
// @rilaykit/workflow — selective exports (avoid conflicts with forms)
// Excluded: useConditionEvaluation, ConditionEvaluationResult (already in forms)
// =============================================================================

// Builder
export { flow, type StepDefinition } from '@rilaykit/workflow';

// Components
export {
  Workflow,
  WorkflowBody,
  WorkflowNextButton,
  WorkflowPreviousButton,
  WorkflowProvider,
  useWorkflowContext,
  WorkflowSkipButton,
  WorkflowStepper,
  type WorkflowContextValue,
} from '@rilaykit/workflow';

// Step context
export {
  createStepContext,
  type StepContext,
  type StepMetadata,
} from '@rilaykit/workflow';

// Hooks (except useConditionEvaluation — already exported by forms)
export {
  usePersistence,
  useStepMetadata,
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowState,
  useWorkflowSubmission,
} from '@rilaykit/workflow';

// Stores
export {
  createWorkflowStore,
  type WorkflowStore,
  type WorkflowStoreState,
  type CreateWorkflowStoreOptions,
  WorkflowStoreContext,
  useWorkflowStore,
  useCurrentStepIndex,
  useWorkflowTransitioning,
  useWorkflowInitializing,
  useWorkflowSubmitting,
  useWorkflowAllData,
  useWorkflowStepData,
  useStepDataById,
  useVisitedSteps,
  usePassedSteps,
  useIsStepVisited,
  useIsStepPassed,
  useWorkflowNavigationState,
  useWorkflowSubmitState,
  type UseWorkflowActionsResult,
  useWorkflowActions,
  useWorkflowStoreApi,
} from '@rilaykit/workflow';

// Persistence
export {
  LocalStorageAdapter,
  WorkflowPersistenceError,
  debounce,
  generateStorageKey,
  mergePersistedState,
  persistedToWorkflowState,
  validatePersistedData,
  workflowStateToPersisted,
  type LocalStorageAdapterConfig,
  type PersistedWorkflowData,
  type PersistenceOptions,
  type UsePersistenceReturn,
  type WorkflowPersistenceAdapter,
  type UsePersistenceProps,
} from '@rilaykit/workflow';

// Utils
export {
  combineWorkflowDataForConditions,
  flattenObject,
} from '@rilaykit/workflow';

// =============================================================================
// Enhanced ril — overrides @rilaykit/core's ril with .form() and .flow()
// =============================================================================
export { ril, type RilayKit } from './create-ril';
