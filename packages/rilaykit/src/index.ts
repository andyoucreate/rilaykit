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
export { flow, resolveWorkflowConfig, type StepDefinition } from '@rilaykit/workflow';

// Components
export {
  Flow,
  FlowBack,
  FlowBody,
  FlowNext,
  FlowProgress,
  FlowSkip,
  useWorkflowContext,
  WorkflowProvider,
  type FlowNavContext,
  type FlowNavProps,
  type FlowProgressProps,
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
  useFlowSteps,
  usePersistence,
  useStepMetadata,
  type FlowStepsContext,
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowState,
  useWorkflowSubmission,
} from '@rilaykit/workflow';

// Stores
export {
  createWorkflowStore,
  useCurrentStepIndex,
  useIsStepPassed,
  useIsStepVisited,
  usePassedSteps,
  useStepDataById,
  useVisitedSteps,
  useWorkflowActions,
  useWorkflowAllData,
  useWorkflowInitializing,
  useWorkflowNavigationState,
  useWorkflowStepData,
  useWorkflowStore,
  useWorkflowStoreApi,
  useWorkflowSubmitState,
  useWorkflowSubmitting,
  useWorkflowTransitioning,
  WorkflowStoreContext,
  type CreateWorkflowStoreOptions,
  type UseWorkflowActionsResult,
  type WorkflowStore,
  type WorkflowStoreState,
} from '@rilaykit/workflow';

// Persistence
export {
  debounce,
  generateStorageKey,
  LocalStorageAdapter,
  mergePersistedState,
  persistedToWorkflowState,
  validatePersistedData,
  WorkflowPersistenceError,
  workflowStateToPersisted,
  type LocalStorageAdapterConfig,
  type PersistedWorkflowData,
  type PersistenceOptions,
  type UsePersistenceProps,
  type UsePersistenceReturn,
  type WorkflowPersistenceAdapter,
} from '@rilaykit/workflow';

// Utils
export {
  combineWorkflowDataForConditions,
  flattenObject,
  resolveAllowSkip,
} from '@rilaykit/workflow';

// =============================================================================
// Enhanced ril — overrides @rilaykit/core's ril with .form() and .flow()
// =============================================================================
export { ril, type RilayKit } from './create-ril';
