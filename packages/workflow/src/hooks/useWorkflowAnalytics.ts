import type { WorkflowConfig, WorkflowContext } from '@rilaykit/core';
import { useCallback, useEffect, useRef } from 'react';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowAnalyticsProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
}

export interface UseWorkflowAnalyticsReturn {
  analyticsStartTime: React.MutableRefObject<number>;
  trackStepSkip: (stepId: string, reason: string) => void;
  trackError: (error: Error) => void;
}

export function useWorkflowAnalytics({
  workflowConfig,
  workflowState,
  workflowContext,
}: UseWorkflowAnalyticsProps): UseWorkflowAnalyticsReturn {
  const analyticsStartTime = useRef<number>(Date.now());
  const stepStartTimes = useRef<Map<string, number>>(new Map());
  const workflowStartedRef = useRef<boolean>(false);
  const currentStepRef = useRef<string | null>(null);

  // Track workflow start - only once
  useEffect(() => {
    if (workflowConfig.analytics?.onWorkflowStart && !workflowStartedRef.current) {
      workflowStartedRef.current = true;
      workflowConfig.analytics.onWorkflowStart(workflowConfig.id, workflowContext);
    }
  }, [workflowConfig.id, workflowConfig.analytics, workflowContext]);

  // Track step changes and completion
  useEffect(() => {
    const currentStep = workflowConfig.steps[workflowState.currentStepIndex];
    if (!currentStep) return;

    // Only trigger if step actually changed
    if (currentStepRef.current === currentStep.id) return;

    // Track step completion for previous step
    if (currentStepRef.current && workflowConfig.analytics?.onStepComplete) {
      const startTime = stepStartTimes.current.get(currentStepRef.current);
      if (startTime) {
        workflowConfig.analytics.onStepComplete(
          currentStepRef.current,
          Date.now() - startTime,
          workflowState.stepData,
          workflowContext
        );
      }
    }

    // Update current step reference
    currentStepRef.current = currentStep.id;

    // Track step start for new step
    stepStartTimes.current.set(currentStep.id, Date.now());
    if (workflowConfig.analytics?.onStepStart) {
      workflowConfig.analytics.onStepStart(currentStep.id, Date.now(), workflowContext);
    }
  }, [
    workflowState.currentStepIndex,
    workflowConfig.steps,
    workflowConfig.analytics,
    workflowContext,
    workflowState.stepData,
  ]);

  // Helper to track step skips
  const trackStepSkip = useCallback(
    (stepId: string, reason: string) => {
      if (workflowConfig.analytics?.onStepSkip) {
        workflowConfig.analytics.onStepSkip(stepId, reason, workflowContext);
      }
    },
    [workflowConfig.analytics, workflowContext]
  );

  // Helper to track errors
  const trackError = useCallback(
    (error: Error) => {
      if (workflowConfig.analytics?.onError) {
        workflowConfig.analytics.onError(error, workflowContext);
      }
    },
    [workflowConfig.analytics, workflowContext]
  );

  return {
    analyticsStartTime,
    trackStepSkip,
    trackError,
  };
}
