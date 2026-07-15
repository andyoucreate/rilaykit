import {
  ConfigurationError,
  type FormConfiguration,
  type StepConfig,
  type WorkflowConfig,
  type WorkflowContext,
  getLogger,
} from '@rilaykit/core';
import { FormProvider, parseCompositeKey } from '@rilaykit/forms';
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
import { useStore } from 'zustand';
import {
  useWorkflowAnalytics,
  useWorkflowConditions,
  useWorkflowNavigation,
  useWorkflowSubmission,
} from '../hooks';
import { usePersistence } from '../hooks/usePersistence';
import type { UseWorkflowConditionsReturn } from '../hooks/useWorkflowConditions';
import type { WorkflowPersistenceAdapter } from '../persistence/types';
import { combineWorkflowDataForConditions } from '../utils/dataFlattening';
import { flattenAuthoredSlice, normalizeRepeatableSlices } from '../utils/normalizeRepeatableSlices';

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

const log = getLogger('workflow:provider');

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

/**
 * Layers a persisted `allData` over the compiled `defaultValues`, step by step.
 *
 * The granularity is the STEP, not the key. A snapshot only carries what its
 * session recorded: the steps it says nothing about are not steps with no data,
 * they are steps it has no opinion about, and the flow's own defaults are the
 * answer for them — replacing `allData` wholesale blanked every default of every
 * step the user never reached. But a step the snapshot DOES mention it has a
 * COMPLETE opinion about: `allData[stepId]` is seeded from that step's defaults
 * at store creation and is the only slice ever written thereafter, so a recorded
 * slice already contains every default it did not override. The keys it omits
 * are keys that ceased to exist — the repeatable row the user deleted. Layering
 * the defaults back underneath key-by-key is the append-only mirror all over
 * again, at the persistence layer: it resurrects exactly those rows.
 *
 * The accumulator is a Map: a step id is data, and `merged['__proto__'] = slice`
 * on a plain object reassigns the prototype instead of recording a key, silently
 * dropping that step. `Object.fromEntries` defines every key as an own property.
 */
