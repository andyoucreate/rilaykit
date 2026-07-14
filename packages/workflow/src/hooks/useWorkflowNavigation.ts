import {
  type ConditionBuilder,
  type ConditionConfig,
  type StepDataHelper,
  type WorkflowConfig,
  type WorkflowContext,
  evaluateCondition,
} from '@rilaykit/core';
import { type MutableRefObject, useCallback, useRef } from 'react';
import { combineWorkflowDataForConditions } from '../utils/dataFlattening';
import type { UseWorkflowConditionsReturn } from './useWorkflowConditions';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowNavigationProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  conditionsHelpers: UseWorkflowConditionsReturn;
  setCurrentStep: (stepIndex: number) => void;
  setTransitioning: (isTransitioning: boolean) => void;
  markStepVisited: (stepIndex: number, stepId: string) => void;
  markStepPassed: (stepId: string) => void;
  setStepData: (data: Record<string, any>, stepId: string) => void;
  /**
   * Live accessor for the latest `allData`. The `workflowState` prop is a
   * render-time snapshot: within a single navigation (onAfterValidation
   * writing prefill data, then the step transition) it goes stale and the
   * transition would wipe the freshly written data.
   */
  getAllData: () => Record<string, unknown>;
  /**
   * Shared signal read by {@link useWorkflowAnalytics} to suppress
   * `onStepComplete` for a skipped step. A skip is not a completion.
   */
  pendingSkipRef: MutableRefObject<string | null>;
  onStepChange?: (fromStep: number, toStep: number, context: WorkflowContext) => void;
}

export interface UseWorkflowNavigationReturn {
  goToStep: (stepIndex: number) => Promise<boolean>;
  goNext: () => Promise<boolean>;
  goPrevious: () => Promise<boolean>;
  skipStep: () => Promise<boolean>;
  canGoToStep: (stepIndex: number) => boolean;
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
  canSkipCurrentStep: () => boolean;
}

