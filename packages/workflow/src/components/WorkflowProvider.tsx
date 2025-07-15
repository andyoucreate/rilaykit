import type {
  FormConfiguration,
  StepConfig,
  StepDataHelper,
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
  useReducer,
  useRef,
} from 'react';

export interface WorkflowState {
  currentStepIndex: number;
  allData: Record<string, any>;
  stepData: Record<string, any>;
  visitedSteps: Set<string>;
  isSubmitting: boolean;
  isTransitioning: boolean;
}

export interface WorkflowContextValue {
  workflowState: WorkflowState;
  workflowConfig: WorkflowConfig;
  currentStep: StepConfig;
  context: WorkflowContext;
  formConfig?: FormConfiguration;

  // Actions
  goToStep: (stepIndex: number) => Promise<boolean>;
  goNext: () => Promise<boolean>;
  goPrevious: () => Promise<boolean>;
  skipStep: () => Promise<boolean>;
  setValue: (fieldId: string, value: any) => void;
  setStepData: (data: Record<string, any>) => void;
  submitWorkflow: () => Promise<void>;
  resetWorkflow: () => void;
}

type WorkflowAction =
  | { type: 'SET_CURRENT_STEP'; stepIndex: number }
  | { type: 'SET_STEP_DATA'; data: Record<string, any>; stepId: string }
  | { type: 'SET_ALL_DATA'; data: Record<string, any> }
  | { type: 'SET_FIELD_VALUE'; fieldId: string; value: any; stepId: string }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_TRANSITIONING'; isTransitioning: boolean }
  | { type: 'MARK_STEP_VISITED'; stepIndex: number; stepId: string }
  | { type: 'RESET_WORKFLOW' };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return {
        ...state,
        currentStepIndex: action.stepIndex,
      };

    case 'SET_STEP_DATA': {
      const currentStepId = action.stepId; // We need to pass stepId in the action
      return {
        ...state,
        stepData: action.data,
        allData: {
          ...state.allData,
          [currentStepId]: action.data,
        },
      };
    }

    case 'SET_ALL_DATA':
      return {
        ...state,
        allData: action.data,
      };

    case 'SET_FIELD_VALUE': {
      const currentStepIdForField = action.stepId; // We need to pass stepId in the action
      const newStepData = { ...state.stepData, [action.fieldId]: action.value };
      return {
        ...state,
        stepData: newStepData,
        allData: {
          ...state.allData,
          [currentStepIdForField]: newStepData,
        },
      };
    }

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case 'SET_TRANSITIONING':
      return {
        ...state,
        isTransitioning: action.isTransitioning,
      };

    case 'MARK_STEP_VISITED':
      return {
        ...state,
        visitedSteps: new Set([...state.visitedSteps, action.stepId]), // We need to pass stepId
      };

    case 'RESET_WORKFLOW':
      return {
        currentStepIndex: 0,
        allData: {},
        stepData: {},
        visitedSteps: new Set(),
        isSubmitting: false,
        isTransitioning: false,
      };

    default:
      return state;
  }
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
  const [workflowState, dispatch] = useReducer<React.Reducer<WorkflowState, WorkflowAction>>(
    workflowReducer,
    {
      currentStepIndex: 0,
      allData: defaultValues,
      stepData: {},
      visitedSteps: new Set(),
      isSubmitting: false,
      isTransitioning: false,
    }
  );

  const analyticsStartTime = useRef<number>(Date.now());
  const stepStartTimes = useRef<Map<string, number>>(new Map());
  const workflowStartedRef = useRef<boolean>(false);
  const currentStepRef = useRef<string | null>(null);

  // Use refs for callbacks to avoid recreating context
  const onStepChangeRef = useRef(onStepChange);
  const onWorkflowCompleteRef = useRef(onWorkflowComplete);

  // Update refs when props change
  onStepChangeRef.current = onStepChange;
  onWorkflowCompleteRef.current = onWorkflowComplete;

  // Memoize workflow config to avoid unnecessary recalculations
  const memoizedWorkflowConfig = useMemo(() => workflowConfig, [workflowConfig]);

  // Memoize workflow context creation - this is the expensive operation
  const workflowContext = useMemo((): WorkflowContext => {
    return {
      workflowId: memoizedWorkflowConfig.id,
      currentStepIndex: workflowState.currentStepIndex,
      totalSteps: memoizedWorkflowConfig.steps.length,
      allData: workflowState.allData,
      stepData: workflowState.stepData,
      isFirstStep: workflowState.currentStepIndex === 0,
      isLastStep: workflowState.currentStepIndex === memoizedWorkflowConfig.steps.length - 1,
      visitedSteps: workflowState.visitedSteps,
    };
  }, [
    memoizedWorkflowConfig.id,
    workflowState.currentStepIndex,
    memoizedWorkflowConfig.steps.length,
    workflowState.allData,
    workflowState.stepData,
    workflowState.visitedSteps,
  ]);

  // Analytics tracking - only run once on mount
  useEffect(() => {
    if (memoizedWorkflowConfig.analytics?.onWorkflowStart && !workflowStartedRef.current) {
      workflowStartedRef.current = true;
      memoizedWorkflowConfig.analytics.onWorkflowStart(memoizedWorkflowConfig.id, workflowContext);
    }
  }, [memoizedWorkflowConfig.id, memoizedWorkflowConfig.analytics, workflowContext]);

  // Step change analytics - optimized to avoid spam
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const currentStep = memoizedWorkflowConfig.steps[workflowState.currentStepIndex];
    if (!currentStep) return;

    // Only trigger if step actually changed
    if (currentStepRef.current === currentStep.id) return;

    // Track step completion for previous step
    if (currentStepRef.current && memoizedWorkflowConfig.analytics?.onStepComplete) {
      const startTime = stepStartTimes.current.get(currentStepRef.current);
      if (startTime) {
        memoizedWorkflowConfig.analytics.onStepComplete(
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
    if (memoizedWorkflowConfig.analytics?.onStepStart) {
      memoizedWorkflowConfig.analytics.onStepStart(currentStep.id, Date.now(), workflowContext);
    }
  }, [
    workflowState.currentStepIndex,
    memoizedWorkflowConfig.steps,
    memoizedWorkflowConfig.analytics,
    workflowContext,
  ]);

  // Memoize current step to avoid recalculation
  const currentStep = useMemo(
    () => memoizedWorkflowConfig.steps[workflowState.currentStepIndex],
    [memoizedWorkflowConfig.steps, workflowState.currentStepIndex]
  );

  // Get form configuration from current step
  const formConfig = useMemo(() => currentStep?.formConfig, [currentStep]);

  // Core navigation functions - optimized with fewer dependencies
  const goToStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (stepIndex < 0 || stepIndex >= memoizedWorkflowConfig.steps.length) {
        return false;
      }

      dispatch({ type: 'SET_TRANSITIONING', isTransitioning: true });

      try {
        // Call onStepChange using ref
        if (onStepChangeRef.current) {
          onStepChangeRef.current(workflowState.currentStepIndex, stepIndex, workflowContext);
        }

        dispatch({ type: 'SET_CURRENT_STEP', stepIndex });
        dispatch({
          type: 'MARK_STEP_VISITED',
          stepIndex,
          stepId: memoizedWorkflowConfig.steps[stepIndex].id,
        });

        return true;
      } catch (error) {
        console.error('Step transition failed:', error);
        if (memoizedWorkflowConfig.analytics?.onError) {
          memoizedWorkflowConfig.analytics.onError(error as Error, workflowContext);
        }
        return false;
      } finally {
        dispatch({ type: 'SET_TRANSITIONING', isTransitioning: false });
      }
    },
    [
      memoizedWorkflowConfig.steps,
      workflowState.currentStepIndex,
      workflowContext,
      memoizedWorkflowConfig.analytics,
    ]
  );

  // Create step data helper with clean methods for modifying workflow data
  const createStepDataHelper = useCallback((): StepDataHelper => {
    return {
      setStepData: (stepId: string, data: Record<string, any>) => {
        dispatch({ type: 'SET_STEP_DATA', data, stepId });
      },

      setStepFields: (stepId: string, fields: Record<string, any>) => {
        const existingData = workflowState.allData[stepId] || {};
        const mergedData = { ...existingData, ...fields };
        dispatch({ type: 'SET_STEP_DATA', data: mergedData, stepId });
      },

      getStepData: (stepId: string) => {
        return workflowState.allData[stepId] || {};
      },

      setNextStepField: (fieldId: string, value: any) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < memoizedWorkflowConfig.steps.length) {
          const nextStepId = memoizedWorkflowConfig.steps[nextStepIndex].id;
          const existingData = workflowState.allData[nextStepId] || {};
          const mergedData = { ...existingData, [fieldId]: value };
          dispatch({ type: 'SET_STEP_DATA', data: mergedData, stepId: nextStepId });
        }
      },

      setNextStepFields: (fields: Record<string, any>) => {
        const nextStepIndex = workflowState.currentStepIndex + 1;
        if (nextStepIndex < memoizedWorkflowConfig.steps.length) {
          const nextStepId = memoizedWorkflowConfig.steps[nextStepIndex].id;
          const existingData = workflowState.allData[nextStepId] || {};
          const mergedData = { ...existingData, ...fields };
          dispatch({ type: 'SET_STEP_DATA', data: mergedData, stepId: nextStepId });
        }
      },

      getAllData: () => {
        return { ...workflowState.allData };
      },

      getSteps: () => {
        return [...memoizedWorkflowConfig.steps];
      },
    };
  }, [workflowState.allData, workflowState.currentStepIndex, memoizedWorkflowConfig.steps]);

  const setValue = useCallback(
    (fieldId: string, value: any) => {
      dispatch({ type: 'SET_FIELD_VALUE', fieldId, value, stepId: currentStep?.id || '' });
    },
    [currentStep?.id]
  );

  const setStepData = useCallback(
    (data: Record<string, any>) => {
      dispatch({ type: 'SET_STEP_DATA', data, stepId: currentStep?.id || '' });
    },
    [currentStep?.id]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const submitWorkflow = useCallback(async () => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      if (onWorkflowCompleteRef.current) {
        await onWorkflowCompleteRef.current(workflowState.allData);
      }

      // Track workflow completion
      if (memoizedWorkflowConfig.analytics?.onWorkflowComplete) {
        const totalTime = Date.now() - analyticsStartTime.current;
        memoizedWorkflowConfig.analytics.onWorkflowComplete(
          memoizedWorkflowConfig.id,
          totalTime,
          workflowState.allData
        );
      }
    } catch (error) {
      console.error('Workflow submission failed:', error);
      if (memoizedWorkflowConfig.analytics?.onError) {
        memoizedWorkflowConfig.analytics.onError(error as Error, workflowContext);
      }
      throw error;
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [
    workflowState.allData,
    onWorkflowCompleteRef,
    memoizedWorkflowConfig.analytics,
    workflowContext,
  ]);

  const goNext = useCallback(async (): Promise<boolean> => {
    // Before transitioning, call onAfterValidation if it exists
    if (currentStep?.onAfterValidation) {
      try {
        const helper = createStepDataHelper();

        await currentStep.onAfterValidation(workflowState.stepData, helper, workflowContext);
      } catch (error) {
        console.error('onAfterValidation failed:', error);
        if (memoizedWorkflowConfig.analytics?.onError) {
          memoizedWorkflowConfig.analytics.onError(error as Error, workflowContext);
        }
        return false;
      }
    }

    const nextStepIndex = workflowState.currentStepIndex + 1;

    // If we're at the last step, complete the workflow instead of going to next step
    if (nextStepIndex >= memoizedWorkflowConfig.steps.length) {
      await submitWorkflow();
      return true;
    }

    return goToStep(nextStepIndex);
  }, [
    currentStep,
    createStepDataHelper,
    workflowState.stepData,
    workflowContext,
    memoizedWorkflowConfig.analytics,
    memoizedWorkflowConfig.steps.length,
    goToStep,
    workflowState.currentStepIndex,
    submitWorkflow,
  ]);

  const goPrevious = useCallback(async (): Promise<boolean> => {
    return goToStep(workflowState.currentStepIndex - 1);
  }, [workflowState.currentStepIndex, goToStep]);

  const skipStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep?.allowSkip) {
      return false;
    }

    if (memoizedWorkflowConfig.analytics?.onStepSkip) {
      memoizedWorkflowConfig.analytics.onStepSkip(currentStep.id, 'user_skip', workflowContext);
    }

    // If this is the last step, complete the workflow instead of going to next step
    if (workflowContext.isLastStep) {
      await submitWorkflow();
      return true;
    }

    // Otherwise, go to next step (skipping does not trigger validation)
    return goNext();
  }, [currentStep, memoizedWorkflowConfig.analytics, workflowContext, goNext, submitWorkflow]);

  const resetWorkflow = useCallback(() => {
    dispatch({ type: 'RESET_WORKFLOW' });
  }, []);

  // Memoize context value to prevent unnecessary re-renders of all children
  const contextValue: WorkflowContextValue = useMemo(
    () => ({
      workflowState,
      workflowConfig: memoizedWorkflowConfig,
      currentStep,
      context: workflowContext,
      formConfig,
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      setValue,
      setStepData,
      submitWorkflow,
      resetWorkflow,
    }),
    [
      workflowState,
      memoizedWorkflowConfig,
      currentStep,
      workflowContext,
      formConfig,
      goToStep,
      goNext,
      goPrevious,
      skipStep,
      setValue,
      setStepData,
      submitWorkflow,
      resetWorkflow,
    ]
  );

  const handleSubmit = useCallback(async () => {
    await goNext();
  }, [goNext]);

  return (
    <WorkflowReactContext.Provider value={contextValue}>
      <FormProvider
        formConfig={currentStep?.formConfig}
        defaultValues={workflowState?.allData[currentStep?.id] || {}}
        onFieldChange={setValue}
        data-workflow-id={memoizedWorkflowConfig.id}
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
