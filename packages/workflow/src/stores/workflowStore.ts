import type { StepConfig } from '@rilaykit/core';
import { ConfigurationError, getOwn, hasOwn } from '@rilaykit/core';
import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  flattenAuthoredSlice,
  normalizeRepeatableSlices,
} from '../utils/normalizeRepeatableSlices';

// =================================================================
// STORE STATE & ACTIONS
// =================================================================

export interface WorkflowStoreState {
  // Navigation state
  currentStepIndex: number;
  isTransitioning: boolean;
  isInitializing: boolean;

  // Data state
  allData: Record<string, unknown>;
  stepData: Record<string, unknown>;

  // Progress tracking
  visitedSteps: Set<string>;
  passedSteps: Set<string>;

  // Submission state
  isSubmitting: boolean;

  // Internal state
  _defaultValues: Record<string, unknown>;
  _defaultStepIndex: number;
  /**
   * The id of the step `stepData` mirrors, or `null` when nobody has told the
   * store which step is current.
   *
   * `stepData` is a live view of the CURRENT step; `allData` is the source of
   * truth for every step. A write naming another step (`onAfterValidation`
   * calling `helper.setStepFields('one', ...)` from step 'two') must land in
   * `allData` alone — publishing it as `stepData` hands the current step
   * another step's values, and `stepData` is both host-visible and the override
   * layer for field conditions.
   *
   * `null` means the store cannot tell a cross-step write from a current-step
   * one, so it publishes the mirror as before rather than silently withholding
   * it. Every write through WorkflowProvider names its step.
   */
  _currentStepId: string | null;
  /**
   * Live repeatable row order per step, mirrored from each step's form.
   *
   * Deliberately NOT part of `allData`: `allData` is the payload handed to the
   * host on completion, and a bookkeeping key has no business in it. The order
   * is unreconstructable from the values (a move rewrites the order only), so
   * re-entering a step would silently revert the user's reorder without it.
   */
  _repeatableOrders: Record<string, Record<string, string[]>>;
  /**
   * Bumped every time this store's data is REPLACED wholesale underneath the
   * mounted form — a `_reset`, or a `_loadPersistedState` restore.
   *
   * The mounted form is a SEPARATE store that this one cannot write into: it
   * re-seeds itself when the form it renders is swapped, and neither a reset nor
   * a restore swaps a form (same step, same form id), so without a signal the
   * inputs would keep showing the old values while this store held new ones —
   * two stores silently diverging. WorkflowProvider folds this counter into the
   * FormProvider's key, so a replacement re-seeds the form exactly the way the
   * initial mount does.
   *
   * WHY A REPLACEMENT AND NOT "INITIALIZATION FINISHED": the key used to carry
   * `isInitializing`, which flipped when the adapter's `load()` RESOLVED —
   * whether or not it restored anything. The provider renders an interactive
   * form during that window, so a slow adapter let the user type, then remounted
   * the subtree under them: the validation error they were looking at vanished
   * and their focus was ejected to the body mid-keystroke, for a load that had
   * nothing to restore. A remount is the re-seed mechanism, so it is owed to a
   * new seed and to nothing else.
   *
   * A counter rather than a flag: consecutive replacements must each be
   * observable, and it lives in the STORE rather than in the provider because
   * every entry point (`useFlow().resetWorkflow`, `useFlowActions().reset`,
   * `useFlowActions().loadPersistedState`, the provider's own restore) must
   * propagate.
   */
  _seedGeneration: number;

