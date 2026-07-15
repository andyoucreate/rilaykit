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

// Compound components
export {
  Flow,
  FlowBack,
  FlowBody,
  FlowNext,
  FlowProgress,
  FlowSkip,
  useFlow,
  type FlowNavContext,
  type FlowNavProps,
  type FlowProgressProps,
  type WorkflowContextValue,
} from '@rilaykit/workflow';

// Schema layer (JSON flow definitions)
export {
  compileFlow,
  isFlowSchema,
  validateFlowSchema,
  type AfterValidationHandler,
  type AllowSkipPredicate,
  type CompileFlowOptions,
  type FlowBindings,
  type FlowSchema,
  type FlowSchemaStep,
} from '@rilaykit/workflow';

// Hooks (except useConditionEvaluation — already exported by forms)
export {
  useFlowSteps,
  useStep,
  type FlowStepsContext,
  type StepContext,
  type StepContextValue,
  type StepMetadata,
} from '@rilaykit/workflow';

// Stores
export {
  useFlowActions,
  useFlowData,
  useFlowInitializing,
  useFlowNavigationState,
  useFlowStepIndex,
  useFlowStore,
  useFlowStoreApi,
  useFlowSubmitState,
  useFlowSubmitting,
  useFlowTransitioning,
  useIsStepPassed,
  useIsStepVisited,
  usePassedSteps,
  useStepData,
  useStepDataById,
  useVisitedSteps,
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
  usePersistence,
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
