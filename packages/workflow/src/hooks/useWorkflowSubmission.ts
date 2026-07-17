import { getLogger } from '@rilaykit/core';
import type { WorkflowConfig, WorkflowContext } from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import { pickVisibleCompletionData } from '../utils/pickVisibleCompletionData';
import { structureWorkflowData } from '../utils/structureWorkflowData';
import type { WorkflowCompletionMeta, WorkflowState } from './workflow-state';

const log = getLogger('workflow:submission');

/**
 * The three lifecycle Sets read live at the submission boundary — see
 * {@link UseWorkflowSubmissionProps.getLifecycleSets}.
 */
type LifecycleSets = Pick<WorkflowState, 'visitedSteps' | 'skippedSteps' | 'passedSteps'>;

/**
 * Render each lifecycle Set as an insertion-ordered array — the pure `meta`
 * projection handed to `onComplete(data, meta)`. Colocated with the boundary
 * that produces it; a Set's iteration order IS insertion order, so `[...set]`
 * is the whole derivation.
 */
function buildCompletionMeta(lifecycle: LifecycleSets): WorkflowCompletionMeta {
  return {
    visitedSteps: [...lifecycle.visitedSteps],
    skippedSteps: [...lifecycle.skippedSteps],
    passedSteps: [...lifecycle.passedSteps],
  };
}

export interface UseWorkflowSubmissionProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  setSubmitting: (isSubmitting: boolean) => void;
  /**
   * Completion callback. The second `meta` argument carries the lifecycle
   * channel ({@link WorkflowCompletionMeta}); it is additive, so existing
   * `onComplete(data)` callers keep working unchanged.
   */
  onWorkflowComplete?: (
    data: Record<string, any>,
    meta: WorkflowCompletionMeta
  ) => void | Promise<void>;
  /**
   * Live accessor for the latest `allData`. The `workflowState` prop is a
   * render-time snapshot: on the FINAL step, `handleSubmit` writes the step
   * values into the store then calls `submitWorkflow()` synchronously in the
   * same tick — no React commit between — so the snapshot still holds the
   * pre-submit final-step slice (missing untouched defaults). Reading the store
   * live mirrors {@link useWorkflowNavigation}.
   */
  getAllData: () => Record<string, unknown>;
  /**
   * Live accessor for the current step's data mirror — same rationale as
   * {@link getAllData}. Feeds the visibility evaluation that keeps hidden
   * steps/fields out of the completion payload: `useWorkflowConditions`
   * evaluates against `combine(allData, stepData)`, and the payload filter
   * must measure visibility the same way, live.
   */
  getStepData?: () => Record<string, unknown>;
  /**
   * Live accessor for the mirrored repeatable row order, per step. The store
   * holds each slice flat; the completion payload is structured on the way out,
   * and only this can put the rows in the order the user arranged them.
   */
  getRepeatableOrders?: () => Record<string, Record<string, string[]>>;
  /**
   * Live accessor for the three lifecycle Sets — same rationale as
   * {@link getAllData}. The `skippedSteps` set gates the completion payload
   * (skipped steps ship no slice), and all three become the ordered `meta`
   * arrays. Read LIVE because a TERMINAL skip marks the step skipped
   * synchronously and then completes in the same tick, before any React commit
   * refreshes the render snapshot.
   */
  getLifecycleSets?: () => LifecycleSets;
  analyticsStartTime: React.MutableRefObject<number>;
  /**
   * Shared flag flipped once the workflow completes so the abandon cleanup in
   * {@link useWorkflowAnalytics} does not treat a normal completion as an
   * abandonment on unmount.
   */
  workflowCompletedRef: React.MutableRefObject<boolean>;
  /**
   * Clears any persisted state for this workflow. Called on genuine completion
   * so re-mounting the same provider starts fresh instead of resurrecting the
   * completed workflow's data. Absent when persistence is not configured.
   */
  clearPersistedState?: () => Promise<void>;
}

export interface UseWorkflowSubmissionReturn {
  submitWorkflow: () => Promise<void>;
  isSubmitting: boolean;
  canSubmit: boolean;
}

