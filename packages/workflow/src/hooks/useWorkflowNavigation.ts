import {
  type ConditionBuilder,
  type ConditionConfig,
  type StepDataHelper,
  type WorkflowConfig,
  type WorkflowContext,
  evaluateCondition,
  getLogger,
} from '@rilaykit/core';
import { type MutableRefObject, useCallback, useRef } from 'react';
import { combineWorkflowDataForConditions } from '../utils/dataFlattening';
import { structureStepSlice, structureWorkflowData } from '../utils/structureWorkflowData';

const log = getLogger('workflow:navigation');
import type { UseWorkflowConditionsReturn } from './useWorkflowConditions';
import type { WorkflowState } from './workflow-state';

export interface UseWorkflowNavigationProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  workflowContext: WorkflowContext;
  conditionsHelpers: UseWorkflowConditionsReturn;
  setCurrentStep: (stepIndex: number) => void;
  setTransitioning: (isTransitioning: boolean) => void;
  markStepVisited: (stepIndex: number, stepId: string) => void;
  markStepPassed: (stepId: string) => void;
  markStepSkipped: (stepId: string) => void;
  setStepData: (data: Record<string, any>, stepId: string) => void;
  /**
   * Live accessor for the latest `allData`. The `workflowState` prop is a
   * render-time snapshot: within a single navigation (onAfterValidation
   * writing prefill data, then the step transition) it goes stale and the
   * transition would wipe the freshly written data.
   */
  getAllData: () => Record<string, unknown>;
  /**
   * Live accessor for the mirrored repeatable row order, per step. Needed to
   * hand `onAfterValidation` its rows in the order the user actually arranged
   * them: the flat values can only ever recover their insertion order.
   */
  getRepeatableOrders?: () => Record<string, Record<string, string[]>>;
  /**
   * Shared signal read by {@link useWorkflowAnalytics} to suppress
   * `onStepComplete` for a skipped step. A skip is not a completion.
   */
  pendingSkipRef: MutableRefObject<string | null>;
  onStepChange?: (fromStep: number, toStep: number, context: WorkflowContext) => void;
  /**
   * Routes an error through {@link useWorkflowAnalytics.trackError} so it reaches
   * BOTH `analytics.onError` and the monitoring adapter. The guard for the
   * optional analytics/monitor lives inside `trackError`, so navigation just
   * calls it — no local `if (analytics?.onError)`.
   */
  trackError: (error: Error) => void;
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
  markStepSkipped,
  setStepData,
  getAllData,
  getRepeatableOrders,
  pendingSkipRef,
  onStepChange,
  trackError,
}: UseWorkflowNavigationProps): UseWorkflowNavigationReturn {
  // Use ref to avoid recreating callbacks when onStepChange changes
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  // Re-entrancy guard for skipStep: two synchronous skipStep() calls for the
  // same step must emit onStepSkip once. `isTransitioning` toggles across an
  // await, so a second synchronous call is not gated by it; this ref tracks the
  // step id whose skip is already in flight.
  const skipInFlightRef = useRef<string | null>(null);

  // Get current step
  const currentStep = workflowConfig.steps[workflowState.currentStepIndex];

  // Read one step's slice as the host contract sees it: the store keeps every
  // slice FLAT (one internal shape, so a removed repeatable row has keys to
  // delete), and every read that leaves for host code is structured back to the
  // AUTHORED shape here. Read LIVE — these run inside a single navigation tick,
  // before any React commit refreshes a snapshot.
  const readStructuredSlice = useCallback(
    (stepId: string): Record<string, unknown> => {
      const step = workflowConfig.steps.find((candidate) => candidate.id === stepId);
      return structureStepSlice(
        (getAllData()[stepId] ?? {}) as Record<string, unknown>,
        step?.formConfig?.repeatableFields,
        getRepeatableOrders?.()[stepId]
      );
    },
    [workflowConfig.steps, getAllData, getRepeatableOrders]
  );

  // Create step data helper for validation callbacks
  const createStepDataHelper = useCallback((): StepDataHelper => {
    return {
      setStepData: (stepId: string, data: Record<string, any>) => {
        setStepData(data, stepId);
      },

      setStepFields: (stepId: string, fields: Record<string, any>) => {
        // The merge base is read RAW on purpose: it never reaches host code, it
        // goes straight back through `setStepData`, which is the write boundary
        // and flattens. Structuring it here and letting the boundary flatten it
        // again would re-key rows the order mirror still names.
        const existingData = getAllData()[stepId] || {};
        const mergedData = { ...existingData, ...fields };
        setStepData(mergedData, stepId);
      },

      getStepData: (stepId: string) => {
        return readStructuredSlice(stepId);
      },

      setNextStepField: (fieldId: string, value: any) => {
        // The NEXT VISIBLE step — not the next declared one. A conditionally
        // hidden step between here and the destination must not swallow the
        // prefill (the user never sees it).
        const nextStepIndex = findNextVisibleStepRef.current(workflowState.currentStepIndex);
        if (nextStepIndex !== null) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          const existingData = getAllData()[nextStepId] || {};
          const mergedData = { ...existingData, [fieldId]: value };
          setStepData(mergedData, nextStepId);
        }
      },

      setNextStepFields: (fields: Record<string, any>) => {
        const nextStepIndex = findNextVisibleStepRef.current(workflowState.currentStepIndex);
        if (nextStepIndex !== null) {
          const nextStepId = workflowConfig.steps[nextStepIndex].id;
          // Only get existing data for the next step, don't propagate current step data
          const existingData = getAllData()[nextStepId] || {};

          // Only merge the specified fields, not all current step data
          const mergedData = { ...existingData, ...fields };
          setStepData(mergedData, nextStepId);
        }
      },

      getAllData: () => {
        return {
          ...structureWorkflowData(getAllData(), workflowConfig.steps, getRepeatableOrders?.()),
        };
      },

      getSteps: () => {
        return [...workflowConfig.steps];
      },
    };
  }, [
    getAllData,
    getRepeatableOrders,
    readStructuredSlice,
    workflowState.currentStepIndex,
    workflowConfig.steps,
    setStepData,
  ]);

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

        // The MIRROR re-seed is the store's, not this caller's: `setCurrentStep`
        // re-seeds `stepData` from the target's slice as part of the move, so
        // the PUBLIC `useFlowActions().setCurrentStep` — the same move, one door
        // over — cannot leak the previous step's fields the way it did while
        // this function was the only thing re-seeding.
        setCurrentStep(stepIndex);
        markStepVisited(stepIndex, newStepId);

        // Still owed by navigation, and NOT the same thing: this MATERIALISES
        // the target's slice in `allData`, so a step the user has visited
        // appears in the completion payload even when they typed nothing into
        // it. Read through getAllData(): onAfterValidation may have just written
        // prefill data that the render-time snapshot does not contain yet.
        const existingStepData = (getAllData()[newStepId] || {}) as Record<string, any>;
        setStepData(existingStepData, newStepId);

        return true;
      } catch (error) {
        log.error('Step transition failed:', error);
        trackError(error as Error);
        return false;
      } finally {
        setTransitioning(false);
      }
    },
    [
      workflowConfig.steps,
      trackError,
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

  // A render-updated mirror so `createStepDataHelper` (defined ABOVE this, to
  // keep the helper next to the other data helpers) can resolve the next VISIBLE
  // step without taking `findNextVisibleStep` — declared later — as a dependency,
  // which would be a temporal-dead-zone reference in that earlier callback's dep
  // array. The helper reads `.current` only at call time, long after this runs.
  const findNextVisibleStepRef = useRef(findNextVisibleStep);
  findNextVisibleStepRef.current = findNextVisibleStep;

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
        // Read the LIVE current-step slice rather than the render-time
        // `workflowState.stepData` snapshot. handleSubmit writes the step's
        // values via setStepData(values) then calls goNext() in the same tick
        // (no React commit between), so the snapshot is pre-submit: it holds
        // only incrementally-changed fields and is missing untouched defaults.
        //
        // The slice is stored flat (one internal shape, so a removed repeatable
        // row has keys to delete); this callback is a HOST boundary, so it is
        // structured on the way out — through the SAME reader the helper's
        // `getStepData` uses, so one invocation can only ever speak one shape.
        const liveStepData = readStructuredSlice(currentStep.id);
        await currentStep.onAfterValidation(liveStepData, helper, workflowContext);
      } catch (error) {
        log.error('onAfterValidation failed:', error);
        trackError(error as Error);
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
    readStructuredSlice,
    workflowContext,
    trackError,
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

    // Gate re-entrant synchronous skips of the SAME step: the first call owns
    // the skip; a second call in the same tick is a no-op until the step id
    // actually changes (a real transition), which re-enables a legitimate skip.
    if (skipInFlightRef.current === currentStep.id) {
      return false;
    }
    skipInFlightRef.current = currentStep.id;

    if (workflowConfig.analytics?.onStepSkip) {
      workflowConfig.analytics.onStepSkip(currentStep.id, 'user_skip', workflowContext);
    }

    // The skip is now committed — past the skippability guard and the
    // re-entrancy latch, and the analytics signal has fired. Record it in the
    // persistent skipped set so the completion payload drops this step's
    // (unanswered) slice and `meta.skippedSteps` carries its id. Marked HERE,
    // not only on the forward transition, so a TERMINAL skip (which completes
    // via the submission hook without navigating) is dropped too. Navigating
    // back onto this step and passing it clears the mark (`_markStepPassed`),
    // so a skip-then-return-and-fill ships the step's answers.
    markStepSkipped(currentStep.id);

    // A skip is NOT a completion: it explicitly bypasses validation, so it must
    // not run onAfterValidation, must not mark the step passed, and must not
    // emit onStepComplete. Signal the analytics hook to suppress completion for
    // this step, then transition to the next visible step directly.
    const nextStepIndex = findNextVisibleStep(workflowState.currentStepIndex);
    if (nextStepIndex === null) {
      skipInFlightRef.current = null;
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
    // Release the latch once the transition has settled, either way. It exists
    // to gate a second SYNCHRONOUS call, which arrives before this await
    // resolves — so clearing it here preserves that guarantee. Holding it past
    // the transition made the step un-skippable for the rest of the mount:
    // navigate BACK onto a step you had skipped and the Skip button — still
    // rendered enabled, since `canSkipCurrentStep` knows nothing about this
    // latch — accepted the click and silently did nothing.
    skipInFlightRef.current = null;
    return didTransition;
  }, [
    canSkipCurrentStep,
    currentStep,
    workflowConfig.analytics,
    workflowContext,
    workflowState.currentStepIndex,
    findNextVisibleStep,
    goToStep,
    markStepSkipped,
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
