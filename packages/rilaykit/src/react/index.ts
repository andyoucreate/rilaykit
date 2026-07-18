'use client';

// =============================================================================
// rilaykit/react — the CLIENT surface of the all-in-one: every React component
// and hook from forms / workflow / agent. The main entry (`../index.ts`) stays
// isomorphic; these carry the `'use client'` boundary Next.js App Router needs.
// =============================================================================

// @rilaykit/forms — components + field hooks + store selector/action hooks
export * from '@rilaykit/forms/react';

// @rilaykit/agent — Catalog, Part, Parts, and the built-in fallbacks
export * from '@rilaykit/agent/react';

// @rilaykit/workflow — components + hooks, selective to avoid conflicts with
// forms/react (useConditionEvaluation / ConditionEvaluationResult live there)

// Compound components
export {
  Flow,
  FlowBack,
  FlowBody,
  FlowNext,
  FlowProgress,
  FlowSkip,
  useFlow,
} from '@rilaykit/workflow/react';
export type {
  FlowNavContext,
  FlowNavProps,
  FlowProgressProps,
  WorkflowContextValue,
} from '@rilaykit/workflow/react';

// Hooks
export { useFlowSteps, useStep } from '@rilaykit/workflow/react';
export type { FlowStepsContext, StepContextValue } from '@rilaykit/workflow/react';

// Store selector/action hooks
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
  useIsStepSkipped,
  useIsStepVisited,
  usePassedSteps,
  useSkippedSteps,
  useStepData,
  useStepDataById,
  useVisitedSteps,
} from '@rilaykit/workflow/react';
export type { UseFlowActionsResult } from '@rilaykit/workflow/react';

// Persistence hook
export { usePersistence } from '@rilaykit/workflow/react';
export type { UsePersistenceProps } from '@rilaykit/workflow/react';