  // Actions (internal - prefixed with _)
  _setCurrentStep: (stepIndex: number, stepId?: string) => void;
  _setStepData: (data: Record<string, unknown>, stepId: string) => void;
  _setAllData: (data: Record<string, unknown>) => void;
  _setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  _removeFieldValues: (fieldIds: string[], stepId: string) => void;
  _setRepeatableOrder: (stepId: string, order: Record<string, string[]>) => void;
  _setSubmitting: (isSubmitting: boolean) => void;
  _setTransitioning: (isTransitioning: boolean) => void;
  _setInitializing: (isInitializing: boolean) => void;
  _markStepVisited: (stepId: string) => void;
  _markStepPassed: (stepId: string) => void;
  _reset: () => void;
  _loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Value equality for a step's repeatable order map, so a re-report of the same
 * order does not publish a fresh state object (and re-render every consumer).
 */
function isSameRepeatableOrder(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const aIds = Object.keys(a);
  const bIds = Object.keys(b);
  if (aIds.length !== bIds.length) return false;
  return aIds.every((id) => {
    const aKeys = getOwn(a, id);
    const bKeys = getOwn(b, id);
    if (!aKeys || !bKeys || aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, index) => key === bKeys[index]);
  });
}

/**
 * The authoritative captured data of one step.
 *
 * `allData` is the source of truth — it is seeded from the defaults at store
 * creation and is the payload handed to the host on completion. `stepData` is
 * only a live view of the CURRENT step, and it starts EMPTY: nothing seeds it
 * from `allData` except a navigation, and the initial step never navigates into
 * itself. A per-field write that merged into `stepData` and then published the
 * result as `allData[stepId]` therefore overwrote the initial step's whole
 * slice with a single key on the user's very first edit, destroying every
 * default they had not yet touched — in the form and in the completion payload.
 *
 * Reading the slice back out of `allData` keeps the invariant one-directional:
 * `allData[stepId]` is written, `stepData` follows it.
 */
function readStepSlice(state: WorkflowStoreState, stepId: string): Record<string, unknown> {
  const slice = getOwn(state.allData, stepId);
  return typeof slice === 'object' && slice !== null && !Array.isArray(slice)
    ? (slice as Record<string, unknown>)
    : {};
}

/**
 * The `stepData` half of a slice write: the mirror follows the CURRENT step's
 * slice and no other. A write naming a different step is recorded in `allData`
 * alone. See {@link WorkflowStoreState._currentStepId}.
 */
function mirrorIfCurrent(
  state: WorkflowStoreState,
  stepId: string,
  slice: Record<string, unknown>
): { stepData?: Record<string, unknown> } {
  if (state._currentStepId !== null && state._currentStepId !== stepId) return {};
  return { stepData: slice };
}

// =================================================================
// STORE FACTORY
// =================================================================

export type WorkflowStore = ReturnType<typeof createWorkflowStore>;

export interface CreateWorkflowStoreOptions {
  defaultValues?: Record<string, unknown>;
  defaultStepIndex?: number;
  /** The id of the step at `defaultStepIndex`. See {@link WorkflowStoreState._currentStepId}. */
  currentStepId?: string;
  /**
   * The flow's steps, for the repeatable configs the store normalises against.
   * See {@link normalizeSlice}. Omitted, the store cannot recognise an authored
   * array and stores whatever it is handed.
   */
  steps?: ReadonlyArray<StepConfig>;
  initialVisitedSteps?: Set<string>;
  initialPassedSteps?: Set<string>;
}

