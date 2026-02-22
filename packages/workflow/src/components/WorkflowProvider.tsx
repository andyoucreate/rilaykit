import type {
  FormConfiguration,
  StepConfig,
  WorkflowConfig,
  WorkflowContext,
} from '@rilaykit/core';
import { FormProvider } from '@rilaykit/forms';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowSubmission,
} from '../hooks';
import { usePersistence } from '../hooks/usePersistence';
import type { UseWorkflowConditionsReturn } from '../hooks/useWorkflowConditions';
import type { WorkflowPersistenceAdapter } from '../persistence/types';

// Noop adapter — always call usePersistence to respect Rules of Hooks
const NOOP_PERSISTENCE_ADAPTER: WorkflowPersistenceAdapter = {
  save: async () => {},
  load: async () => null,
  remove: async () => {},
  exists: async () => false,
};
import {
  type WorkflowStore,
  WorkflowStoreContext,
  type WorkflowStoreState,
  createWorkflowStore,
} from '../stores';

// =================================================================
// WORKFLOW CONTEXT VALUE
// =================================================================

export interface WorkflowContextValue {
  workflowState: {
    currentStepIndex: number;
    allData: Record<string, unknown>;
    stepData: Record<string, unknown>;
    visitedSteps: Set<string>;
    passedSteps: Set<string>;
    isSubmitting: boolean;
    isTransitioning: boolean;
    isInitializing: boolean;
  };
  workflowConfig: WorkflowConfig;
  currentStep: StepConfig;
  context: WorkflowContext;
  formConfig?: FormConfiguration;
  conditionsHelpers: UseWorkflowConditionsReturn;

