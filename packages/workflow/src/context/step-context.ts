import type { StepDataHelper, WorkflowContext } from '@rilaykit/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Structured metadata for workflow steps
 */
export interface StepMetadata {
  /** Icon identifier (e.g., 'user', 'payment', 'check') */
  icon?: string;
  /** Category for grouping steps */
  category?: string;
  /** Tags for filtering or organization */
  tags?: string[];
  /** Extensible - add any custom metadata */
  [key: string]: any;
}

/**
 * Simplified context for step callbacks
 *
 * Replaces the verbose (stepData, helper, context) signature with a single
 * structured object containing everything needed for step logic.
 */
export interface StepContext {
  /** Current step's validated data */
  readonly data: Record<string, any>;

  /** Controls for the next step */
  readonly next: {
    /** Pre-fill fields in the next step */
    prefill(fields: Record<string, any>): void;
    /** Skip the next step */
    skip(): void;
  };

  /** Access to workflow-level data and navigation */
  readonly workflow: {
    /** Get data from a specific step by ID */
    get<T = any>(stepId: string): T;
    /** Get all workflow data across all steps */
    all<T = any>(): T;
    /** Navigate to a specific step by ID */
    goto(stepId: string): void;
  };

  /** Step metadata */
  readonly meta: StepMetadata;

  /** Context flags */
  readonly isFirst: boolean;
  readonly isLast: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a StepContext from the legacy helper/context system
 *
 * This factory wraps the old (stepData, helper, context) pattern into
 * the new simplified StepContext API.
 *
 * @param stepData - Validated data from the current step
 * @param helper - Legacy StepDataHelper with mutation methods
 * @param workflowContext - Legacy WorkflowContext with workflow state
 * @param metadata - Step metadata
 * @returns Structured StepContext for use in after() callbacks
 */
export function createStepContext(
  stepData: Record<string, any>,
  helper: StepDataHelper,
  workflowContext: WorkflowContext,
  metadata?: StepMetadata
): StepContext {
  return {
    data: stepData,

    next: {
      prefill: (fields: Record<string, any>) => {
        helper.setNextStepFields(fields);
      },
      skip: () => {
        // NOTE: Cannot be implemented with current architecture.
        // The after() callback runs BEFORE navigation (in goNext()),
        // so we cannot skip the next step from within this callback.
        // To skip steps dynamically, use step conditions with `when()`.
        console.warn('step.next.skip() is not supported. Use step conditions with when() instead.');
      },
    },

    workflow: {
      get: <T = any>(stepId: string): T => {
        return helper.getStepData(stepId) as T;
      },
      all: <T = any>(): T => {
        return helper.getAllData() as T;
      },
      goto: (_stepId: string) => {
        // NOTE: Cannot be implemented with current architecture.
        // The after() callback runs BEFORE navigation (in goNext()),
        // so we cannot redirect to a different step from within this callback.
        // To conditionally show/hide steps, use step conditions with `when()`.
        console.warn(
          'step.workflow.goto() is not supported. Use step conditions with when() instead.'
        );
      },
    },

    meta: metadata || {},

    isFirst: workflowContext.isFirstStep,
    isLast: workflowContext.isLastStep,
  };
}
