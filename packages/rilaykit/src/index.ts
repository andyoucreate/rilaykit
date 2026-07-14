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
  useFlow,
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
  useStep,
  useStepMetadata,
  type FlowStepsContext,
  type StepContextValue,
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowState,
  useWorkflowSubmission,
} from '@rilaykit/workflow';

// Stores
export {
  createWorkflowStore,
  useFlowStepIndex,
  useIsStepPassed,
  useIsStepVisited,
  usePassedSteps,
  useStepDataById,
  useVisitedSteps,
  useFlowActions,
  useFlowData,
  useFlowInitializing,
  useFlowNavigationState,
  useStepData,
  useFlowStore,
  useFlowStoreApi,
  useFlowSubmitState,
  useFlowSubmitting,
  useFlowTransitioning,
  WorkflowStoreContext,
  type CreateWorkflowStoreOptions,
  type UseFlowActionsResult,
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