function mergeStepSlices(
  defaults: Record<string, unknown>,
  persisted: Record<string, unknown>
): Record<string, unknown> {
  const merged = new Map<string, unknown>(Object.entries(defaults));

  for (const [stepId, persistedSlice] of Object.entries(persisted)) {
    merged.set(stepId, persistedSlice);
  }

  return Object.fromEntries(merged);
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
      log.warn(`Default step with ID "${defaultStep}" not found. Starting at step 0.`);
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
      // Normalise the authored defaults to the store's single internal shape
      // (flat composite keys) BEFORE they ever land in `allData`. See
      // {@link normalizeRepeatableSlices}.
      defaultValues: normalizeRepeatableSlices(defaultValues, workflowConfig.steps),
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
      repeatableOrders: state._repeatableOrders,
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
        repeatableOrders: state._repeatableOrders,
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

  // Live reader for navigation: the workflowState snapshot goes stale within
  // a single navigation tick (e.g. onAfterValidation prefilling the next step)
  const getAllData = useCallback(() => store.getState().allData, [store]);

  // Live reader for the mirrored row order — same rationale as `getAllData`:
  // the boundaries that structure a slice for the host run inside a single
  // navigation/submit tick, before any React commit refreshes a snapshot.
  const getRepeatableOrders = useCallback(() => store.getState()._repeatableOrders, [store]);

  const setFieldValue = useCallback(
    (fieldId: string, value: unknown, stepId: string) =>
      store.getState()._setFieldValue(fieldId, value, stepId),
    [store]
  );

  const removeFieldValues = useCallback(
    (fieldIds: string[], stepId: string) => store.getState()._removeFieldValues(fieldIds, stepId),
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

  // Shared flag: submission flips this on completion so the analytics abandon
  // cleanup does not treat a normal completion as an abandonment on unmount,
  // and so the persistence auto-save stops scheduling after completion (a save
  // after clear-on-completion would resurrect the finished workflow).
  const workflowCompletedRef = useRef<boolean>(false);

  // Initialize persistence unconditionally (Rules of Hooks)
  const hasPersistence = !!workflowConfig.persistence?.adapter;

  const persistenceHook = usePersistence({
    workflowId: workflowConfig.id,
    workflowState,
    adapter: workflowConfig.persistence?.adapter ?? NOOP_PERSISTENCE_ADAPTER,
    options: workflowConfig.persistence?.options,
    userId: workflowConfig.persistence?.userId,
    workflowCompletedRef,
  });

  // Ref to avoid re-triggering effect when persistenceHook identity changes
  const persistenceHookRef = useRef(persistenceHook);
  persistenceHookRef.current = persistenceHook;

  // Load persisted data once on mount
  const hasLoadedPersistedRef = useRef(false);

  // Async persistence load can resolve AFTER the form is already interactive.
  // These track edits the user made before the load resolved so the load does
  // not clobber in-flight input: `userEditsBeforeLoadRef` records those edits
  // per step, and `persistLoadResolvedRef` stops recording once load settles.
  const userEditsBeforeLoadRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const persistLoadResolvedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedPersistedRef.current) return;
    hasLoadedPersistedRef.current = true;

    const loadPersistedData = async () => {
      if (hasPersistence) {
        try {
          const persistedData = await persistenceHookRef.current.loadPersistedData();
          if (persistedData) {
            // Layer the snapshot OVER the compiled defaults rather than
            // replacing them. A snapshot only carries what its session recorded:
            // the steps it says nothing about are not steps with no data, they
            // are steps it has no opinion about, and the flow's own defaults are
            // the answer for them. Replacing wholesale blanked every default of
            // every step the user had not reached.
            const mergedAllData = mergeStepSlices(
              store.getState()._defaultValues,
              // A snapshot written before the store spoke one shape (or by a
              // host that saved authored arrays) is normalised on the way in,
              // so the restored slice matches what the mirror will report.
              normalizeRepeatableSlices(persistedData.allData, workflowConfig.steps)
            );

            // Keys the user already set before the load resolved WIN over the
            // loaded state — preserve in-flight user input rather than
            // overwriting it.
            const userEdits = userEditsBeforeLoadRef.current;
            for (const [stepId, edits] of userEdits) {
              const base = (mergedAllData[stepId] as Record<string, unknown> | undefined) ?? {};
              mergedAllData[stepId] = { ...base, ...edits };
            }

            // Clamp a corrupt/out-of-range persisted index into a valid step
            // range so we never restore into a non-existent step.
            const lastIndex = Math.max(0, workflowConfig.steps.length - 1);
            const rawIndex = persistedData.currentStepIndex;
            const safeIndex =
              Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex <= lastIndex
                ? rawIndex
                : Math.min(Math.max(0, Math.trunc(rawIndex) || 0), lastIndex);
            if (safeIndex !== rawIndex) {
              log.warn(
                `Persisted currentStepIndex ${rawIndex} is out of range; clamping to ${safeIndex}.`
              );
            }

            const persistedStepId = workflowConfig.steps[safeIndex]?.id;
            const mergedStepData = persistedStepId
              ? ((mergedAllData[persistedStepId] as Record<string, unknown> | undefined) ??
                persistedData.stepData)
              : persistedData.stepData;

            store.getState()._loadPersistedState({
              currentStepIndex: safeIndex,
              allData: mergedAllData,
              stepData: mergedStepData,
              visitedSteps: new Set(persistedData.visitedSteps),
              passedSteps: new Set(persistedData.passedSteps || []),
              // Only when the snapshot carries one: a snapshot written before
              // the order was persisted must fall back to reconstruction from
              // the flat keys, not restore an empty order (which resolves to no
              // rows at all and would erase the user's data).
              ...(persistedData.repeatableOrders
                ? { _repeatableOrders: persistedData.repeatableOrders }
                : {}),
            });
            persistLoadResolvedRef.current = true;
            return;
          }
        } catch (error) {
          log.error('Failed to load persisted state:', error);
        }
      }
      persistLoadResolvedRef.current = true;
      store.getState()._setInitializing(false);
    };

    loadPersistedData();
  }, [store, hasPersistence, workflowConfig.steps]);

  // Extract persistence utilities (only expose when persistence is configured)
  const persistenceInfo = useMemo(
    () => ({
      isPersisting: hasPersistence ? persistenceHook.isPersisting : false,
      persistenceError: hasPersistence ? persistenceHook.persistenceError : null,
      persistNow: hasPersistence ? persistenceHook.persistNow : undefined,
      clearPersistedData: hasPersistence ? persistenceHook.clearPersistedData : undefined,
    }),
    [
      hasPersistence,
      persistenceHook.isPersisting,
      persistenceHook.persistenceError,
      persistenceHook.persistNow,
      persistenceHook.clearPersistedData,
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

  // Get current step info. Clamp a corrupt/out-of-range live index into range
  // so downstream consumers (FormProvider, useStep, ...) never see an undefined
  // step. This is the render-time safety net complementing the persistence clamp.
  const currentStep = useMemo(() => {
    const steps = workflowConfig.steps;
    if (steps.length === 0) return undefined as unknown as StepConfig;
    const index = workflowState.currentStepIndex;
    if (index >= 0 && index < steps.length) return steps[index];
    return steps[Math.min(Math.max(0, index), steps.length - 1)];
  }, [workflowConfig.steps, workflowState.currentStepIndex]);

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

  // Shared signal: skipStep sets the id of a skipped step so analytics can
  // suppress onStepComplete for it (a skip is not a completion).
  const pendingSkipRef = useRef<string | null>(null);

  // Initialize analytics tracking
  const { analyticsStartTime } = useWorkflowAnalytics({
    workflowConfig,
    workflowState,
    workflowContext,
    pendingSkipRef,
    workflowCompletedRef,
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
    getAllData,
    getRepeatableOrders,
    pendingSkipRef,
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
    getAllData,
    getRepeatableOrders,
    analyticsStartTime,
    workflowCompletedRef,
    clearPersistedState: persistenceInfo.clearPersistedData,
  });

  // Create field value setter for form integration
  const setValue = useCallback(
    (fieldId: string, value: unknown) => {
      const stepId = currentStep?.id || '';
      // Record edits made before an async persistence load resolves so the load
      // merge can preserve them (user input must win over loaded state).
      if (hasPersistence && !persistLoadResolvedRef.current && stepId) {
        const existing = userEditsBeforeLoadRef.current.get(stepId) ?? {};
        existing[fieldId] = value;
        userEditsBeforeLoadRef.current.set(stepId, existing);
      }
      setFieldValue(fieldId, value, stepId);
    },
    [setFieldValue, currentStep?.id, hasPersistence]
  );

  // Sibling of `setValue`: the form reports field ids that ceased to exist
  // (a removed repeatable row's composite keys). Without this the step's
  // captured data is an append-only mirror of the form — a deleted row would
  // still be submitted, and would be restored on step re-entry.
  const removeValues = useCallback(
    (fieldIds: string[]) => {
      const stepId = currentStep?.id;
      if (!stepId) return;
      // A removal racing an unresolved persistence load must also drop the
      // recorded edit, or the load merge would replay the deleted row.
      if (hasPersistence && !persistLoadResolvedRef.current) {
        const existing = userEditsBeforeLoadRef.current.get(stepId);
        if (existing) {
          for (const fieldId of fieldIds) {
            delete existing[fieldId];
          }
        }
      }
      removeFieldValues(fieldIds, stepId);
    },
    [removeFieldValues, currentStep?.id, hasPersistence]
  );

  // Mirror the step's live repeatable row order so re-entry can restore it.
  const handleRepeatableOrderChange = useCallback(
    (order: Record<string, string[]>) => {
      const stepId = currentStep?.id;
      if (!stepId) return;
      store.getState()._setRepeatableOrder(stepId, order);
    },
    [store, currentStep?.id]
  );

  const repeatableOrders = useStore(store, (state) => state._repeatableOrders);
  const currentStepRepeatableOrder = useMemo(
    () => (currentStep?.id ? repeatableOrders[currentStep.id] : undefined),
    [repeatableOrders, currentStep?.id]
  );

  // Every wholesale slice write goes through here: the form's own submit hands
  // back `structureFormValues`' AUTHORED output, and a host calling
  // `setStepData` may pass authored arrays too. Both are the second door the
  // shape mismatch came through — normalise before the slice lands, keeping the
  // live row keys so the order mirror keeps describing the same rows.
  const writeStepSlice = useCallback(
    (data: Record<string, unknown>, stepId: string) => {
      setStepDataAction(
        flattenAuthoredSlice(data, formConfig?.repeatableFields, currentStepRepeatableOrder),
        stepId
      );
    },
    [setStepDataAction, formConfig?.repeatableFields, currentStepRepeatableOrder]
  );

  // Create step data setter
  const handleSetStepData = useCallback(
    (data: Record<string, unknown>) => {
      writeStepSlice(data, currentStep?.id || '');
    },
    [writeStepSlice, currentStep?.id]
  );

  // Create form submission handler
  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (currentStep?.id && values) {
        writeStepSlice(values, currentStep.id);
      }

      if (workflowContext.isLastStep) {
        await submitWorkflow();
        return;
      }

      const advanced = await goNext();
      // Terminal advance: at click time a later step was visible (isLastStep
      // false), but `goNext`'s `onAfterValidation` just hid the remaining
      // step(s), so no next visible step exists and `goNext` returned false
      // ("let the submission hook handle this"). This step is now the effective
      // last step — complete the workflow in the SAME click instead of
      // dead-ending. `canGoNext()` reads live data, so a plain failed advance
      // (e.g. onAfterValidation threw before hiding anything) still sees the next
      // step visible and does NOT complete.
      if (!advanced && !canGoNext()) {
        await submitWorkflow();
      }
    },
    [
      workflowContext.isLastStep,
      submitWorkflow,
      goNext,
      canGoNext,
      currentStep?.id,
      writeStepSlice,
    ]
  );

  // Skipping the LAST visible step completes the workflow.
  //
  // Same contract as `handleSubmit`'s terminal-advance fall-through, and it
  // belongs at the same altitude: `skipStep` is a navigation primitive in
  // `useWorkflowNavigation`, which knows nothing about submission — it reports
  // "no next visible step" by returning false and leaves the decision to the
  // owner of `submitWorkflow`, exactly as `goNext` does. Without this, a flow
  // whose final step is optional renders an ENABLED Skip button that does
  // nothing: no navigation, no completion, no way to finish the flow.
  //
  // Wrapping here (rather than in the button) also keeps `useFlow().skipStep`
  // honest for hosts driving navigation themselves — the dead-end was in the
  // contract, not in the button.
  //
  // `canSkipCurrentStep()` is the guard that makes this a fall-through and not
  // a back door: a false from `skipStep` on a step that FORBIDS skipping must
  // stay a no-op rather than completing the workflow.
  const handleSkip = useCallback(async (): Promise<boolean> => {
    const skipped = await skipStep();
    if (skipped) return true;

    if (canSkipCurrentStep() && !canGoNext()) {
      // A skip is still not a completion for analytics: `skipStep` already
      // emitted `onStepSkip`, and it never marks the step passed nor lets
      // `onStepComplete` fire (that one is bound to a step CHANGE, which a
      // terminal skip does not perform).
      await submitWorkflow();
      return true;
    }

    return false;
  }, [skipStep, canSkipCurrentStep, canGoNext, submitWorkflow]);

  // Memoize context value
  const navigationMethods = useMemo(
    () => ({
      goToStep,
      goNext,
      goPrevious,
      skipStep: handleSkip,
      canGoToStep,
      canGoNext,
      canGoPrevious,
      canSkipCurrentStep,
    }),
    [
      goToStep,
      goNext,
      goPrevious,
      handleSkip,
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
    const currentStepRepeatableIds = new Set(Object.keys(formConfig.repeatableFields ?? {}));
    const filteredData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(currentStepData)) {
      if (currentStepFieldIds.has(key) || currentStepRepeatableIds.has(key)) {
        filteredData[key] = value;
        continue;
      }
      // A repeatable's row values are captured under COMPOSITE keys
      // (`lines[k0].label`), which match neither id set. Dropping them here
      // destroys every row the user filled in as soon as they navigate away and
      // back: the step re-mounts, `min` re-materialises empty rows, and the
      // typed values are gone. Keep the rows belonging to THIS step's
      // repeatables — `initializeRepeatableState` reconstructs order and
      // next-key from exactly this flat shape.
      const parsed = parseCompositeKey(key);
      if (parsed && currentStepRepeatableIds.has(parsed.repeatableId)) {
        filteredData[key] = value;
      }
    }

    return filteredData;
  }, [
    workflowState?.allData,
    currentStep?.id,
    formConfig?.allFields,
    formConfig?.repeatableFields,
  ]);

  // Cross-step condition data: every step's captured values, flattened so a
  // field condition can reference an earlier step's field by bare name
  // (`accountType`) or by qualified path (`type.accountType`). FormProvider
  // drops every bare name the current step's form declares before consulting
  // this, so a step that reuses an id answers from its own live field only.
  const conditionValues = useMemo(
    () =>
      combineWorkflowDataForConditions(
        (workflowState?.allData ?? {}) as Record<string, unknown>,
        (workflowState?.stepData ?? {}) as Record<string, unknown>
      ),
    [workflowState?.allData, workflowState?.stepData]
  );

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
          conditionValues={conditionValues}
          onFieldChange={setValue}
          onFieldsRemove={removeValues}
          onRepeatableOrderChange={handleRepeatableOrderChange}
          defaultRepeatableOrder={currentStepRepeatableOrder}
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

export function useFlow(): WorkflowContextValue {
  const context = useContext(WorkflowReactContext);
  if (!context) {
    throw new ConfigurationError('useFlow must be used within a WorkflowProvider');
  }
  return context;
}
