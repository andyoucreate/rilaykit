import {
  type WorkflowConfig,
  type WorkflowContext,
  type WorkflowPerformanceMetrics,
  getGlobalMonitor,
} from '@rilaykit/core';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowAnalyticsProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  /**
   * Shared signal set by {@link useWorkflowNavigation.skipStep} carrying the id
   * of a step that was skipped (not validated). A skip is not a completion, so
   * the step-change effect must suppress `onStepComplete` for it exactly once.
   */
  pendingSkipRef: MutableRefObject<string | null>;
}

export interface UseWorkflowAnalyticsReturn {
  analyticsStartTime: React.MutableRefObject<number>;
  trackStepSkip: (stepId: string, reason: string) => void;
  trackError: (error: Error) => void;
  trackNavigation: (fromStep: number, toStep: number, duration: number) => void;
  trackConditionEvaluation: (duration: number, conditionsCount: number) => void;
}

export function useWorkflowAnalytics({
  workflowConfig,
  workflowState,
  workflowContext,
  pendingSkipRef,
}: UseWorkflowAnalyticsProps): UseWorkflowAnalyticsReturn {
  const analyticsStartTime = useRef<number>(Date.now());
  const stepStartTimes = useRef<Map<string, number>>(new Map());
  const workflowStartedRef = useRef<boolean>(false);
  const currentStepRef = useRef<string | null>(null);

  // Get global monitor for enhanced tracking
  const monitor = getGlobalMonitor();

  // Track workflow start - only once
  useEffect(() => {
    if (workflowConfig.analytics?.onWorkflowStart && !workflowStartedRef.current) {
      workflowStartedRef.current = true;
      workflowConfig.analytics.onWorkflowStart(workflowConfig.id, workflowContext);

      // Enhanced monitoring
      if (monitor) {
        monitor.track(
          'workflow_navigation',
          `workflow_${workflowConfig.id}`,
          {
            workflowId: workflowConfig.id,
            action: 'start',
            totalSteps: workflowConfig.steps.length,
          },
          {
            timestamp: Date.now(),
            duration: 0,
            workflowId: workflowConfig.id,
            stepCount: workflowConfig.steps.length,
            currentStepIndex: 0,
            navigationDuration: 0,
            conditionEvaluationDuration: 0,
          } as WorkflowPerformanceMetrics,
          'low'
        );
      }
    }
  }, [
    workflowConfig.id,
    workflowConfig.analytics,
    workflowContext,
    monitor,
    workflowConfig.steps.length,
  ]);

  // Track step changes and completion
  useEffect(() => {
    // Do not emit step analytics until initialization (including any async
    // persistence load) has settled. Otherwise resuming from a persisted index
    // emits a phantom onStepStart/onStepComplete for the default step the user
    // never saw. The first REAL step becomes the first onStepStart.
    if (workflowState.isInitializing) return;

    const currentStep = workflowConfig.steps[workflowState.currentStepIndex];
    if (!currentStep) return;

    // Only trigger if step actually changed
    if (currentStepRef.current === currentStep.id) return;

    // A skipped step is not a completion: consume the skip signal and suppress
    // onStepComplete for exactly that transition.
    const previousStepId = currentStepRef.current;
    const wasSkipped = previousStepId !== null && pendingSkipRef.current === previousStepId;
    if (wasSkipped) {
      pendingSkipRef.current = null;
    }

    // Track step completion for previous step
    if (previousStepId && !wasSkipped && workflowConfig.analytics?.onStepComplete) {
      const startTime = stepStartTimes.current.get(previousStepId);
      if (startTime) {
        const duration = Date.now() - startTime;
        // Pass the COMPLETED step's data (its slice of allData), not the new
        // step's stepData which the navigation has already swapped in.
        const completedStepData = (workflowState.allData[previousStepId] ?? {}) as Record<
          string,
          unknown
        >;
        workflowConfig.analytics.onStepComplete(
          previousStepId,
          duration,
          completedStepData,
          workflowContext
        );

        // Enhanced monitoring for step completion
        if (monitor) {
          monitor.track(
            'workflow_navigation',
            `workflow_${workflowConfig.id}`,
            {
              workflowId: workflowConfig.id,
              action: 'step_complete',
              stepId: previousStepId,
              duration,
            },
            {
              timestamp: Date.now(),
              duration,
              workflowId: workflowConfig.id,
              stepCount: workflowConfig.steps.length,
              currentStepIndex: workflowState.currentStepIndex,
              navigationDuration: duration,
              conditionEvaluationDuration: 0,
            } as WorkflowPerformanceMetrics,
            'low'
          );
        }
      }
    }

    // Update current step reference
    currentStepRef.current = currentStep.id;

    // Track step start for new step
    stepStartTimes.current.set(currentStep.id, Date.now());
    if (workflowConfig.analytics?.onStepStart) {
      workflowConfig.analytics.onStepStart(currentStep.id, Date.now(), workflowContext);
    }

    // Enhanced monitoring for step start
    if (monitor) {
      monitor.track(
        'workflow_navigation',
        `workflow_${workflowConfig.id}`,
        {
          workflowId: workflowConfig.id,
          action: 'step_start',
          stepId: currentStep.id,
          stepIndex: workflowState.currentStepIndex,
        },
        {
          timestamp: Date.now(),
          duration: 0,
          workflowId: workflowConfig.id,
          stepCount: workflowConfig.steps.length,
          currentStepIndex: workflowState.currentStepIndex,
          navigationDuration: 0,
          conditionEvaluationDuration: 0,
        } as WorkflowPerformanceMetrics,
        'low'
      );
    }
  }, [
    workflowState.currentStepIndex,
    workflowState.isInitializing,
    workflowConfig.steps,
    workflowConfig.analytics,
    workflowContext,
    workflowState.allData,
    monitor,
    workflowConfig.id,
    pendingSkipRef,
  ]);

  // Helper to track step skips
  const trackStepSkip = useCallback(
    (stepId: string, reason: string) => {
      if (workflowConfig.analytics?.onStepSkip) {
        workflowConfig.analytics.onStepSkip(stepId, reason, workflowContext);
      }

      // Enhanced monitoring for step skip
      if (monitor) {
        monitor.track(
          'workflow_navigation',
          `workflow_${workflowConfig.id}`,
          {
            workflowId: workflowConfig.id,
            action: 'step_skip',
            stepId,
            reason,
          },
          undefined,
          'medium'
        );
      }
    },
    [workflowConfig.analytics, workflowContext, monitor, workflowConfig.id]
  );

  // Helper to track errors
  const trackError = useCallback(
    (error: Error) => {
      if (workflowConfig.analytics?.onError) {
        workflowConfig.analytics.onError(error, workflowContext);
      }

      // Enhanced monitoring for errors
      if (monitor) {
        monitor.trackError(error, `workflow_${workflowConfig.id}`, {
          workflowId: workflowConfig.id,
          currentStepIndex: workflowState.currentStepIndex,
          currentStepId: workflowConfig.steps[workflowState.currentStepIndex]?.id,
          workflowContext,
        });
      }
    },
    [
      workflowConfig.analytics,
      workflowContext,
      monitor,
      workflowConfig.id,
      workflowState.currentStepIndex,
      workflowConfig.steps,
    ]
  );

  // Helper to track navigation performance
  const trackNavigation = useCallback(
    (fromStep: number, toStep: number, duration: number) => {
      if (!monitor) return;

      const metrics: WorkflowPerformanceMetrics = {
        timestamp: Date.now(),
        duration,
        workflowId: workflowConfig.id,
        stepCount: workflowConfig.steps.length,
        currentStepIndex: toStep,
        navigationDuration: duration,
        conditionEvaluationDuration: 0,
      };

      monitor.track(
        'workflow_navigation',
        `workflow_${workflowConfig.id}`,
        {
          workflowId: workflowConfig.id,
          action: 'navigation',
          fromStep,
          toStep,
          direction: toStep > fromStep ? 'forward' : 'backward',
        },
        metrics,
        duration > 1000 ? 'medium' : 'low' // Flag slow navigation
      );
    },
    [monitor, workflowConfig.id, workflowConfig.steps.length]
  );

  // Helper to track condition evaluation performance
  const trackConditionEvaluation = useCallback(
    (duration: number, conditionsCount: number) => {
      if (!monitor) return;

      const metrics: WorkflowPerformanceMetrics = {
        timestamp: Date.now(),
        duration,
        workflowId: workflowConfig.id,
        stepCount: workflowConfig.steps.length,
        currentStepIndex: workflowState.currentStepIndex,
        navigationDuration: 0,
        conditionEvaluationDuration: duration,
      };

      monitor.track(
        'condition_evaluation',
        `workflow_${workflowConfig.id}`,
        {
          workflowId: workflowConfig.id,
          conditionsCount,
          currentStepIndex: workflowState.currentStepIndex,
        },
        metrics,
        duration > 100 ? 'medium' : 'low' // Flag slow condition evaluation
      );
    },
    [monitor, workflowConfig.id, workflowConfig.steps.length, workflowState.currentStepIndex]
  );

  return {
    analyticsStartTime,
    trackStepSkip,
    trackError,
    trackNavigation,
    trackConditionEvaluation,
  };
}
