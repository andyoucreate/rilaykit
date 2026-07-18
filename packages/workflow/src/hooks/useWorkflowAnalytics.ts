import {
  type WorkflowConfig,
  type WorkflowContext,
  type WorkflowPerformanceMetrics,
  getGlobalMonitor,
} from '@rilaykit/core';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { structureStepSlice, structureWorkflowData } from '../utils/structureWorkflowData';
import type { WorkflowState } from './workflow-state';

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
  /**
   * Shared flag set by {@link useWorkflowSubmission} when the workflow finishes.
   * Read by the abandon cleanup so a normal completion does NOT fire
   * {@link WorkflowAnalytics.onWorkflowAbandon} on unmount.
   */
  workflowCompletedRef: MutableRefObject<boolean>;
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
  workflowCompletedRef,
}: UseWorkflowAnalyticsProps): UseWorkflowAnalyticsReturn {
  const analyticsStartTime = useRef<number>(Date.now());
  const stepStartTimes = useRef<Map<string, number>>(new Map());
  const workflowStartedRef = useRef<boolean>(false);
  const currentStepRef = useRef<string | null>(null);

  // Abandon bookkeeping: the cleanup effect (unmount) reads the LATEST config
  // and data through refs so it can fire onWorkflowAbandon without stale deps.
  const configRef = useRef(workflowConfig);
  configRef.current = workflowConfig;
  const latestDataRef = useRef<Record<string, unknown>>(workflowState.allData);
  latestDataRef.current = workflowState.allData;
  // Same rationale as `latestDataRef`: the abandon payload is structured at the
  // boundary, and structuring needs the row order the user actually arranged.
  const latestOrdersRef = useRef<Record<string, Record<string, string[]>> | undefined>(
    workflowState.repeatableOrders
  );
  latestOrdersRef.current = workflowState.repeatableOrders;
  // "Started" means the workflow reached an interactive step (initialization,
  // including any async persistence load, has settled). Independent of whether
  // onWorkflowStart is configured.
  const hasStartedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!workflowState.isInitializing) {
      hasStartedRef.current = true;
    }
  }, [workflowState.isInitializing]);

  // Fire onWorkflowAbandon on unmount IFF the workflow was started but never
  // completed. Runs exactly once (empty deps) so it only reacts to a real
  // unmount, reading current values through refs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs only; unmount-only cleanup
  useEffect(() => {
    return () => {
      const analytics = configRef.current.analytics;
      if (hasStartedRef.current && !workflowCompletedRef.current && analytics?.onWorkflowAbandon) {
        analytics.onWorkflowAbandon(
          configRef.current.id,
          currentStepRef.current ?? '',
          // A host boundary: the store speaks flat composite keys internally,
          // the abandonment snapshot speaks the AUTHORED shape — the same
          // shape `onWorkflowComplete` hands the host on the same interface.
          structureWorkflowData(
            latestDataRef.current,
            configRef.current.steps,
            latestOrdersRef.current
          )
        );
      }
    };
  }, []);

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

    // A completion is a FORWARD transition only. Backward navigation
    // (goPrevious) retreats from a step the user has not completed, so it must
    // not fire onStepComplete for the step being left behind.
    const previousStepIndex = previousStepId
      ? workflowConfig.steps.findIndex((s) => s.id === previousStepId)
      : -1;
    const isForward =
      previousStepIndex !== -1 && workflowState.currentStepIndex > previousStepIndex;

    // Track step completion for previous step
    if (previousStepId && !wasSkipped && isForward && workflowConfig.analytics?.onStepComplete) {
      const startTime = stepStartTimes.current.get(previousStepId);
      if (startTime) {
        const duration = Date.now() - startTime;
        // Pass the COMPLETED step's data (its slice of allData), not the new
        // step's stepData which the navigation has already swapped in.
        //
        // A host boundary: the slice is stored flat, the callback contract is
        // the AUTHORED shape — the one `onWorkflowComplete` hands the host on
        // this same interface.
        const previousStep = workflowConfig.steps.find((step) => step.id === previousStepId);
        const completedStepData = structureStepSlice(
          (workflowState.allData[previousStepId] ?? {}) as Record<string, unknown>,
          previousStep?.formConfig?.repeatableFields,
          workflowState.repeatableOrders?.[previousStepId]
        );
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
    workflowState.repeatableOrders,
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
