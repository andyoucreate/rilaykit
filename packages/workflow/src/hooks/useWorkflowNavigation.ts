import type { StepDataHelper, WorkflowConfig, WorkflowContext } from '@rilaykit/core';
import { useCallback, useRef } from 'react';
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
        const existingData = workflowState.allData[stepId] || {};
        const mergedData = { ...existingData, ...fields };
        setStepData(mergedData, stepId);
      },

      getStepData: (stepId: string) => {
        return workflowState.allData[stepId] || {};
      },

      setNextStepField: (fieldId: string, value: any) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < workflowConfig.steps.length) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          const existingData = workflowState.allData[nextStepId] || {};
          const mergedData = { ...existingData, [fieldId]: value };
          setStepData(mergedData, nextStepId);
        }
      },

      setNextStepFields: (fields: Record<string, any>) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < workflowConfig.steps.length) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          // FIXED: Only get existing data for the next step, don't propagate current step data
          const existingData = workflowState.allData[nextStepId] || {};

          // FIXED: Only merge the specified fields, not all current step data
          const mergedData = { ...existingData, ...fields };
          setStepData(mergedData, nextStepId);
        }
      },

      getAllData: () => {
        return { ...workflowState.allData };
      },

      getSteps: () => {
        return [...workflowConfig.steps];
      },
    };
  }, [workflowState.allData, workflowState.currentStepIndex, workflowConfig.steps, setStepData]);

  // Core navigation function
  const goToStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) {
        return false;
      }

      // Check if step is visible
      if (!conditionsHelpers.isStepVisible(stepIndex)) {
        return false;
      }

      setTransitioning(true);

      try {
        // Call onStepChange callback
        if (onStepChangeRef.current) {
          onStepChangeRef.current(workflowState.currentStepIndex, stepIndex, workflowContext);
        }

        setCurrentStep(stepIndex);
        markStepVisited(stepIndex, workflowConfig.steps[stepIndex].id);

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
      conditionsHelpers,
      workflowState.currentStepIndex,
      workflowContext,
      setTransitioning,
      setCurrentStep,
      markStepVisited,
    ]
  );

  // Helper function to find the next visible step
  const findNextVisibleStep = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex + 1; i < workflowConfig.steps.length; i++) {
        if (conditionsHelpers.isStepVisible(i)) {
          return i;
        }
      }
      return null;
    },
    [workflowConfig.steps.length, conditionsHelpers]
  );

  // Helper function to find the previous visible step
  const findPreviousVisibleStep = useCallback(
    (fromIndex: number): number | null => {
      for (let i = fromIndex - 1; i >= 0; i--) {
        if (conditionsHelpers.isStepVisible(i)) {
          return i;
        }
      }
      return null;
    },
    [conditionsHelpers]
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

  // Skip current step
  const skipStep = useCallback(async (): Promise<boolean> => {
    if (
      !currentStep?.allowSkip &&
      !conditionsHelpers.isStepSkippable(workflowState.currentStepIndex)
    ) {
      return false;
    }

    if (workflowConfig.analytics?.onStepSkip) {
      workflowConfig.analytics.onStepSkip(currentStep.id, 'user_skip', workflowContext);
    }

    // Go to next step (skipping does not trigger validation)
    return goNext();
  }, [
    currentStep,
    conditionsHelpers,
    workflowState.currentStepIndex,
    workflowConfig.analytics,
    workflowContext,
    goNext,
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

  // Check if current step can be skipped
  const canSkipCurrentStep = useCallback((): boolean => {
    return (
      currentStep?.allowSkip === true &&
      conditionsHelpers.isStepSkippable(workflowState.currentStepIndex)
    );
  }, [currentStep?.allowSkip, conditionsHelpers, workflowState.currentStepIndex]);

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
