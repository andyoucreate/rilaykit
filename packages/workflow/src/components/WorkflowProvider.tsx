import type {
  FormConfiguration,
  StepConfig,
  WorkflowConfig,
  WorkflowContext,
} from '@rilaykit/core';
import { FormProvider } from '@rilaykit/forms';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import {
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowState,
  useWorkflowSubmission,
} from '../hooks';
import type { UseWorkflowConditionsReturn } from '../hooks/useWorkflowConditions';

export interface WorkflowContextValue {
  workflowState: ReturnType<typeof useWorkflowState>['workflowState'];
  workflowConfig: WorkflowConfig;
  currentStep: StepConfig;
  context: WorkflowContext;
  formConfig?: FormConfiguration;
  conditionsHelpers: UseWorkflowConditionsReturn;

  // Step metadata
  currentStepMetadata?: Record<string, any>;

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

  // Persistence
  persistNow?: () => Promise<void>;
  isPersisting?: boolean;
  persistenceError?: Error | null;
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
  // Stable refs for callbacks to avoid recreating dependencies
  const onStepChangeRef = useRef(onStepChange);
  const onWorkflowCompleteRef = useRef(onWorkflowComplete);

  // Update refs when props change
  onStepChangeRef.current = onStepChange;
  onWorkflowCompleteRef.current = onWorkflowComplete;

  // 1. Initialize workflow state management with persistence from config
  const {
    workflowState,
    setCurrentStep,
    setStepData,
    setFieldValue,
    setSubmitting,
    setTransitioning,
    markStepVisited,
    resetWorkflow,
    loadPersistedState,
    persistence,
  } = useWorkflowState({
    defaultValues,
    persistence: workflowConfig.persistence
      ? {
          workflowId: workflowConfig.id,
          adapter: workflowConfig.persistence.adapter,
          options: workflowConfig.persistence.options,
          userId: workflowConfig.persistence.userId,
          autoLoad: true,
        }
      : undefined,
  });

  // 2. Load persisted data on mount if persistence is enabled
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (workflowConfig.persistence && loadPersistedState) {
      loadPersistedState();
    }
  }, []);

  // Extract persistence utilities - memoize to avoid recreating objects
  const persistenceInfo = useMemo(
    () => ({
      isPersisting: persistence?.isPersisting ?? false,
      persistenceError: persistence?.persistenceError ?? null,
      persistNow: persistence?.persistNow,
    }),
    [persistence?.isPersisting, persistence?.persistenceError, persistence?.persistNow]
  );

  // 3. Create workflow context for conditions and callbacks - memoize expensive object creation
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

  // 3. Get current step info - memoize step lookup
  const currentStep = useMemo(
    () => workflowConfig.steps[workflowState.currentStepIndex],
    [workflowConfig.steps, workflowState.currentStepIndex]
  );

  // Memoize formConfig to avoid recalculation
  const formConfig = useMemo(() => currentStep?.formConfig, [currentStep?.formConfig]);

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

  // 6. Initialize navigation with stable callback refs
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
    onStepChange: onStepChangeRef.current,
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

  // 8. Initialize submission with stable callback ref
  const { submitWorkflow, isSubmitting, canSubmit } = useWorkflowSubmission({
    workflowConfig,
    workflowState,
    workflowContext,
    setSubmitting,
    onWorkflowComplete: onWorkflowCompleteRef.current,
    analyticsStartTime,
  });

  // 9. Create field value setter for form integration - memoize with stable dependencies
  const setValue = useCallback(
    (fieldId: string, value: any) => {
      setFieldValue(fieldId, value, currentStep?.id || '');
    },
    [setFieldValue, currentStep?.id]
  );

  // 10. Create step data setter - memoize with stable dependencies
  const handleSetStepData = useCallback(
    (data: Record<string, any>) => {
      setStepData(data, currentStep?.id || '');
    },
    [setStepData, currentStep?.id]
  );

  // 11. Create form submission handler - memoize with stable dependencies
  const handleSubmit = useCallback(
    async (values: any) => {
      if (currentStep?.id && values) {
        setStepData(values, currentStep.id);
      }

      if (workflowContext.isLastStep) {
        await submitWorkflow();
      } else {
        await goNext();
      }
    },
    [workflowContext.isLastStep, submitWorkflow, goNext, currentStep?.id, setStepData]
  );

  // 12. Memoize context value to prevent unnecessary re-renders - split into smaller chunks
  const navigationMethods = useMemo(
    () => ({
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      canGoToStep,
      canGoNext,
      canGoPrevious,
      canSkipCurrentStep,
    }),
    [
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      canGoToStep,
      canGoNext,
      canGoPrevious,
      canSkipCurrentStep,
    ]
  );

  const dataMethods = useMemo(
    () => ({
      setValue,
      setStepData: handleSetStepData,
      resetWorkflow,
    }),
    [setValue, handleSetStepData, resetWorkflow]
  );

  const submissionMethods = useMemo(
    () => ({
      submitWorkflow,
      isSubmitting,
      canSubmit,
    }),
    [submitWorkflow, isSubmitting, canSubmit]
  );

  // Final context value with better memoization
  const contextValue: WorkflowContextValue = useMemo(
    () => ({
      workflowState,
      workflowConfig,
      currentStep,
      context: workflowContext,
      formConfig,
      conditionsHelpers,
      // Step metadata
      currentStepMetadata: currentStep?.metadata,
      // Navigation
      ...navigationMethods,
      // Data
      ...dataMethods,
      // Submission
      ...submissionMethods,
      // Persistence
      persistNow: persistenceInfo.persistNow,
      isPersisting: persistenceInfo.isPersisting,
      persistenceError: persistenceInfo.persistenceError,
    }),
    [
      workflowState,
      workflowConfig,
      currentStep,
      workflowContext,
      formConfig,
      conditionsHelpers,
      navigationMethods,
      dataMethods,
      submissionMethods,
      persistenceInfo,
    ]
  );

  // Memoize FormProvider defaultValues to avoid recalculation
  // FIXED: Only use data specific to the current step, not all data
  const formProviderDefaultValues = useMemo(() => {
    if (!currentStep?.id) return {};

    // Get only the data for the current step
    const currentStepData = workflowState?.allData[currentStep.id] || {};

    // Filter out any fields that don't belong to the current step's form
    if (!formConfig?.allFields) return currentStepData;

    const currentStepFieldIds = new Set(formConfig.allFields.map((field) => field.id));
    const filteredData: Record<string, any> = {};

    // Only include fields that belong to the current step
    for (const [key, value] of Object.entries(currentStepData)) {
      if (currentStepFieldIds.has(key)) {
        filteredData[key] = value;
      }
    }

    return filteredData;
  }, [workflowState?.allData, currentStep?.id, formConfig?.allFields]);

  // FIXED: Use step-specific key to ensure proper form reinitialization
  const formProviderKey = useMemo(
    () => workflowState.isInitializing.toString(),
    [workflowState.isInitializing]
  );

  return (
    <WorkflowReactContext.Provider value={contextValue}>
      <FormProvider
        key={formProviderKey}
        formConfig={formConfig}
        defaultValues={formProviderDefaultValues}
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
