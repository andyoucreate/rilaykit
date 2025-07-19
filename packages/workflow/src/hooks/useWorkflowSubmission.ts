import type { WorkflowConfig, WorkflowContext } from '@rilaykit/core';
import { useCallback, useRef } from 'react';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowSubmissionProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  setSubmitting: (isSubmitting: boolean) => void;
  onWorkflowComplete?: (data: Record<string, any>) => void | Promise<void>;
  analyticsStartTime: React.MutableRefObject<number>;
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
  analyticsStartTime,
}: UseWorkflowSubmissionProps): UseWorkflowSubmissionReturn {
  // Use ref to avoid recreating callbacks when onWorkflowComplete changes
  const onWorkflowCompleteRef = useRef(onWorkflowComplete);
  onWorkflowCompleteRef.current = onWorkflowComplete;

  // Submit workflow
  const submitWorkflow = useCallback(async () => {
    setSubmitting(true);

    try {
      // Call onWorkflowComplete callback if provided
      if (onWorkflowCompleteRef.current) {
        await onWorkflowCompleteRef.current(workflowState.allData);
      }

      // Track workflow completion analytics
      if (workflowConfig.analytics?.onWorkflowComplete) {
        const totalTime = Date.now() - analyticsStartTime.current;
        workflowConfig.analytics.onWorkflowComplete(
          workflowConfig.id,
          totalTime,
          workflowState.allData
        );
      }
    } catch (error) {
      console.error('Workflow submission failed:', error);
      if (workflowConfig.analytics?.onError) {
        workflowConfig.analytics.onError(error as Error, workflowContext);
      }
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [
    workflowState.allData,
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

    // Check if we're on the last step
    const isLastStep = workflowState.currentStepIndex === workflowConfig.steps.length - 1;

    return isLastStep;
  }, [workflowState.isSubmitting, workflowState.currentStepIndex, workflowConfig.steps.length]);

  return {
    submitWorkflow,
    isSubmitting: workflowState.isSubmitting,
    canSubmit: canSubmit(),
  };
}