export function useWorkflowSubmission({
  workflowConfig,
  workflowState,
  workflowContext,
  setSubmitting,
  onWorkflowComplete,
  getAllData,
  getStepData,
  getRepeatableOrders,
  getLifecycleSets,
  analyticsStartTime,
  workflowCompletedRef,
  clearPersistedState,
}: UseWorkflowSubmissionProps): UseWorkflowSubmissionReturn {
  // Use ref to avoid recreating callbacks when onWorkflowComplete changes
  const onWorkflowCompleteRef = useRef(onWorkflowComplete);
  onWorkflowCompleteRef.current = onWorkflowComplete;
  const clearPersistedStateRef = useRef(clearPersistedState);
  clearPersistedStateRef.current = clearPersistedState;

  // Submit workflow
  // biome-ignore lint/correctness/useExhaustiveDependencies: workflowCompletedRef is a ref written for its side effect, not an input that should recreate the callback
  const submitWorkflow = useCallback(async () => {
    setSubmitting(true);

    // Read the completion payload from the LIVE store, not the render-time
    // snapshot: on the final step the just-written step data has not committed
    // to a new render yet (see getAllData docs).
    //
    // The store holds every slice FLAT — one internal shape, so a removed
    // repeatable row has keys to delete and no writer can disagree about what
    // the step holds. The host contract is the AUTHORED shape, so the payload
    // is structured here, at the boundary. Doing it here rather than trusting
    // whatever shape happened to be written also makes the payload independent
    // of HOW the user completed the flow: a flow finished with a custom submit
    // button now yields the same nested arrays as one finished through the
    // form's own submit.
    //
    // Before structuring, CURRENTLY-HIDDEN and SKIPPED steps are dropped: the
    // seeded defaults of a step the user never reached (or skipped), and the
    // values of fields whose question stands retracted, live in the store on
    // purpose — but shipping them to the host would hand it answers the user
    // never gave, byte-identical to real ones. The payload is a PURE PROJECTION
    // of answers: "skipped", "never visible" and "never existed" all collapse
    // to one honest encoding — absence. Validation already treats the invisible
    // as nonexistent; the payload boundary agrees, and adds the skipped here.
    const lifecycle = getLifecycleSets?.() ?? {
      visitedSteps: new Set<string>(),
      passedSteps: new Set<string>(),
      skippedSteps: new Set<string>(),
    };
    const completionData = structureWorkflowData(
      pickVisibleCompletionData(
        getAllData(),
        workflowConfig.steps,
        getStepData?.() ?? {},
        lifecycle.skippedSteps
      ),
      workflowConfig.steps,
      getRepeatableOrders?.()
    );

    // The lifecycle travels on its OWN channel — the ordered mirror of the
    // store's Sets — so the host reads which steps were visited / skipped /
    // passed without inferring it from the payload shape.
    const completionMeta = buildCompletionMeta(lifecycle);

    try {
      // Call onWorkflowComplete callback if provided
      if (onWorkflowCompleteRef.current) {
        await onWorkflowCompleteRef.current(completionData, completionMeta);
      }

      // Track workflow completion analytics
      if (workflowConfig.analytics?.onWorkflowComplete) {
        const totalTime = Date.now() - analyticsStartTime.current;
        workflowConfig.analytics.onWorkflowComplete(workflowConfig.id, totalTime, completionData);
      }

      // Mark completion so unmount does not fire onWorkflowAbandon.
      workflowCompletedRef.current = true;

      // Clear persisted state on genuine completion so a re-mount starts fresh
      // instead of resurrecting the finished workflow's data.
      if (clearPersistedStateRef.current) {
        try {
          await clearPersistedStateRef.current();
        } catch (clearError) {
          log.error('Failed to clear persisted state after completion:', clearError);
        }
      }
    } catch (error) {
      log.error('Workflow submission failed:', error);
      if (workflowConfig.analytics?.onError) {
        workflowConfig.analytics.onError(error as Error, workflowContext);
      }
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [
    getAllData,
    getStepData,
    getRepeatableOrders,
    getLifecycleSets,
    workflowConfig.steps,
    workflowConfig.analytics,
    workflowConfig.id,
    workflowContext,
    analyticsStartTime,
    setSubmitting,
  ]);

  // Check if workflow can be submitted
  const canSubmit = useCallback(() => {
    // Basic check: not currently submitting
    if (workflowState.isSubmitting) return false;

    // Terminal check must use the last VISIBLE step, not the raw last index:
    // when the final raw step is conditionally hidden, the last visible step is
    // the real terminal step. `handleSubmit` already gates on this same
    // `workflowContext.isLastStep`, so canSubmit must agree or a custom submit
    // button wired to `useFlow().canSubmit` could never submit.
    return workflowContext.isLastStep;
  }, [workflowState.isSubmitting, workflowContext.isLastStep]);

  return {
    submitWorkflow,
    isSubmitting: workflowState.isSubmitting,
    canSubmit: canSubmit(),
  };
}