export function useWorkflowNavigation({
  workflowConfig,
  workflowState,
  workflowContext,
  conditionsHelpers,
  setCurrentStep,
  setTransitioning,
  markStepVisited,
  markStepPassed,
  setStepData,
  getAllData,
  pendingSkipRef,
  onStepChange,
}: UseWorkflowNavigationProps): UseWorkflowNavigationReturn {
  // Use ref to avoid recreating callbacks when onStepChange changes
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  // Get current step
  const currentStep = workflowConfig.steps[workflowState.currentStepIndex];

  // Create step data helper for validation callbacks
  const createStepDataHelper = useCallback((): StepDataHelper => {
    return {
      setStepData: (stepId: string, data: Record<string, any>) => {
        setStepData(data, stepId);
      },

      setStepFields: (stepId: string, fields: Record<string, any>) => {
        const existingData = getAllData()[stepId] || {};
        const mergedData = { ...existingData, ...fields };
        setStepData(mergedData, stepId);
      },

      getStepData: (stepId: string) => {
        return getAllData()[stepId] || {};
      },

      setNextStepField: (fieldId: string, value: any) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < workflowConfig.steps.length) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          const existingData = getAllData()[nextStepId] || {};
          const mergedData = { ...existingData, [fieldId]: value };
          setStepData(mergedData, nextStepId);
        }
      },

      setNextStepFields: (fields: Record<string, any>) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < workflowConfig.steps.length) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          // Only get existing data for the next step, don't propagate current step data
          const existingData = getAllData()[nextStepId] || {};

          // Only merge the specified fields, not all current step data
          const mergedData = { ...existingData, ...fields };
          setStepData(mergedData, nextStepId);
        }
      },

      getAllData: () => {
        return { ...getAllData() };
      },

      getSteps: () => {
        return [...workflowConfig.steps];
      },
    };
  }, [getAllData, workflowState.currentStepIndex, workflowConfig.steps, setStepData]);

  // Evaluate a step's `visible` condition against LIVE data. The
  // `conditionsHelpers.isStepVisible` reads a render-time snapshot of allData,
  // which goes stale within a single navigation tick (e.g. onAfterValidation
  // writing data that flips a later step's visibility). Re-derive the decision
  // from the freshly-written store, mirroring the live-read used for data.
  const isStepVisibleLive = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return false;

      const visibleCondition = workflowConfig.steps[stepIndex]?.conditions?.visible;
      if (!visibleCondition) return true;

      const liveAllData = getAllData() as Record<string, unknown>;
      const currentStepId = workflowConfig.steps[workflowState.currentStepIndex]?.id;
      const liveStepData = (currentStepId ? liveAllData[currentStepId] : undefined) as
        | Record<string, unknown>
        | undefined;
      const conditionData = combineWorkflowDataForConditions(liveAllData, liveStepData ?? {});

      try {
        const condition = visibleCondition as ConditionConfig | ConditionBuilder;
        const conditionToEvaluate: ConditionConfig =
          typeof condition === 'object' && 'build' in condition ? condition.build() : condition;
        return evaluateCondition(conditionToEvaluate, conditionData);
      } catch {
        // Match the render-path behaviour: a visible condition that throws
        // resolves to hidden rather than silently defaulting to visible.
        return false;
      }
    },
    [workflowConfig.steps, workflowState.currentStepIndex, getAllData]
  );

  // Core navigation function
  const goToStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) {
        return false;
      }

      // Check if step is visible against LIVE data (see isStepVisibleLive)
      if (!isStepVisibleLive(stepIndex)) {
        return false;
      }

      setTransitioning(true);

      try {
        // Call onStepChange callback
        if (onStepChangeRef.current) {
          onStepChangeRef.current(workflowState.currentStepIndex, stepIndex, workflowContext);
        }

        const newStepId = workflowConfig.steps[stepIndex].id;

        setCurrentStep(stepIndex);
        markStepVisited(stepIndex, newStepId);

        // Reset stepData to the target step's existing data to prevent
        // leaking fields from the previous step into the new step's data.
        // Read through getAllData(): onAfterValidation may have just written
        // prefill data that the render-time snapshot does not contain yet.
        const existingStepData = (getAllData()[newStepId] || {}) as Record<string, any>;
        setStepData(existingStepData, newStepId);

        return true;
      } catch (error) {
        console.error('Step transition failed:', error);
        if (workflowConfig.analytics?.onError) {
          workflowConfig.analytics.onError(error as Error, workflowContext);
        }
        return false;
      } finally {
        setTransitioning(false);
      }
    },
    [
      workflowConfig.steps,
      workflowConfig.analytics,
      isStepVisibleLive,
      workflowState.currentStepIndex,
      getAllData,
      workflowContext,
      setTransitioning,
      setCurrentStep,
      markStepVisited,
      setStepData,
    ]
  );

  // Helper function to find the next visible step
  const findNextVisibleStep = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex + 1; i < workflowConfig.steps.length; i++) {
        if (isStepVisibleLive(i)) {
          return i;
        }
      }
      return null;
    },
    [workflowConfig.steps.length, isStepVisibleLive]
  );

  // Helper function to find the previous visible step
  const findPreviousVisibleStep = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex - 1; i >= 0; i--) {
        if (isStepVisibleLive(i)) {
          return i;
        }
      }
      return null;
    },
    [isStepVisibleLive]
  );

  // Navigate to next step
  const goNext = useCallback(async (): Promise<boolean> => {
    // Before transitioning, call onAfterValidation if it exists
    if (currentStep?.onAfterValidation) {
      try {
        const helper = createStepDataHelper();
        await currentStep.onAfterValidation(workflowState.stepData, helper, workflowContext);
      } catch (error) {
        console.error('onAfterValidation failed:', error);
        if (workflowConfig.analytics?.onError) {
          workflowConfig.analytics.onError(error as Error, workflowContext);
        }
        return false;
      }
    }

    // Mark current step as passed (validated)
    markStepPassed(currentStep.id);

    // Find the next visible step
    const nextStepIndex = findNextVisibleStep(workflowState.currentStepIndex);

    // Check if we have a next visible step
    if (nextStepIndex === null) {
      return false; // Let the submission hook handle this
    }

    return goToStep(nextStepIndex);
  }, [
    currentStep,
    createStepDataHelper,
    workflowState.stepData,
    workflowContext,
    workflowConfig.analytics,
    workflowState.currentStepIndex,
    findNextVisibleStep,
    goToStep,
    markStepPassed,
  ]);

  // Navigate to previous step
  const goPrevious = useCallback(async (): Promise<boolean> => {
    // Find the previous visible step
    const previousStepIndex = findPreviousVisibleStep(workflowState.currentStepIndex);

    // Check if we have a previous visible step
    if (previousStepIndex === null) {
      return false;
    }

    return goToStep(previousStepIndex);
  }, [workflowState.currentStepIndex, findPreviousVisibleStep, goToStep]);

  // Check if current step can be skipped — conditionsHelpers.isStepSkippable
  // is the single source of truth: it already combines allowSkip (static or
  // predicate) with the step's skippable condition, and is bounds-checked.
  const canSkipCurrentStep = useCallback((): boolean => {
    return conditionsHelpers.isStepSkippable(workflowState.currentStepIndex);
  }, [conditionsHelpers, workflowState.currentStepIndex]);

  // Skip current step
  const skipStep = useCallback(async (): Promise<boolean> => {
    if (!canSkipCurrentStep()) {
      return false;
    }

    if (workflowConfig.analytics?.onStepSkip) {
      workflowConfig.analytics.onStepSkip(currentStep.id, 'user_skip', workflowContext);
    }

    // A skip is NOT a completion: it explicitly bypasses validation, so it must
    // not run onAfterValidation, must not mark the step passed, and must not
    // emit onStepComplete. Signal the analytics hook to suppress completion for
    // this step, then transition to the next visible step directly.
    const nextStepIndex = findNextVisibleStep(workflowState.currentStepIndex);
    if (nextStepIndex === null) {
      return false; // Let the submission hook handle this
    }

    // Signal the analytics hook to suppress completion for this step, but only
    // for a transition that actually happens. If goToStep fails (e.g.
    // onStepChange throws and is caught), the step index never changes and the
    // analytics effect never consumes the signal — leaving it set would wrongly
    // suppress the NEXT normal advance's onStepComplete. Clear it on failure.
    pendingSkipRef.current = currentStep.id;
    const didTransition = await goToStep(nextStepIndex);
    if (!didTransition) {
      pendingSkipRef.current = null;
    }
    return didTransition;
  }, [
    canSkipCurrentStep,
    currentStep,
    workflowConfig.analytics,
    workflowContext,
    workflowState.currentStepIndex,
    findNextVisibleStep,
    goToStep,
    pendingSkipRef,
  ]);

  // Check if we can navigate to a specific step
  const canGoToStep = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return false;
      return conditionsHelpers.isStepVisible(stepIndex);
    },
    [workflowConfig.steps.length, conditionsHelpers]
  );

  // Check if we can go to next step
  const canGoNext = useCallback((): boolean => {
    const nextStepIndex = findNextVisibleStep(workflowState.currentStepIndex);
    return nextStepIndex !== null && canGoToStep(nextStepIndex);
  }, [workflowState.currentStepIndex, findNextVisibleStep, canGoToStep]);

  // Check if we can go to previous step
  const canGoPrevious = useCallback((): boolean => {
    const prevStepIndex = findPreviousVisibleStep(workflowState.currentStepIndex);
    return prevStepIndex !== null && canGoToStep(prevStepIndex);
  }, [workflowState.currentStepIndex, findPreviousVisibleStep, canGoToStep]);

  return {
    goToStep,
    goNext,
    goPrevious,
    skipStep,
    canGoToStep,
    canGoNext,
    canGoPrevious,
    canSkipCurrentStep,
  };
}
