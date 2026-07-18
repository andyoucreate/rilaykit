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
  isSubmitting: boolean;
  isTransitioning: boolean;
  isInitializing: boolean;
}
