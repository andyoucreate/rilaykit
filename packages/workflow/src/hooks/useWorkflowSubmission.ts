import { getLogger } from '@rilaykit/core';
import type { WorkflowConfig, WorkflowContext } from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { WorkflowState } from './useWorkflowState';

const log = getLogger('workflow:submission');

export interface UseWorkflowSubmissionProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  setSubmitting: (isSubmitting: boolean) => void;
  onWorkflowComplete?: (data: Record<string, any>) => void | Promise<void>;
  /**
   * Live accessor for the latest `allData`. The `workflowState` prop is a
   * render-time snapshot: on the FINAL step, `handleSubmit` writes the
   * structured step values into the store then calls `submitWorkflow()`
   * synchronously in the same tick — no React commit between — so the snapshot
   * still holds the pre-submit final-step slice (flat repeatable composite
   * keys, missing untouched defaults). Reading the store live mirrors
   * {@link useWorkflowNavigation} and hands the callbacks the canonical
   * structured completion payload.
   */
  getAllData: () => Record<string, unknown>;
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
  const submitWorkflow = useCallback(async () => {
    setSubmitting(true);

    // Read the completion payload from the LIVE store, not the render-time
    // snapshot: on the final step the just-written structured step data has not
    // committed to a new render yet (see getAllData docs).
    const completionData = getAllData();

    try {
      // Call onWorkflowComplete callback if provided
      if (onWorkflowCompleteRef.current) {
        await onWorkflowCompleteRef.current(completionData);
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