export function createWorkflowStore(options: CreateWorkflowStoreOptions = {}) {
  const {
    defaultValues = {},
    defaultStepIndex = 0,
    currentStepId = null,
    steps = [],
    initialVisitedSteps = new Set<string>(),
    initialPassedSteps = new Set<string>(),
  } = options;

  /**
   * THE INVARIANT, enforced where it belongs.
   *
   * A step slice inside this store is ALWAYS flat composite keys for
   * repeatables — that is what gives a removed row keys to delete. Host-authored
   * data arrives in the AUTHORED shape (`lines: [{label:'a'}]`), and it has
   * arrived through four different doors so far: the compiled defaults, the
   * provider's form-submit/`setStepData`/`StepDataHelper` writes, a persistence
   * restore, and the PUBLIC `useFlowActions()` actions. Each time the shape
   * class re-entered, it was through the door nobody had enumerated.
   *
   * So the guard is not at the doors, it is here: every write normalises on the
   * way in and no caller can be the one who forgot. The live row order is read
   * from the store's own mirror, which is strictly better than any caller could
   * do — it keeps the row KEYS stable across a re-author.
   */
  const normalizeSlice = (
    state: WorkflowStoreState,
    data: Record<string, unknown>,
    stepId: string
  ): Record<string, unknown> =>
    flattenAuthoredSlice(
      data,
      steps.find((step) => step.id === stepId)?.formConfig?.repeatableFields,
      getOwn(state._repeatableOrders, stepId)
    );

  const initialAllData = normalizeRepeatableSlices({ ...defaultValues }, steps);

  return createStore<WorkflowStoreState>()(
    subscribeWithSelector((set, get) => ({
      // Initial state
      currentStepIndex: defaultStepIndex,
      isTransitioning: false,
      isInitializing: true,
      allData: initialAllData,
      stepData: {},
      visitedSteps: new Set(initialVisitedSteps),
      passedSteps: new Set(initialPassedSteps),
      isSubmitting: false,

      // Internal state
      _defaultValues: initialAllData,
      _defaultStepIndex: defaultStepIndex,
      _currentStepId: currentStepId,
      _repeatableOrders: {},
      _seedGeneration: 0,

      // Actions
      _setCurrentStep: (stepIndex, stepId) => {
        set(
          stepId === undefined
            ? { currentStepIndex: stepIndex }
            : { currentStepIndex: stepIndex, _currentStepId: stepId }
        );
      },

      _setStepData: (data, stepId) => {
        set((state) => {
          const slice = normalizeSlice(state, data, stepId);
          return {
            ...mirrorIfCurrent(state, stepId, slice),
            allData: {
              ...state.allData,
              [stepId]: slice,
            },
          };
        });
      },

      _setAllData: (data) => {
        set({ allData: normalizeRepeatableSlices(data, steps) });
      },

      /**
       * The form reports composite key ids, so its own calls are already flat.
       * The PUBLIC `useFlowActions().setFieldValue` is the same action, and a
       * host reaching for it prefills the way it authors everything else —
       * `setFieldValue('lines', [{label:'a'}], 'items')`. Exempting this action
       * because ONE of its callers happens to speak flat is how the shape class
       * re-entered a fifth time. It normalises like every other write.
       */
      _setFieldValue: (fieldId, value, stepId) => {
        set((state) => {
          const newStepData = normalizeSlice(
            state,
            { ...readStepSlice(state, stepId), [fieldId]: value },
            stepId
          );
          return {
            ...mirrorIfCurrent(state, stepId, newStepData),
            allData: {
              ...state.allData,
              [stepId]: newStepData,
            },
          };
        });
      },

      /**
       * Delete field ids from a step's captured data.
       *
       * The mirror of `_setFieldValue`, and the reason the step slice is not
       * merge-only: a repeatable row the user removed has no value to write, it
       * has keys that must cease to exist. Deleting the reported keys (rather
       * than replacing the whole slice with the form's values) keeps every
       * non-form writer of the slice — prefill bindings, `onAfterValidation` —
       * authoritative for the keys it owns.
       */
      _removeFieldValues: (fieldIds, stepId) => {
        set((state) => {
          const newStepData = { ...readStepSlice(state, stepId) };
          let removed = false;
          for (const fieldId of fieldIds) {
            if (hasOwn(newStepData, fieldId)) {
              delete newStepData[fieldId];
              removed = true;
            }
          }
          if (!removed) return {};

          return {
            ...mirrorIfCurrent(state, stepId, newStepData),
            allData: {
              ...state.allData,
              [stepId]: newStepData,
            },
          };
        });
      },

      _setRepeatableOrder: (stepId, order) => {
        set((state) => {
          const current = getOwn(state._repeatableOrders, stepId);
          if (current && isSameRepeatableOrder(current, order)) return {};
          return {
            _repeatableOrders: { ...state._repeatableOrders, [stepId]: order },
          };
        });
      },

      _setSubmitting: (isSubmitting) => {
        set({ isSubmitting });
      },

      _setTransitioning: (isTransitioning) => {
        set({ isTransitioning });
      },

      _setInitializing: (isInitializing) => {
        set({ isInitializing });
      },

      _markStepVisited: (stepId) => {
        set((state) => ({
          visitedSteps: new Set([...state.visitedSteps, stepId]),
        }));
      },

      _markStepPassed: (stepId) => {
        set((state) => ({
          passedSteps: new Set([...state.passedSteps, stepId]),
        }));
      },

      _reset: () => {
        const state = get();
        set({
          currentStepIndex: state._defaultStepIndex,
          allData: { ...state._defaultValues },
          stepData: {},
          // The index returns to its default, so the mirror's owner does too.
          _currentStepId: currentStepId,
          _repeatableOrders: {},
          visitedSteps: new Set(),
          passedSteps: new Set(),
          isSubmitting: false,
          isTransitioning: false,
          isInitializing: false,
          // A new seed: signal it to the mounted form, a separate store.
          _seedGeneration: state._seedGeneration + 1,
        });
      },

      _loadPersistedState: (persistedState) => {
        set((state) => ({
          ...state,
          ...persistedState,
          // A snapshot is host-authored data like any other: it may have been
          // written by a build that stored authored arrays, or by a host that
          // saved its own. It comes in through the same guard.
          ...(persistedState.allData
            ? {
                allData: normalizeRepeatableSlices(persistedState.allData, steps),
              }
            : {}),
          isInitializing: false,
          // A restore REPLACES the seed the mounted form was built from, so the
          // form owes itself a re-seed. This is the only thing that earns a
          // remount here: the load merely RESOLVING earns nothing, and used to
          // cost the user their validation errors and their focus.
          _seedGeneration: state._seedGeneration + 1,
        }));
      },
    }))
  );
}

