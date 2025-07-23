import type {
  FormConfiguration,
  StepConfig,
  WorkflowConfig,
  WorkflowContext,
} from '@rilaykit/core';
import { FormProvider } from '@rilaykit/forms';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import {
  type UseWorkflowConditionsReturn,
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowState,
  useWorkflowSubmission,
} from '../hooks';

export interface WorkflowContextValue {
  workflowState: ReturnType<typeof useWorkflowState>['workflowState'];
  workflowConfig: WorkflowConfig;
  currentStep: StepConfig;
  context: WorkflowContext;
  formConfig?: FormConfiguration;
  conditionsHelpers: UseWorkflowConditionsReturn;

  // Navigation actions
  goToStep: (stepIndex: number) => Promise<boolean>;
  goNext: () => Promise<boolean>;
  goPrevious: () => Promise<boolean>;
  skipStep: () => Promise<boolean>;
  canGoToStep: (stepIndex: number) => boolean;
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
  canSkipCurrentStep: () => boolean;

  // Data actions
  setValue: (fieldId: string, value: any) => void;
  setStepData: (data: Record<string, any>) => void;
  resetWorkflow: () => void;

  // Submission
  submitWorkflow: () => Promise<void>;
  isSubmitting: boolean;
  canSubmit: boolean;
}

const WorkflowReactContext = createContext<WorkflowContextValue | null>(null);

export interface WorkflowProviderProps {
  children: React.ReactNode;
  workflowConfig: WorkflowConfig;
  defaultValues?: Record<string, any>;
  onStepChange?: (fromStep: number, toStep: number, context: WorkflowContext) => void;
  onWorkflowComplete?: (data: Record<string, any>) => void | Promise<void>;
  className?: string;
}

export function WorkflowProvider({
  children,
  workflowConfig,
  defaultValues = {},
  onStepChange,
  onWorkflowComplete,
  className,
}: WorkflowProviderProps) {
  // 1. Initialize workflow state management
  const {
    workflowState,
    setCurrentStep,
    setStepData,
    setFieldValue,
    setSubmitting,
    setTransitioning,
    markStepVisited,
    resetWorkflow,
  } = useWorkflowState({ defaultValues });

  // 2. Create workflow context for conditions and callbacks
  const workflowContext = useMemo(
    (): WorkflowContext => ({
      workflowId: workflowConfig.id,
      currentStepIndex: workflowState.currentStepIndex,
      totalSteps: workflowConfig.steps.length,
      allData: workflowState.allData,
      stepData: workflowState.stepData,
      isFirstStep: workflowState.currentStepIndex === 0,
      isLastStep: workflowState.currentStepIndex === workflowConfig.steps.length - 1,
      visitedSteps: workflowState.visitedSteps,
    }),
    [
      workflowConfig.id,
      workflowConfig.steps.length,
      workflowState.currentStepIndex,
      workflowState.allData,
      workflowState.stepData,
      workflowState.visitedSteps,
    ]
  );

  // 3. Get current step info
  const currentStep = useMemo(
    () => workflowConfig.steps[workflowState.currentStepIndex],
    [workflowConfig.steps, workflowState.currentStepIndex]
  );

  const formConfig = useMemo(() => currentStep?.formConfig, [currentStep]);

  // 4. Initialize analytics tracking
  const { analyticsStartTime } = useWorkflowAnalytics({
    workflowConfig,
    workflowState,
    workflowContext,
  });

  // 5. Initialize conditional logic for steps and fields
  const conditionsHelpers = useWorkflowConditions({
    workflowConfig,
    workflowState,
    currentStep,
  });

  // 6. Initialize navigation
  const {
    goToStep,
    goNext,
    goPrevious,
    skipStep,
    canGoToStep,
    canGoNext,
    canGoPrevious,
    canSkipCurrentStep,
  } = useWorkflowNavigation({
    workflowConfig,
    workflowState,
    workflowContext,
    conditionsHelpers,
    setCurrentStep,
    setTransitioning,
    markStepVisited,
    setStepData,
    onStepChange,
  });

  // 7. Ensure we start on the first visible step
  useEffect(() => {
    // Only run this check on initial mount or when conditions change
    const currentStepIsVisible = conditionsHelpers.isStepVisible(workflowState.currentStepIndex);

    if (!currentStepIsVisible) {
      // Find the first visible step
      for (let i = 0; i < workflowConfig.steps.length; i++) {
        if (conditionsHelpers.isStepVisible(i)) {
          setCurrentStep(i);
          markStepVisited(i, workflowConfig.steps[i].id);
          break;
        }
      }
    }
  }, [
    conditionsHelpers,
    workflowState.currentStepIndex,
    workflowConfig.steps,
    setCurrentStep,
    markStepVisited,
  ]);

  // 8. Initialize submission
  const { submitWorkflow, isSubmitting, canSubmit } = useWorkflowSubmission({
    workflowConfig,
    workflowState,
    workflowContext,
    setSubmitting,
    onWorkflowComplete,
    analyticsStartTime,
  });

  // 9. Create field value setter for form integration
  const setValue = useCallback(
    (fieldId: string, value: any) => {
      setFieldValue(fieldId, value, currentStep?.id || '');
    },
    [setFieldValue, currentStep?.id]
  );

  // 10. Create step data setter
  const handleSetStepData = useCallback(
    (data: Record<string, any>) => {
      setStepData(data, currentStep?.id || '');
    },
    [setStepData, currentStep?.id]
  );

  // 11. Create form submission handler
  const handleSubmit = useCallback(async () => {
    if (workflowContext.isLastStep) {
      await submitWorkflow();
    } else {
      await goNext();
    }
  }, [workflowContext.isLastStep, submitWorkflow, goNext]);

  // 12. Memoize context value to prevent unnecessary re-renders
  const contextValue: WorkflowContextValue = useMemo(
    () => ({
      workflowState,
      workflowConfig,
      currentStep,
      context: workflowContext,
      formConfig,
      conditionsHelpers,
      // Navigation
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      canGoToStep,
      canGoNext,
      canGoPrevious,
      canSkipCurrentStep,
      // Data
      setValue,
      setStepData: handleSetStepData,
      resetWorkflow,
      // Submission
      submitWorkflow,
      isSubmitting,
      canSubmit,
    }),
    [
      workflowState,
      workflowConfig,
      currentStep,
      workflowContext,
      formConfig,
      conditionsHelpers,
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      canGoToStep,
      canGoNext,
      canGoPrevious,
      canSkipCurrentStep,
      setValue,
      handleSetStepData,
      resetWorkflow,
      submitWorkflow,
      isSubmitting,
      canSubmit,
    ]
  );

  return (
    <WorkflowReactContext.Provider value={contextValue}>
      <FormProvider
        formConfig={formConfig}
        defaultValues={workflowState?.allData[currentStep?.id] || {}}
        onFieldChange={setValue}
        data-workflow-id={workflowConfig.id}
        className={className}
        onSubmit={handleSubmit}
      >
        {children}
      </FormProvider>
    </WorkflowReactContext.Provider>
  );
}

export function useWorkflowContext(): WorkflowContextValue {
  const context = useContext(WorkflowReactContext);
  if (!context) {
    throw new Error('useWorkflowContext must be used within a WorkflowProvider');
  }
  return context;
}