  // Step metadata
  currentStepMetadata?: Record<string, unknown>;

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
  setValue: (fieldId: string, value: unknown) => void;
  setStepData: (data: Record<string, unknown>) => void;
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

// =================================================================
// PROVIDER PROPS
// =================================================================

export interface WorkflowProviderProps {
  children: React.ReactNode;
  workflowConfig: WorkflowConfig;
  defaultValues?: Record<string, unknown>;
  defaultStep?: string; // ID of the step to start on
  onStepChange?: (fromStep: number, toStep: number, context: WorkflowContext) => void;
  onWorkflowComplete?: (data: Record<string, unknown>) => void | Promise<void>;
  className?: string;
}

// =================================================================
// HELPER: Calculate initial visited/passed steps
// =================================================================

function calculateInitialSteps(
  defaultStepIndex: number,
  steps: Array<{ id: string }>
): { visitedSteps: Set<string>; passedSteps: Set<string> } {
  const visitedSteps = new Set<string>();
  const passedSteps = new Set<string>();

  if (defaultStepIndex > 0) {
    for (let i = 0; i < defaultStepIndex; i++) {
      if (steps[i]) {
        visitedSteps.add(steps[i].id);
        passedSteps.add(steps[i].id);
      }
    }
  }

  return { visitedSteps, passedSteps };
}

// =================================================================
// WORKFLOW PROVIDER
// =================================================================

export function WorkflowProvider({
  children,
  workflowConfig,
  defaultValues = {},
  defaultStep,
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

  // Calculate default step index from defaultStep ID
  const defaultStepIndex = useMemo(() => {
    if (!defaultStep) return 0;

    const stepIndex = workflowConfig.steps.findIndex((step) => step.id === defaultStep);
    if (stepIndex === -1) {
      console.warn(`Default step with ID "${defaultStep}" not found. Starting at step 0.`);
      return 0;
    }

    return stepIndex;
  }, [defaultStep, workflowConfig.steps]);

  // Calculate initial visited/passed steps
  const initialSteps = useMemo(
    () => calculateInitialSteps(defaultStepIndex, workflowConfig.steps),
    [defaultStepIndex, workflowConfig.steps]
  );

  // Create Zustand store (once per provider mount)
  const storeRef = useRef<WorkflowStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createWorkflowStore({
      defaultValues,
      defaultStepIndex,
      initialVisitedSteps: initialSteps.visitedSteps,
      initialPassedSteps: initialSteps.passedSteps,
    });
  }
  const store = storeRef.current;

  // Subscribe to store state changes for reactivity
  const [workflowState, setWorkflowState] = useState(() => {
    const state = store.getState();
    return {
      currentStepIndex: state.currentStepIndex,
      allData: state.allData,
      stepData: state.stepData,
      visitedSteps: state.visitedSteps,
      passedSteps: state.passedSteps,
      isSubmitting: state.isSubmitting,
      isTransitioning: state.isTransitioning,
      isInitializing: state.isInitializing,
    };
  });

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = store.subscribe((state) => {
      setWorkflowState({
        currentStepIndex: state.currentStepIndex,
        allData: state.allData,
        stepData: state.stepData,
        visitedSteps: state.visitedSteps,
        passedSteps: state.passedSteps,
        isSubmitting: state.isSubmitting,
        isTransitioning: state.isTransitioning,
        isInitializing: state.isInitializing,
      });
    });
    return unsubscribe;
  }, [store]);

  // Create stable action functions
  const setCurrentStep = useCallback(
    (stepIndex: number) => store.getState()._setCurrentStep(stepIndex),
    [store]
  );

  const setStepDataAction = useCallback(
    (data: Record<string, unknown>, stepId: string) => store.getState()._setStepData(data, stepId),
    [store]
  );

  const setFieldValue = useCallback(
    (fieldId: string, value: unknown, stepId: string) =>
      store.getState()._setFieldValue(fieldId, value, stepId),
    [store]
  );

  const setSubmitting = useCallback(
    (isSubmitting: boolean) => store.getState()._setSubmitting(isSubmitting),
    [store]
  );

  const setTransitioning = useCallback(
    (isTransitioning: boolean) => store.getState()._setTransitioning(isTransitioning),
    [store]
  );

  const markStepVisited = useCallback(
    (_stepIndex: number, stepId: string) => store.getState()._markStepVisited(stepId),
    [store]
  );

  const markStepPassed = useCallback(
    (stepId: string) => store.getState()._markStepPassed(stepId),
    [store]
  );

  const resetWorkflow = useCallback(() => store.getState()._reset(), [store]);

  // Initialize persistence unconditionally (Rules of Hooks)
  const hasPersistence = !!workflowConfig.persistence?.adapter;

  const persistenceHook = usePersistence({
    workflowId: workflowConfig.id,
    workflowState,
    adapter: workflowConfig.persistence?.adapter ?? NOOP_PERSISTENCE_ADAPTER,
    options: workflowConfig.persistence?.options,
    userId: workflowConfig.persistence?.userId,
  });

  // Ref to avoid re-triggering effect when persistenceHook identity changes
  const persistenceHookRef = useRef(persistenceHook);
  persistenceHookRef.current = persistenceHook;

  // Load persisted data once on mount
  const hasLoadedPersistedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedPersistedRef.current) return;
    hasLoadedPersistedRef.current = true;

    const loadPersistedData = async () => {
      if (hasPersistence) {
        try {
          const persistedData = await persistenceHookRef.current.loadPersistedData();
          if (persistedData) {
            store.getState()._loadPersistedState({
              currentStepIndex: persistedData.currentStepIndex,
              allData: persistedData.allData,
              stepData: persistedData.stepData,
              visitedSteps: new Set(persistedData.visitedSteps),
              passedSteps: new Set(persistedData.passedSteps || []),
            });
            return;
          }
        } catch (error) {
          console.error('Failed to load persisted state:', error);
        }
      }
      store.getState()._setInitializing(false);
    };

    loadPersistedData();
  }, [store, hasPersistence]);

  // Extract persistence utilities (only expose when persistence is configured)
  const persistenceInfo = useMemo(
    () => ({
      isPersisting: hasPersistence ? persistenceHook.isPersisting : false,
      persistenceError: hasPersistence ? persistenceHook.persistenceError : null,
      persistNow: hasPersistence ? persistenceHook.persistNow : undefined,
    }),
    [
      hasPersistence,
      persistenceHook.isPersisting,
      persistenceHook.persistenceError,
      persistenceHook.persistNow,
    ]
  );

  // Create workflow context for conditions and callbacks
  const baseWorkflowContext = useMemo(
    (): Omit<
      WorkflowContext,
      'isFirstStep' | 'isLastStep' | 'visibleVisitedSteps' | 'passedSteps'
    > => ({
      workflowId: workflowConfig.id,
      currentStepIndex: workflowState.currentStepIndex,
      totalSteps: workflowConfig.steps.length,
      allData: workflowState.allData,
      stepData: workflowState.stepData,
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

  // Get current step info
  const currentStep = useMemo(
    () => workflowConfig.steps[workflowState.currentStepIndex],
    [workflowConfig.steps, workflowState.currentStepIndex]
  );

  // Memoize formConfig
  const formConfig = useMemo(() => currentStep?.formConfig, [currentStep?.formConfig]);

  // Initialize conditional logic for steps and fields
  const conditionsHelpers = useWorkflowConditions({
    workflowConfig,
    workflowState,
    currentStep,
  });

  // Calculate isFirst/isLast based on visible steps
  const workflowContext = useMemo((): WorkflowContext => {
    let firstVisibleStepIndex = -1;
    for (let i = 0; i < workflowConfig.steps.length; i++) {
      if (conditionsHelpers.isStepVisible(i)) {
        firstVisibleStepIndex = i;
        break;
      }
    }

    let lastVisibleStepIndex = -1;
    for (let i = workflowConfig.steps.length - 1; i >= 0; i--) {
      if (conditionsHelpers.isStepVisible(i)) {
        lastVisibleStepIndex = i;
        break;
      }
    }

    const visibleVisitedSteps = new Set<string>();
    for (let i = 0; i < workflowConfig.steps.length; i++) {
      const step = workflowConfig.steps[i];
      if (conditionsHelpers.isStepVisible(i) && workflowState.visitedSteps.has(step.id)) {
        visibleVisitedSteps.add(step.id);
      }
    }

    return {
      ...baseWorkflowContext,
      isFirstStep: workflowState.currentStepIndex === firstVisibleStepIndex,
      isLastStep: workflowState.currentStepIndex === lastVisibleStepIndex,
      visibleVisitedSteps,
      passedSteps: workflowState.passedSteps,
    };
  }, [
    baseWorkflowContext,
    workflowState.currentStepIndex,
    workflowState.visitedSteps,
    workflowState.passedSteps,
    conditionsHelpers,
    workflowConfig.steps,
  ]);

  // Initialize analytics tracking
  const { analyticsStartTime } = useWorkflowAnalytics({
    workflowConfig,
    workflowState,
    workflowContext,
  });

  // Initialize navigation
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
    markStepPassed,
    setStepData: setStepDataAction,
    onStepChange: onStepChangeRef.current,
  });

  // Ensure we start on the first visible step
  const hasInitializedStepRef = useRef(false);

  useEffect(() => {
    if (hasInitializedStepRef.current) return;

    const currentStepIsVisible = conditionsHelpers.isStepVisible(workflowState.currentStepIndex);

    if (!currentStepIsVisible) {
      for (let i = 0; i < workflowConfig.steps.length; i++) {
        if (conditionsHelpers.isStepVisible(i)) {
          setCurrentStep(i);
          markStepVisited(i, workflowConfig.steps[i].id);
          break;
        }
      }
    }

    hasInitializedStepRef.current = true;
  }, [
    workflowState.currentStepIndex,
    workflowConfig.steps,
    setCurrentStep,
    markStepVisited,
    conditionsHelpers,
  ]);

  // Handle case where current step becomes hidden
  useEffect(() => {
    if (!hasInitializedStepRef.current) return;

    const currentStepIsVisible = conditionsHelpers.isStepVisible(workflowState.currentStepIndex);

    if (!currentStepIsVisible) {
      let nextVisibleStep: number | null = null;
      for (let i = workflowState.currentStepIndex + 1; i < workflowConfig.steps.length; i++) {
        if (conditionsHelpers.isStepVisible(i)) {
          nextVisibleStep = i;
          break;
        }
      }

      if (nextVisibleStep === null) {
        for (let i = workflowState.currentStepIndex - 1; i >= 0; i--) {
          if (conditionsHelpers.isStepVisible(i)) {
            nextVisibleStep = i;
            break;
          }
        }
      }

      if (nextVisibleStep !== null) {
        setCurrentStep(nextVisibleStep);
        markStepVisited(nextVisibleStep, workflowConfig.steps[nextVisibleStep].id);
      }
    }
  }, [
    conditionsHelpers,
    workflowState.currentStepIndex,
    workflowConfig.steps,
    setCurrentStep,
    markStepVisited,
  ]);

  // Initialize submission
  const { submitWorkflow, isSubmitting, canSubmit } = useWorkflowSubmission({
    workflowConfig,
    workflowState,
    workflowContext,
    setSubmitting,
    onWorkflowComplete: onWorkflowCompleteRef.current,
    analyticsStartTime,
  });

  // Create field value setter for form integration
  const setValue = useCallback(
    (fieldId: string, value: unknown) => {
      setFieldValue(fieldId, value, currentStep?.id || '');
    },
    [setFieldValue, currentStep?.id]
  );

  // Create step data setter
  const handleSetStepData = useCallback(
    (data: Record<string, unknown>) => {
      setStepDataAction(data, currentStep?.id || '');
    },
    [setStepDataAction, currentStep?.id]
  );

  // Create form submission handler
  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (currentStep?.id && values) {
        setStepDataAction(values, currentStep.id);
      }

      if (workflowContext.isLastStep) {
        await submitWorkflow();
      } else {
        await goNext();
      }
    },
    [workflowContext.isLastStep, submitWorkflow, goNext, currentStep?.id, setStepDataAction]
  );

  // Memoize context value
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

  const contextValue: WorkflowContextValue = useMemo(
    () => ({
      workflowState,
      workflowConfig,
      currentStep,
      context: workflowContext,
      formConfig,
      conditionsHelpers,
      currentStepMetadata: currentStep?.metadata,
      ...navigationMethods,
      ...dataMethods,
      ...submissionMethods,
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

  // Memoize FormProvider defaultValues
  const formProviderDefaultValues = useMemo(() => {
    if (!currentStep?.id) return {};

    const currentStepData = (workflowState?.allData[currentStep.id] || {}) as Record<
      string,
      unknown
    >;

    if (!formConfig?.allFields) return currentStepData;

    const currentStepFieldIds = new Set(formConfig.allFields.map((field) => field.id));
    const filteredData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(currentStepData)) {
      if (currentStepFieldIds.has(key)) {
        filteredData[key] = value;
      }
    }

    return filteredData;
  }, [workflowState?.allData, currentStep?.id, formConfig?.allFields]);

  const formProviderKey = useMemo(
    () => workflowState.isInitializing.toString(),
    [workflowState.isInitializing]
  );

  return (
    <WorkflowStoreContext.Provider value={store}>
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
    </WorkflowStoreContext.Provider>
  );
}

export function useWorkflowContext(): WorkflowContextValue {
  const context = useContext(WorkflowReactContext);
  if (!context) {
    throw new Error('useWorkflowContext must be used within a WorkflowProvider');
  }
  return context;
}