// =================================================================
// REACT CONTEXT
// =================================================================

export const WorkflowStoreContext = createContext<WorkflowStore | null>(null);

/**
 * Get the workflow store from context
 * @throws ConfigurationError if used outside of WorkflowProvider
 */
export function useFlowStore(): WorkflowStore {
  const store = useContext(WorkflowStoreContext);
  if (!store) {
    throw new ConfigurationError('useFlowStore must be used within a WorkflowProvider');
  }
  return store;
}

// =================================================================
// GRANULAR SELECTORS
// =================================================================

/**
 * Select current step index - re-renders only when step changes
 */
export function useFlowStepIndex(): number {
  const store = useFlowStore();
  return useStore(store, (state) => state.currentStepIndex);
}

/**
 * Select transitioning state
 */
export function useFlowTransitioning(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isTransitioning);
}

/**
 * Select initializing state
 */
export function useFlowInitializing(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isInitializing);
}

/**
 * Select submitting state
 */
export function useFlowSubmitting(): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.isSubmitting);
}

/**
 * Select all workflow data, keyed by step id.
 *
 * SHAPE: the store's INTERNAL representation — a repeatable's rows are flat
 * composite keys (`lines[k0].label`), not the authored `lines: [{label}]`. This
 * is the live escape hatch: it is `allData` as the store holds it, and the only
 * way to observe what a removal actually removed.
 *
 * The AUTHORED shape is what every host CALLBACK receives — the completion
 * payload, `onAfterValidation` and its helper, and all three analytics data
 * callbacks. Reach for those when you want the contract rather than the store.
 * See {@link structureStepSlice} for the full boundary list.
 */
export function useFlowData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.allData);
}

/**
 * Select the CURRENT step's data.
 *
 * SHAPE: flat composite keys, as {@link useFlowData} — the store's internal
 * representation, not the authored one.
 */
export function useStepData(): Record<string, unknown> {
  const store = useFlowStore();
  return useStore(store, (state) => state.stepData);
}

/**
 * Select data for a specific step.
 *
 * SHAPE: flat composite keys, as {@link useFlowData} — the store's internal
 * representation, not the authored one.
 */
export function useStepDataById(stepId: string): Record<string, unknown> | undefined {
  const store = useFlowStore();
  return useStore(store, (state) => state.allData[stepId] as Record<string, unknown> | undefined);
}

/**
 * Select visited steps
 */
export function useVisitedSteps(): Set<string> {
  const store = useFlowStore();
  return useStore(store, (state) => state.visitedSteps);
}

