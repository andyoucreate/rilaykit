import type {
  FormConfiguration,
  StepConfig,
  ValidationError,
  ValidationResult,
  WorkflowConfig,
  WorkflowContext
} from "@streamline/core";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

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
  | { type: "SET_CURRENT_STEP"; stepIndex: number }
  | { type: "SET_STEP_DATA"; data: Record<string, any> }
  | { type: "SET_ALL_DATA"; data: Record<string, any> }
  | { type: "SET_FIELD_VALUE"; fieldId: string; value: any }
  | { type: "SET_ERROR"; fieldId: string; errors: ValidationError[] }
  | { type: "SET_WARNING"; fieldId: string; warnings: ValidationError[] }
  | { type: "CLEAR_ERROR"; fieldId: string }
  | { type: "CLEAR_WARNING"; fieldId: string }
  | { type: "MARK_TOUCHED"; fieldId: string }
  | { type: "SET_VALIDATING"; fieldId: string; isValidating: boolean }
  | { type: "SET_SUBMITTING"; isSubmitting: boolean }
  | { type: "SET_TRANSITIONING"; isTransitioning: boolean }
  | { type: "MARK_STEP_VISITED"; stepIndex: number }
  | { type: "SET_PERSISTED_DATA"; data: any }
  | { type: "SET_RESOLVED_STEPS"; steps: StepConfig[] }
  | { type: "RESET_WORKFLOW" };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "SET_CURRENT_STEP":
      return {
        ...state,
        currentStepIndex: action.stepIndex,
        stepData: state.allData[state.resolvedSteps[action.stepIndex]?.id] || {},
      };

    case "SET_STEP_DATA":
      const currentStepId = state.resolvedSteps[state.currentStepIndex]?.id;
      return {
        ...state,
        stepData: action.data,
        allData: {
          ...state.allData,
          [currentStepId]: action.data,
        },
      };

    case "SET_ALL_DATA":
      return {
        ...state,
        allData: action.data,
      };

    case "SET_FIELD_VALUE":
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

    case "SET_ERROR":
      return {
        ...state,
        errors: { ...state.errors, [action.fieldId]: action.errors },
      };

    case "SET_WARNING":
      return {
        ...state,
        warnings: { ...state.warnings, [action.fieldId]: action.warnings },
      };

    case "CLEAR_ERROR":
      const newErrors = { ...state.errors };
      delete newErrors[action.fieldId];
      return {
        ...state,
        errors: newErrors,
      };

    case "CLEAR_WARNING":
      const newWarnings = { ...state.warnings };
      delete newWarnings[action.fieldId];
      return {
        ...state,
        warnings: newWarnings,
      };

    case "MARK_TOUCHED":
      return {
        ...state,
        touched: new Set([...state.touched, action.fieldId]),
      };

    case "SET_VALIDATING":
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

    case "SET_SUBMITTING":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case "SET_TRANSITIONING":
      return {
        ...state,
        isTransitioning: action.isTransitioning,
      };

    case "MARK_STEP_VISITED":
      return {
        ...state,
        visitedSteps: new Set([...state.visitedSteps, state.resolvedSteps[action.stepIndex]?.id]),
      };

    case "SET_PERSISTED_DATA":
      return {
        ...state,
        persistedData: action.data,
      };

    case "SET_RESOLVED_STEPS":
      return {
        ...state,
        resolvedSteps: action.steps,
      };

    case "RESET_WORKFLOW":
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

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

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
  const [workflowState, dispatch] = useReducer<React.Reducer<WorkflowState, WorkflowAction>>(workflowReducer, {
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
  });

  const persistenceRef = useRef<NodeJS.Timeout | null>(null);
  const analyticsStartTime = useRef<number>(Date.now());
  const stepStartTimes = useRef<Map<string, number>>(new Map());

  // Create workflow context function
  const createWorkflowContext = useCallback((): WorkflowContext => {
    return {
      workflowId: workflowConfig.id,
      currentStepIndex: workflowState.currentStepIndex,
      totalSteps: workflowState.resolvedSteps.length,
      allData: workflowState.allData,
      stepData: workflowState.stepData,
      isFirstStep: workflowState.currentStepIndex === 0,
      isLastStep: workflowState.currentStepIndex === workflowState.resolvedSteps.length - 1,
      visitedSteps: workflowState.visitedSteps,
      user,
    };
  }, [workflowConfig.id, workflowState, user]);

  // Resolve dynamic steps
  useEffect(() => {
    const resolveDynamicSteps = async () => {
      const resolvedSteps: StepConfig[] = [];

      for (const step of workflowConfig.steps) {
        if (step.isDynamic && step.dynamicConfig) {
          try {
            const dynamicSteps = await step.dynamicConfig.resolver(
              workflowState.allData,
              createWorkflowContext()
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

      dispatch({ type: "SET_RESOLVED_STEPS", steps: resolvedSteps });
    };

    resolveDynamicSteps();
  }, [workflowConfig.steps, workflowState.allData, createWorkflowContext]);

  // Analytics tracking
  useEffect(() => {
    if (workflowConfig.analytics?.onWorkflowStart) {
      workflowConfig.analytics.onWorkflowStart(workflowConfig.id, createWorkflowContext());
    }
  }, [workflowConfig, createWorkflowContext]);

  // Step change analytics
  useEffect(() => {
    const currentStep = workflowState.resolvedSteps[workflowState.currentStepIndex];
    if (!currentStep) return;

    // Track step start
    stepStartTimes.current.set(currentStep.id, Date.now());
    if (workflowConfig.analytics?.onStepStart) {
      workflowConfig.analytics.onStepStart(
        currentStep.id,
        Date.now(),
        createWorkflowContext()
      );
    }

    return () => {
      // Track step completion when leaving
      const startTime = stepStartTimes.current.get(currentStep.id);
      if (startTime && workflowConfig.analytics?.onStepComplete) {
        workflowConfig.analytics.onStepComplete(
          currentStep.id,
          Date.now() - startTime,
          workflowState.stepData,
          createWorkflowContext()
        );
      }
    };
  }, [workflowState.currentStepIndex, workflowState.resolvedSteps, workflowConfig, workflowState.stepData, createWorkflowContext]);

  // Persistence functions (declared early for use in effects)
  const saveDraft = useCallback(async () => {
    if (!workflowConfig.persistence) return;

    try {
      const draftData = {
        workflowId: workflowConfig.id,
        currentStepIndex: workflowState.currentStepIndex,
        allData: workflowState.allData,
        timestamp: Date.now(),
      };

      switch (workflowConfig.persistence.type) {
        case "localStorage":
          localStorage.setItem(
            `workflow-${workflowConfig.id}`,
            JSON.stringify(draftData)
          );
          break;

        case "sessionStorage":
          sessionStorage.setItem(
            `workflow-${workflowConfig.id}`,
            JSON.stringify(draftData)
          );
          break;

        case "api":
          if (workflowConfig.persistence.endpoint) {
            await fetch(workflowConfig.persistence.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(draftData),
            });
          }
          break;

        case "indexedDB":
          // TODO: Implement IndexedDB persistence
          break;
      }

      if (workflowConfig.persistence.onSave) {
        await workflowConfig.persistence.onSave(draftData);
      }
    } catch (error) {
      console.error("Failed to save workflow draft:", error);
      if (workflowConfig.persistence.onError) {
        await workflowConfig.persistence.onError(error as Error);
      }
         }
   }, [workflowConfig, workflowState]);

  const clearDraft = useCallback(async () => {
    if (!workflowConfig.persistence) return;

    try {
      switch (workflowConfig.persistence.type) {
        case "localStorage":
          localStorage.removeItem(
            `workflow-${workflowConfig.id}`
          );
          break;

        case "sessionStorage":
          sessionStorage.removeItem(
            `workflow-${workflowConfig.id}`
          );
          break;

        case "api":
          if (workflowConfig.persistence.endpoint) {
            await fetch(workflowConfig.persistence.endpoint, {
              method: "DELETE",
            });
          }
          break;

        case "indexedDB":
          // TODO: Implement IndexedDB persistence
          break;
      }
    } catch (error) {
      console.error("Failed to clear workflow draft:", error);
    }
  }, [workflowConfig]);

  // Persistence auto-save
  useEffect(() => {
    if (!workflowConfig.persistence?.saveOnStepChange) return;

    // Clear existing timeout
    if (persistenceRef.current) {
      clearTimeout(persistenceRef.current);
    }

    // Set new timeout for debounced save
    persistenceRef.current = setTimeout(() => {
      saveDraft();
    }, workflowConfig.persistence.debounceMs || 1000);

    return () => {
      if (persistenceRef.current) {
        clearTimeout(persistenceRef.current);
      }
    };
  }, [workflowState.allData, saveDraft]);

  const currentStep = workflowState.resolvedSteps[workflowState.currentStepIndex];

  // Get form configuration from current step
  const formConfig = currentStep?.formConfig;

  // Core navigation functions
  const goToStep = useCallback(async (stepIndex: number): Promise<boolean> => {
    if (stepIndex < 0 || stepIndex >= workflowState.resolvedSteps.length) {
      return false;
    }

    const targetStep = workflowState.resolvedSteps[stepIndex];
    const context = createWorkflowContext();

    // Check permissions
    if (targetStep.permissions) {
      try {
        const hasPermission = targetStep.permissions.customGuard
          ? await targetStep.permissions.customGuard(user, context)
          : true; // Simplified permission check

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
          context
        );
      } catch (error) {
        console.error(`onBeforeEnter hook failed for step "${targetStep.id}":`, error);
        if (workflowConfig.analytics?.onError) {
          workflowConfig.analytics.onError(error as Error, context);
        }
        return false;
      }
    }

    dispatch({ type: "SET_TRANSITIONING", isTransitioning: true });

    try {
      const fromStepIndex = workflowState.currentStepIndex;
      dispatch({ type: "SET_CURRENT_STEP", stepIndex });
      dispatch({ type: "MARK_STEP_VISITED", stepIndex });

      // Call step change callback
      if (onStepChange) {
        onStepChange(fromStepIndex, stepIndex, context);
      }

      return true;
    } finally {
      dispatch({ type: "SET_TRANSITIONING", isTransitioning: false });
    }
  }, [workflowState, createWorkflowContext, onStepChange, user]);

  const goNext = useCallback(async (): Promise<boolean> => {
    const context = createWorkflowContext();

    // Execute after leave hook
    if (currentStep?.hooks?.onAfterLeave) {
      try {
        const canLeave = await currentStep.hooks.onAfterLeave(
          workflowState.stepData,
          workflowState.allData,
          context
        );
        if (!canLeave) {
          return false;
        }
      } catch (error) {
        console.error(`onAfterLeave hook failed for step "${currentStep.id}":`, error);
        return false;
      }
    }

    return goToStep(workflowState.currentStepIndex + 1);
  }, [currentStep, workflowState, goToStep, createWorkflowContext]);

  const goPrevious = useCallback(async (): Promise<boolean> => {
    if (!workflowConfig.navigation?.allowBackNavigation) {
      return false;
    }
    return goToStep(workflowState.currentStepIndex - 1);
  }, [workflowConfig.navigation, workflowState.currentStepIndex, goToStep]);

  const skipStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep?.allowSkip || !workflowConfig.navigation?.allowStepSkipping) {
      return false;
    }

    const context = createWorkflowContext();
    if (workflowConfig.analytics?.onStepSkip) {
      workflowConfig.analytics.onStepSkip(currentStep.id, "user_skip", context);
    }

    return goNext();
  }, [currentStep, workflowConfig, createWorkflowContext, goNext]);

  const setValue = useCallback((fieldId: string, value: any) => {
    dispatch({ type: "SET_FIELD_VALUE", fieldId, value });
  }, []);

  const setStepData = useCallback((data: Record<string, any>) => {
    dispatch({ type: "SET_STEP_DATA", data });
  }, []);

  const validateCurrentStep = useCallback(async (): Promise<ValidationResult> => {
    if (!currentStep) {
      return { isValid: true, errors: [] };
    }

    // TODO: Implement step validation
    return { isValid: true, errors: [] };
  }, [currentStep]);

  const submitWorkflow = useCallback(async () => {
    dispatch({ type: "SET_SUBMITTING", isSubmitting: true });

    try {
      const context = createWorkflowContext();

      // Final validation
      const isValid = await validateCurrentStep();
      if (!isValid.isValid) {
        throw new Error("Workflow validation failed");
      }

      // Execute completion hook
      if (workflowConfig.completion?.onComplete) {
        await workflowConfig.completion.onComplete(workflowState.allData);
      }

      // Call completion callback
      if (onWorkflowComplete) {
        await onWorkflowComplete(workflowState.allData);
      }

      // Analytics
      if (workflowConfig.analytics?.onWorkflowComplete) {
        workflowConfig.analytics.onWorkflowComplete(
          workflowConfig.id,
          Date.now() - analyticsStartTime.current,
          workflowState.allData
        );
      }

      // Clear draft after successful completion
      await clearDraft();
    } finally {
      dispatch({ type: "SET_SUBMITTING", isSubmitting: false });
    }
  }, [workflowConfig, workflowState, createWorkflowContext, validateCurrentStep, onWorkflowComplete, clearDraft]);

  const resetWorkflow = useCallback(() => {
    dispatch({ type: "RESET_WORKFLOW" });
    analyticsStartTime.current = Date.now();
  }, []);



  const loadDraft = useCallback(async () => {
    if (!workflowConfig.persistence) return;

    try {
      let draftData: any = null;

      switch (workflowConfig.persistence.type) {
        case "localStorage":
          const localData = localStorage.getItem(
            `workflow-${workflowConfig.id}`
          );
          draftData = localData ? JSON.parse(localData) : null;
          break;

        case "sessionStorage":
          const sessionData = sessionStorage.getItem(
            `workflow-${workflowConfig.id}`
          );
          draftData = sessionData ? JSON.parse(sessionData) : null;
          break;

        case "api":
          if (workflowConfig.persistence.endpoint) {
            const response = await fetch(workflowConfig.persistence.endpoint);
            draftData = await response.json();
          }
          break;

        case "indexedDB":
          // TODO: Implement IndexedDB persistence
          break;
      }

      if (draftData) {
        dispatch({ type: "SET_ALL_DATA", data: draftData.allData });
        dispatch({ type: "SET_CURRENT_STEP", stepIndex: draftData.currentStepIndex });
        dispatch({ type: "SET_PERSISTED_DATA", data: draftData });

        if (workflowConfig.persistence.onRestore) {
          await workflowConfig.persistence.onRestore(draftData);
        }
      }
    } catch (error) {
      console.error("Failed to load workflow draft:", error);
      if (workflowConfig.persistence.onError) {
        await workflowConfig.persistence.onError(error as Error);
      }
    }
  }, [workflowConfig]);

  // Load draft on mount if recovery is enabled
  useEffect(() => {
    if (workflowConfig.persistence?.recoverOnReload) {
      loadDraft();
    }
  }, [workflowConfig.persistence?.recoverOnReload, loadDraft]);

  const contextValue: WorkflowContextValue = {
    workflowState,
    workflowConfig,
    currentStep: currentStep || workflowState.resolvedSteps[0],
    context: createWorkflowContext(),
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
  };

  return (
    <WorkflowContext.Provider value={contextValue}>
      <div className={`streamline-workflow ${className || ''}`}>
        {children}
      </div>
    </WorkflowContext.Provider>
  );
}

export function useWorkflowContext(): WorkflowContextValue {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflowContext must be used within a WorkflowProvider");
  }
  return context;
} 