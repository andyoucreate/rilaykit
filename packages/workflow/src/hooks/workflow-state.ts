/**
 * The provider-level view of a workflow's state.
 *
 * This is the render-time snapshot `WorkflowProvider` publishes from the
 * Zustand store ({@link WorkflowStoreState}) and hands to the hooks that need
 * to read it. The store is the source of truth; this is its shape as consumers
 * see it.
 */
export interface WorkflowState {
  currentStepIndex: number;
  allData: Record<string, any>;
  stepData: Record<string, any>;
  /**
   * Live repeatable row order per step (`stepId -> repeatableId -> keys`),
   * mirrored from each step's form. Deliberately outside `allData`, which is the
   * host's completion payload — bookkeeping has no business in it. Optional: a
   * flow with no repeatable has none.
   */
  repeatableOrders?: Record<string, Record<string, string[]>>;
  visitedSteps: Set<string>;
  passedSteps: Set<string>;
  /**
   * Steps the user explicitly SKIPPED. The structural mirror of
   * {@link passedSteps}, disjoint from it: a skipped step that is later passed
   * leaves this set. The completion boundary reads it to keep skipped steps'
   * (unanswered) slices out of the payload.
   */
  skippedSteps: Set<string>;
  isSubmitting: boolean;
  isTransitioning: boolean;
  isInitializing: boolean;
}

/**
 * The lifecycle channel handed to `onComplete(data, meta)` alongside the
 * completion payload. Each array is the corresponding `workflowState` Set
 * rendered in insertion order (`[...set]`), so the host reads WHICH steps were
 * visited / skipped / passed without inferring it from the payload's shape —
 * the payload itself carries answers only.
 */
export interface WorkflowCompletionMeta {
  visitedSteps: string[];
  skippedSteps: string[];
  passedSteps: string[];
}