/**
 * Select passed steps
 */
export function usePassedSteps(): Set<string> {
  const store = useFlowStore();
  return useStore(store, (state) => state.passedSteps);
}

/**
 * Check if a specific step is visited
 */
export function useIsStepVisited(stepId: string): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.visitedSteps.has(stepId));
}

/**
 * Check if a specific step is passed
 */
export function useIsStepPassed(stepId: string): boolean {
  const store = useFlowStore();
  return useStore(store, (state) => state.passedSteps.has(stepId));
}

/**
 * Select navigation state for buttons - minimal re-renders
 */
export function useFlowNavigationState(): {
  currentStepIndex: number;
  isTransitioning: boolean;
  isSubmitting: boolean;
} {
  const store = useFlowStore();
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isSubmitting = useStore(store, (state) => state.isSubmitting);

  return { currentStepIndex, isTransitioning, isSubmitting };
}

/**
 * Select submit state for workflow - minimal re-renders
 */
export function useFlowSubmitState(): {
  isSubmitting: boolean;
  isTransitioning: boolean;
  isInitializing: boolean;
} {
  const store = useFlowStore();
  const isSubmitting = useStore(store, (state) => state.isSubmitting);
  const isTransitioning = useStore(store, (state) => state.isTransitioning);
  const isInitializing = useStore(store, (state) => state.isInitializing);

  return { isSubmitting, isTransitioning, isInitializing };
}

// =================================================================
// ACTION HOOKS
// =================================================================

export interface UseFlowActionsResult {
  setCurrentStep: (stepIndex: number) => void;
  setStepData: (data: Record<string, unknown>, stepId: string) => void;
  setAllData: (data: Record<string, unknown>) => void;
  setFieldValue: (fieldId: string, value: unknown, stepId: string) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setTransitioning: (isTransitioning: boolean) => void;
  setInitializing: (isInitializing: boolean) => void;
  markStepVisited: (stepId: string) => void;
  markStepPassed: (stepId: string) => void;
  reset: () => void;
  loadPersistedState: (state: Partial<WorkflowStoreState>) => void;
}

/**
 * Get stable action references for workflow. Actions don't cause re-renders.
 *
 * `setStepData` / `setAllData` / `setFieldValue` accept host-authored data in
 * EITHER shape: the store normalises a repeatable's authored array to its
 * internal flat keys on the way in, exactly as it does for the compiled
 * defaults and for every write the provider makes. No action is exempt. See
 * `createWorkflowStore`'s `normalizeSlice`.
 */
export function useFlowActions(): UseFlowActionsResult {
  const store = useFlowStore();

  return {
    setCurrentStep: (stepIndex) => store.getState()._setCurrentStep(stepIndex),
    setStepData: (data, stepId) => store.getState()._setStepData(data, stepId),
    setAllData: (data) => store.getState()._setAllData(data),
    setFieldValue: (fieldId, value, stepId) =>
      store.getState()._setFieldValue(fieldId, value, stepId),
    setSubmitting: (isSubmitting) => store.getState()._setSubmitting(isSubmitting),
    setTransitioning: (isTransitioning) => store.getState()._setTransitioning(isTransitioning),
    setInitializing: (isInitializing) => store.getState()._setInitializing(isInitializing),
    markStepVisited: (stepId) => store.getState()._markStepVisited(stepId),
    markStepPassed: (stepId) => store.getState()._markStepPassed(stepId),
    reset: () => store.getState()._reset(),
    loadPersistedState: (state) => store.getState()._loadPersistedState(state),
  };
}

/**
 * Get the raw store for advanced use cases.
 *
 * BYPASSES THE GUARD: a `setState` here goes around the actions, and the
 * normalisation lives in the actions. Planting an authored repeatable array
 * (`setState({allData:{items:{lines:[{label:'a'}]}}})`) breaks the store's
 * flat-composite-key invariant, and the row it plants is one the user cannot
 * delete. Write through {@link useFlowActions} — every action there normalises,
 * whichever shape you hand it.
 */
export function useFlowStoreApi(): WorkflowStore {
  return useFlowStore();
}
