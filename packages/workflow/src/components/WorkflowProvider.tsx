import type {
  FormConfiguration,
  StepConfig,
  ValidationError,
  ValidationResult,
  WorkflowConfig,
  WorkflowContext,
} from '@rilay/core';
import { FormProvider } from '@rilay/form-builder';
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
  errors: Record<string, ValidationError[]>;
  warnings: Record<string, ValidationError[]>;
  touched: Set<string>;
  isValidating: Set<string>;
  visitedSteps: Set<string>;
  isSubmitting: boolean;
  isTransitioning: boolean;
  persistedData?: any;
  resolvedSteps: StepConfig[]; // For dynamic steps
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
  validateCurrentStep: () => Promise<ValidationResult>;
  submitWorkflow: () => Promise<void>;
  resetWorkflow: () => void;

  // Persistence
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<void>;
  clearDraft: () => Promise<void>;
}

type WorkflowAction =
  | { type: 'SET_CURRENT_STEP'; stepIndex: number }
  | { type: 'SET_STEP_DATA'; data: Record<string, any> }
  | { type: 'SET_ALL_DATA'; data: Record<string, any> }
  | { type: 'SET_FIELD_VALUE'; fieldId: string; value: any }
  | { type: 'SET_ERROR'; fieldId: string; errors: ValidationError[] }
  | { type: 'SET_WARNING'; fieldId: string; warnings: ValidationError[] }
  | { type: 'CLEAR_ERROR'; fieldId: string }
  | { type: 'CLEAR_WARNING'; fieldId: string }
  | { type: 'MARK_TOUCHED'; fieldId: string }
  | { type: 'SET_VALIDATING'; fieldId: string; isValidating: boolean }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_TRANSITIONING'; isTransitioning: boolean }
  | { type: 'MARK_STEP_VISITED'; stepIndex: number }
  | { type: 'SET_PERSISTED_DATA'; data: any }
  | { type: 'SET_RESOLVED_STEPS'; steps: StepConfig[] }
  | { type: 'RESET_WORKFLOW' };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return {
        ...state,
        currentStepIndex: action.stepIndex,
        stepData: state.allData[state.resolvedSteps[action.stepIndex]?.id] || {},
      };

    case 'SET_STEP_DATA': {
      const currentStepId = state.resolvedSteps[state.currentStepIndex]?.id;
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
      const currentStepIdForField = state.resolvedSteps[state.currentStepIndex]?.id;
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

    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.fieldId]: action.errors },
      };

    case 'SET_WARNING':
      return {
        ...state,
        warnings: { ...state.warnings, [action.fieldId]: action.warnings },
      };

    case 'CLEAR_ERROR': {
      const newErrors = { ...state.errors };
      delete newErrors[action.fieldId];
      return {
        ...state,
        errors: newErrors,
      };
    }

    case 'CLEAR_WARNING': {
      const newWarnings = { ...state.warnings };
      delete newWarnings[action.fieldId];
      return {
        ...state,
        warnings: newWarnings,
      };
    }

    case 'MARK_TOUCHED':
      return {
        ...state,
        touched: new Set([...state.touched, action.fieldId]),
      };

    case 'SET_VALIDATING': {
      const newValidating = new Set(state.isValidating);
      if (action.isValidating) {
        newValidating.add(action.fieldId);
      } else {
        newValidating.delete(action.fieldId);
      }
      return {
        ...state,
        isValidating: newValidating,
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
        visitedSteps: new Set([...state.visitedSteps, state.resolvedSteps[action.stepIndex]?.id]),
      };

    case 'SET_PERSISTED_DATA':
      return {
        ...state,
        persistedData: action.data,
      };

    case 'SET_RESOLVED_STEPS':
      return {
        ...state,
        resolvedSteps: action.steps,
      };

    case 'RESET_WORKFLOW':
      return {
        currentStepIndex: 0,
        allData: {},
        stepData: {},
        errors: {},
        warnings: {},
        touched: new Set(),
        isValidating: new Set(),
        visitedSteps: new Set(),
        isSubmitting: false,
        isTransitioning: false,
        resolvedSteps: state.resolvedSteps, // Keep resolved steps
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
  user?: any;
}

export function WorkflowProvider({
  children,
  workflowConfig,
  defaultValues = {},
  onStepChange,
  onWorkflowComplete,
  className,
  user,
}: WorkflowProviderProps) {
  const [workflowState, dispatch] = useReducer<React.Reducer<WorkflowState, WorkflowAction>>(
    workflowReducer,
    {
      currentStepIndex: 0,
      allData: defaultValues,
      stepData: {},
      errors: {},
      warnings: {},
      touched: new Set(),
      isValidating: new Set(),
      visitedSteps: new Set(),
      isSubmitting: false,
      isTransitioning: false,
      resolvedSteps: workflowConfig.steps,
    }
  );

  const persistenceRef = useRef<NodeJS.Timeout | null>(null);
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
      totalSteps: workflowState.resolvedSteps.length,
      allData: workflowState.allData,
      stepData: workflowState.stepData,
      isFirstStep: workflowState.currentStepIndex === 0,
      isLastStep: workflowState.currentStepIndex === workflowState.resolvedSteps.length - 1,
      visitedSteps: workflowState.visitedSteps,
      user,
    };
  }, [
    memoizedWorkflowConfig.id,
    workflowState.currentStepIndex,
    workflowState.resolvedSteps.length,
    workflowState.allData,
    workflowState.stepData,
    workflowState.visitedSteps,
    user,
  ]);

  // Resolve dynamic steps - use memoized workflowConfig
  useEffect(() => {
    const resolveDynamicSteps = async () => {
      const resolvedSteps: StepConfig[] = [];

      for (const step of memoizedWorkflowConfig.steps) {
        if (step.isDynamic && step.dynamicConfig) {
          try {
            const dynamicSteps = await step.dynamicConfig.resolver(
              workflowState.allData,
              workflowContext
            );
            resolvedSteps.push(...dynamicSteps);
          } catch (error) {
            console.error(`Failed to resolve dynamic step "${step.id}":`, error);
            // Fallback to original step
            resolvedSteps.push({
              ...step,
              isDynamic: false,
            });
          }
        } else {
          resolvedSteps.push(step);
        }
      }

      dispatch({ type: 'SET_RESOLVED_STEPS', steps: resolvedSteps });
    };

    resolveDynamicSteps();
  }, [memoizedWorkflowConfig.steps, workflowState.allData, workflowContext]);

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
    const currentStep = workflowState.resolvedSteps[workflowState.currentStepIndex];
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
    workflowState.resolvedSteps,
    memoizedWorkflowConfig.analytics,
    workflowContext,
  ]);

  // Memoize persistence functions to avoid recreation
  const saveDraft = useCallback(async () => {
    if (!memoizedWorkflowConfig.persistence) return;

    try {
      const draftData = {
        workflowId: memoizedWorkflowConfig.id,
        currentStepIndex: workflowState.currentStepIndex,
        allData: workflowState.allData,
        timestamp: Date.now(),
      };

      switch (memoizedWorkflowConfig.persistence.type) {
        case 'localStorage':
          localStorage.setItem(`workflow-${memoizedWorkflowConfig.id}`, JSON.stringify(draftData));
          break;

        case 'sessionStorage':
          sessionStorage.setItem(
            `workflow-${memoizedWorkflowConfig.id}`,
            JSON.stringify(draftData)
          );
          break;

        case 'api':
          if (memoizedWorkflowConfig.persistence.endpoint) {
            await fetch(memoizedWorkflowConfig.persistence.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(draftData),
            });
          }
          break;

        case 'indexedDB':
          // TODO: Implement IndexedDB persistence
          break;
      }

      if (memoizedWorkflowConfig.persistence.onSave) {
        await memoizedWorkflowConfig.persistence.onSave(draftData);
      }
    } catch (error) {
      console.error('Failed to save workflow draft:', error);
      if (memoizedWorkflowConfig.persistence.onError) {
        await memoizedWorkflowConfig.persistence.onError(error as Error);
      }
    }
  }, [memoizedWorkflowConfig, workflowState.currentStepIndex, workflowState.allData]);

  const loadDraft = useCallback(async () => {
    if (!memoizedWorkflowConfig.persistence) return;

    try {
      let draftData: any = null;

      switch (memoizedWorkflowConfig.persistence.type) {
        case 'localStorage': {
          const stored = localStorage.getItem(`workflow-${memoizedWorkflowConfig.id}`);
          if (stored) {
            draftData = JSON.parse(stored);
          }
          break;
        }

        case 'sessionStorage': {
          const stored = sessionStorage.getItem(`workflow-${memoizedWorkflowConfig.id}`);
          if (stored) {
            draftData = JSON.parse(stored);
          }
          break;
        }

        case 'api':
          if (memoizedWorkflowConfig.persistence.endpoint) {
            const response = await fetch(memoizedWorkflowConfig.persistence.endpoint);
            if (response.ok) {
              draftData = await response.json();
            }
          }
          break;

        case 'indexedDB':
          // TODO: Implement IndexedDB persistence
          break;
      }

      if (draftData && draftData.workflowId === memoizedWorkflowConfig.id) {
        dispatch({ type: 'SET_ALL_DATA', data: draftData.allData });
        dispatch({ type: 'SET_CURRENT_STEP', stepIndex: draftData.currentStepIndex });
        dispatch({ type: 'SET_PERSISTED_DATA', data: draftData });

        // Note: Additional load callbacks can be added here when needed
      }
    } catch (error) {
      console.error('Failed to load workflow draft:', error);
      if (memoizedWorkflowConfig.persistence.onError) {
        await memoizedWorkflowConfig.persistence.onError(error as Error);
      }
    }
  }, [memoizedWorkflowConfig]);

  const clearDraft = useCallback(async () => {
    if (!memoizedWorkflowConfig.persistence) return;

    try {
      switch (memoizedWorkflowConfig.persistence.type) {
        case 'localStorage':
          localStorage.removeItem(`workflow-${memoizedWorkflowConfig.id}`);
          break;

        case 'sessionStorage':
          sessionStorage.removeItem(`workflow-${memoizedWorkflowConfig.id}`);
          break;

        case 'api':
          if (memoizedWorkflowConfig.persistence.endpoint) {
            await fetch(memoizedWorkflowConfig.persistence.endpoint, {
              method: 'DELETE',
            });
          }
          break;

        case 'indexedDB':
          // TODO: Implement IndexedDB persistence
          break;
      }
    } catch (error) {
      console.error('Failed to clear workflow draft:', error);
    }
  }, [memoizedWorkflowConfig]);

  // Persistence auto-save - optimized dependencies
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!memoizedWorkflowConfig.persistence?.saveOnStepChange) return;

    // Clear existing timeout
    if (persistenceRef.current) {
      clearTimeout(persistenceRef.current);
    }

    // Set new timeout for debounced save
    persistenceRef.current = setTimeout(() => {
      saveDraft();
    }, memoizedWorkflowConfig.persistence.debounceMs || 1000);

    return () => {
      if (persistenceRef.current) {
        clearTimeout(persistenceRef.current);
      }
    };
  }, [workflowState.allData, saveDraft, memoizedWorkflowConfig.persistence]);

  // Memoize current step to avoid recalculation
  const currentStep = useMemo(
    () => workflowState.resolvedSteps[workflowState.currentStepIndex],
    [workflowState.resolvedSteps, workflowState.currentStepIndex]
  );

  // Get form configuration from current step
  const formConfig = useMemo(() => currentStep?.formConfig, [currentStep]);

  // Core navigation functions - optimized with fewer dependencies
  const goToStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (stepIndex < 0 || stepIndex >= workflowState.resolvedSteps.length) {
        return false;
      }

      const targetStep = workflowState.resolvedSteps[stepIndex];

      // Check permissions
      if (targetStep.permissions) {
        try {
          const hasPermission = targetStep.permissions.customGuard
            ? await targetStep.permissions.customGuard(user, workflowContext)
            : true;

          if (!hasPermission) {
            console.warn(`Access denied to step "${targetStep.id}"`);
            return false;
          }
        } catch (error) {
          console.error(`Permission check failed for step "${targetStep.id}":`, error);
          return false;
        }
      }

      // Execute before enter hook
      if (targetStep.hooks?.onBeforeEnter) {
        try {
          await targetStep.hooks.onBeforeEnter(
            workflowState.stepData,
            workflowState.allData,
            workflowContext
          );
        } catch (error) {
          console.error(`onBeforeEnter hook failed for step "${targetStep.id}":`, error);
          if (memoizedWorkflowConfig.analytics?.onError) {
            memoizedWorkflowConfig.analytics.onError(error as Error, workflowContext);
          }
          return false;
        }
      }

      dispatch({ type: 'SET_TRANSITIONING', isTransitioning: true });

      try {
        // Call onStepChange using ref
        if (onStepChangeRef.current) {
          onStepChangeRef.current(workflowState.currentStepIndex, stepIndex, workflowContext);
        }

        dispatch({ type: 'SET_CURRENT_STEP', stepIndex });
        dispatch({ type: 'MARK_STEP_VISITED', stepIndex });

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
      workflowState.resolvedSteps,
      workflowState.currentStepIndex,
      workflowState.stepData,
      workflowState.allData,
      user,
      workflowContext,
      memoizedWorkflowConfig.analytics,
    ]
  );

  const setValue = useCallback((fieldId: string, value: any) => {
    dispatch({ type: 'SET_FIELD_VALUE', fieldId, value });
  }, []);

  const setStepData = useCallback((data: Record<string, any>) => {
    dispatch({ type: 'SET_STEP_DATA', data });
  }, []);

  const validateCurrentStep = useCallback(async (): Promise<ValidationResult> => {
    if (!currentStep) {
      return { isValid: true, errors: [] };
    }

    // TODO: Implement step validation
    return { isValid: true, errors: [] };
  }, [currentStep]);

  const goNext = useCallback(async (): Promise<boolean> => {
    return goToStep(workflowState.currentStepIndex + 1);
  }, [goToStep, workflowState.currentStepIndex]);

  const goPrevious = useCallback(async (): Promise<boolean> => {
    if (!memoizedWorkflowConfig.navigation?.allowBackNavigation) {
      return false;
    }
    return goToStep(workflowState.currentStepIndex - 1);
  }, [memoizedWorkflowConfig.navigation, workflowState.currentStepIndex, goToStep]);

  const skipStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep?.allowSkip || !memoizedWorkflowConfig.navigation?.allowStepSkipping) {
      return false;
    }

    if (memoizedWorkflowConfig.analytics?.onStepSkip) {
      memoizedWorkflowConfig.analytics.onStepSkip(currentStep.id, 'user_skip', workflowContext);
    }

    // Skipping does not trigger validation, so we call goToStep directly
    return goToStep(workflowState.currentStepIndex + 1);
  }, [
    currentStep,
    memoizedWorkflowConfig.navigation,
    memoizedWorkflowConfig.analytics,
    workflowContext,
    goToStep,
    workflowState.currentStepIndex,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const submitWorkflow = useCallback(async () => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      if (onWorkflowCompleteRef.current) {
        await onWorkflowCompleteRef.current(workflowState.allData);
      }

      // Clear draft after successful completion
      await clearDraft();

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
    clearDraft,
    memoizedWorkflowConfig.analytics,
    workflowContext,
  ]);

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
      validateCurrentStep,
      submitWorkflow,
      resetWorkflow,
      saveDraft,
      loadDraft,
      clearDraft,
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
      validateCurrentStep,
      submitWorkflow,
      resetWorkflow,
      saveDraft,
      loadDraft,
      clearDraft,
    ]
  );

  const handleSubmit = useCallback(async () => {
    await goNext();
  }, [goNext]);

  return (
    <WorkflowReactContext.Provider value={contextValue}>
      <FormProvider
        key={currentStep?.id}
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
