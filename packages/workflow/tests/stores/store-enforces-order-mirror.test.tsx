import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UseFlowActionsResult, WorkflowStore, WorkflowStoreState } from '../../src';
import { FlowBody, WorkflowProvider, useFlow, useFlowActions, useFlowStoreApi } from '../../src';
import { flow } from '../../src/builders/flow';
import { structureWorkflowData } from '../../src/utils/structureWorkflowData';

/**
 * THE THIRD INVARIANT KEYED OFF STEP IDENTITY — `_repeatableOrders`.
 *
 * The store holds a repeatable's rows as flat composite keys (`lines[k0].label`)
 * and holds the USER'S ARRANGEMENT of those rows in a separate mirror keyed by
 * step id. The arrangement is unreconstructable from the values — a move
 * rewrites the order and nothing else — so the mirror is the ONLY path a user's
 * reorder has to the completion payload.
 *
 * THE INVARIANT: `_repeatableOrders[stepId][repeatableId]` names the row keys
 * the store's OWN slice for that step actually holds, for the same rows — so
 * every door that flattens a host-authored array must key the rows FROM the
 * mirror, and any door that re-keys them must hand the mirror the keys it wrote.
 *
 * WHY IT WAS OPEN. The store had TWO normalisers, not one:
 *
 *   - `normalizeSlice` (mirror-AWARE) — `_setStepData`, `_setFieldValue`
 *   - `normalizeRepeatableSlices` (mirror-BLIND) — `_setAllData`,
 *     `_loadPersistedState`, and the seeded defaults
 *
 * The blind one was written for store CREATION, where the mirror is empty by
 * construction — so "there is no order to consult" was TRUE of its first caller
 * and FALSE of the two PUBLIC actions later routed through it. That is the exact
 * shape of the four failures before it: a guard justified by a comment true of
 * the internal caller and false of the exported one.
 *
 * WHY NEITHER EXISTING ENUMERATION COULD SEE IT. `store-enforces-flat-shape`
 * drives every action with an authored array and asserts the SHAPE that comes
 * out — flat keys, one representation. `setAllData` passes: it does flatten. It
 * just flattens to the WRONG KEYS, and the shape assertion cannot tell `k0` from
 * `k1`. `setCurrentStep-mirror` classifies every data write as `null` —
 * "cannot move navigation" — which is true and is exactly why it is blind here.
 * Three invariants, three enumerations.
 */

const catalog = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'intro',
      title: 'Intro',
      formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
    })
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

const STEPS = buildFlow().steps;

/** The rows as the store first records them: `lines[k0]` = x, `lines[k1]` = y. */
const SEEDED = [{ label: 'x' }, { label: 'y' }];

/** A host re-authoring the SAME rows, in the order the host means them to be. */
const AUTHORED = [{ label: 'alpha' }, { label: 'beta' }];

/** A host re-authoring MORE rows than the mirror describes. */
const AUTHORED_GREW = [{ label: 'alpha' }, { label: 'beta' }, { label: 'gamma' }];

/** The rows of step `items` as a HOST sees them — the authored shape. */
function structuredLines(store: WorkflowStore): unknown {
  const state = store.getState();
  const structured = structureWorkflowData(state.allData, STEPS, state._repeatableOrders) as Record<
    string,
    { lines?: unknown }
  >;
  return structured.items?.lines;
}

// =================================================================
// THE ENUMERATION — EVERY PUBLIC ACTION
// =================================================================

/**
 * THE CLOSURE. Not "the doors we know about consult the mirror" — that is the
 * reasoning that let the class back in four times — but "EVERY action on the
 * public surface is classified, and each one that can re-author a repeatable's
 * rows keys them against the mirror and leaves the mirror describing what it
 * wrote".
 *
 * A new action added to `useFlowActions()` without an entry here fails the
 * enumeration assertion; an entry that re-authors rows without maintaining the
 * mirror fails the round-trip assertion. There is no way to add a mirror-blind
 * door quietly.
 */
describe('the store enforces its order-mirror invariant with NO exempt action', () => {
  /**
   * Every action `useFlowActions()` exports, and how to make it RE-AUTHOR a
   * repeatable's rows. `null` classifies an action that cannot re-key a step's
   * rows at all — navigation, flags, progress marks — so it owes the mirror
   * nothing.
   *
   * `reset` is `null` and the classification is CHECKED, not asserted: it
   * replaces the slice and the mirror in the same `set`, so it cannot leave the
   * two describing different rows. See the test below it.
   */
  const ORDER_DRIVERS: Record<
    keyof UseFlowActionsResult,
    ((actions: UseFlowActionsResult, rows: unknown[]) => void) | null
  > = {
    setCurrentStep: null,
    setStepData: (actions, rows) => actions.setStepData({ lines: rows }, 'items'),
    setAllData: (actions, rows) => actions.setAllData({ items: { lines: rows } }),
    setFieldValue: (actions, rows) => actions.setFieldValue('lines', rows, 'items'),
    setSubmitting: null,
    setTransitioning: null,
    setInitializing: null,
    markStepVisited: null,
    markStepPassed: null,
    reset: null,
    loadPersistedState: (actions, rows) =>
      actions.loadPersistedState({ allData: { items: { lines: rows } } }),
  };

  let capturedActions: UseFlowActionsResult;
  let capturedStore: WorkflowStore;

  function ActionsProbe() {
    capturedActions = useFlowActions();
    capturedStore = useFlowStoreApi();
    return null;
  }

  function renderProbe() {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <ActionsProbe />
      </WorkflowProvider>
    );
  }

  /**
   * Two rows in the slice, and a user who has since dragged the second one
   * above the first. The mirror is the only record of that drag.
   */
  function seedReorderedRows() {
    act(() => capturedActions.setStepData({ lines: SEEDED }, 'items'));
    act(() => capturedStore.getState()._setRepeatableOrder('items', { lines: ['k1', 'k0'] }));
  }

  it('classifies EVERY action the public surface exports', () => {
    renderProbe();

    expect(Object.keys(capturedActions).sort()).toEqual(Object.keys(ORDER_DRIVERS).sort());
  });

  const reAuthors = Object.entries(ORDER_DRIVERS).filter(([, driver]) => driver !== null) as Array<
    [keyof UseFlowActionsResult, (actions: UseFlowActionsResult, rows: unknown[]) => void]
  >;

  it.each(reAuthors)(
    'useFlowActions().%s round-trips an authored order through a reordered mirror',
    (_name, driver) => {
      renderProbe();
      seedReorderedRows();

      act(() => driver(capturedActions, AUTHORED));

      // The host wrote [alpha, beta]. The host must read back [alpha, beta] —
      // whatever order the user happens to have dragged the rows into. A door
      // that re-indexes the rows `k0..kn` while the mirror still names `k1, k0`
      // hands the host its own array reversed.
      expect(structuredLines(capturedStore)).toEqual(AUTHORED);
    }
  );

  it.each(reAuthors)(
    'useFlowActions().%s keys the rows FROM the mirror instead of re-indexing them',
    (_name, driver) => {
      renderProbe();
      seedReorderedRows();

      act(() => driver(capturedActions, AUTHORED));

      // The rows the host re-authored are the rows the mirror is describing —
      // same count, so they are the SAME rows with new values — and the mounted
      // form addresses them BY KEY. Re-indexing them `k0..kn` here reassigns
      // every row's values to a different key while the form goes on reporting
      // the keys it already had: the user deletes the row showing `beta` and the
      // store drops `alpha`. `useFlowData()` publishes exactly these keys, so
      // this is the contract, not the implementation.
      expect(capturedStore.getState().allData.items).toEqual({
        'lines[k1].label': 'alpha',
        'lines[k0].label': 'beta',
      });
    }
  );

  it.each(reAuthors)(
    'useFlowActions().%s leaves the mirror describing the rows it actually wrote',
    (_name, driver) => {
      renderProbe();
      seedReorderedRows();

      // THREE rows against a mirror that names TWO. The mirror cannot be
      // describing these rows, so the write re-keys them — and a mirror left
      // behind naming `k1, k0` is then applied to rows it has never seen,
      // re-sequencing the host's array against values that are not its own.
      act(() => driver(capturedActions, AUTHORED_GREW));

      expect(structuredLines(capturedStore)).toEqual(AUTHORED_GREW);
    }
  );

  it('reset replaces the slice and the mirror together, so it cannot desync them', () => {
    renderProbe();
    seedReorderedRows();

    act(() => capturedActions.reset());

    const state = capturedStore.getState();
    expect(state._repeatableOrders).toEqual({});
    expect(state.allData).toEqual(state._defaultValues);
  });
});

// =================================================================
// THE ENUMERATION — EVERY INTERNAL PATH
// =================================================================

/**
 * The public surface is not the whole surface. `_removeFieldValues` and
 * `_setRepeatableOrder` are NOT on `useFlowActions()` — the provider is their
 * only caller today — and that absence is the ONLY thing standing between them
 * and the invariant. "No exported door" is precisely the protection that failed
 * four times, so the internal actions are enumerated on the same terms: a new
 * one added to the store without an entry here fails.
 */
describe('the store enforces its order-mirror invariant on EVERY internal path', () => {
  /**
   * Every action the store itself exposes, and whether it can leave the mirror
   * describing rows the slice does not hold.
   *
   * `null` classifies an action that cannot: it writes no slice and moves no
   * rows, or (like `_reset`) replaces slice and mirror in one `set`.
   */
  const INTERNAL_DRIVERS: Record<string, ((store: WorkflowStore) => void) | null> = {
    _setCurrentStep: null,
    _setStepData: (store) => store.getState()._setStepData({ lines: AUTHORED }, 'items'),
    _setAllData: (store) => store.getState()._setAllData({ items: { lines: AUTHORED } }),
    _setFieldValue: (store) => store.getState()._setFieldValue('lines', AUTHORED, 'items'),
    _removeFieldValues: null,
    _setRepeatableOrder: null,
    _setSubmitting: null,
    _setTransitioning: null,
    _setInitializing: null,
    _markStepVisited: null,
    _markStepPassed: null,
    _reset: null,
    _loadPersistedState: (store) =>
      store.getState()._loadPersistedState({ allData: { items: { lines: AUTHORED } } }),
  };

  let capturedStore: WorkflowStore;

  function StoreProbe() {
    capturedStore = useFlowStoreApi();
    return null;
  }

  function renderProbe() {
    render(
      <WorkflowProvider workflowConfig={buildFlow()}>
        <StoreProbe />
      </WorkflowProvider>
    );
  }

  it('classifies EVERY action the store exposes', () => {
    renderProbe();

    const state = capturedStore.getState();
    const actionKeys = Object.keys(state)
      .filter((key) => typeof state[key as keyof WorkflowStoreState] === 'function')
      .sort();

    expect(actionKeys).toEqual(Object.keys(INTERNAL_DRIVERS).sort());
  });

  const reAuthors = Object.entries(INTERNAL_DRIVERS).filter(
    ([, driver]) => driver !== null
  ) as Array<[string, (store: WorkflowStore) => void]>;

  it.each(reAuthors)(
    '%s round-trips an authored order through a reordered mirror',
    (_n, driver) => {
      renderProbe();
      act(() => capturedStore.getState()._setStepData({ lines: SEEDED }, 'items'));
      act(() => capturedStore.getState()._setRepeatableOrder('items', { lines: ['k1', 'k0'] }));

      act(() => driver(capturedStore));

      expect(structuredLines(capturedStore)).toEqual(AUTHORED);
    }
  );

  it('_removeFieldValues only deletes keys, so it cannot re-key a row', () => {
    renderProbe();
    act(() => capturedStore.getState()._setStepData({ lines: SEEDED }, 'items'));
    act(() => capturedStore.getState()._setRepeatableOrder('items', { lines: ['k1', 'k0'] }));

    act(() => capturedStore.getState()._removeFieldValues(['lines[k0].label'], 'items'));

    // The mirror may still name `k0` — a row with no values is a row the user
    // has not typed into, not a row that is gone — and the read boundary is what
    // resolves that: a captured key with nothing to resolve to is dropped.
    expect(structuredLines(capturedStore)).toEqual([{ label: 'y' }]);
  });
});

// =================================================================
// THE MIRROR IS LOAD-BEARING — BOTH CONSUMERS, END TO END
// =================================================================

/**
 * `_repeatableOrders` has exactly two consumers, and BOTH survived mutation
 * before these tests existed — the order mirror was load-bearing for the user's
 * data and closed by prose alone:
 *
 *   - `flattenAuthoredSlice`'s `liveOrder` (the WRITE side) — keys a host's rows
 *     from the mirror so a re-author does not re-index rows out from under it.
 *     Pinned by the `%s round-trips an authored order` enumerations above and by
 *     `a host re-author survives a user reorder` below.
 *   - `structureStepSlice`'s `mirroredOrder` (the READ side) — sequences the
 *     rows the host receives. Pinned by `a user reorder reaches the completion
 *     payload` below.
 *
 * These two drive the REAL user path — a form, a drag, a submit — because the
 * store-level enumerations seed the mirror through `_setRepeatableOrder`
 * directly, and a mirror only a test ever writes to proves nothing about the
 * mirror the product writes to.
 */

function LinesProbe() {
  const { items, move } = useRepeatableField('lines');
  return (
    <div>
      <output data-testid="lines-order">{items.map((item) => item.key).join(',')}</output>
      <button type="button" data-testid="move-0-1" onClick={() => move(0, 1)}>
        move
      </button>
    </div>
  );
}

function LiveHarness() {
  const { submitWorkflow } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <LinesProbe />
      <button
        type="button"
        data-testid="host-rewrite"
        onClick={() => actions.setStepData({ lines: AUTHORED }, 'items')}
      >
        rewrite
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <FlowBody />
    </div>
  );
}

function buildSingleStepFlow() {
  return flow
    .create(catalog, 'wf-live', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

const LIVE_DEFAULTS = { items: { lines: [{ label: 'alpha' }, { label: 'beta' }] } };

async function renderLiveAndReorder(onWorkflowComplete?: (data: Record<string, unknown>) => void) {
  render(
    <WorkflowProvider
      workflowConfig={buildSingleStepFlow()}
      defaultValues={LIVE_DEFAULTS}
      onWorkflowComplete={onWorkflowComplete}
    >
      <LiveHarness />
    </WorkflowProvider>
  );

  await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1'));
  fireEvent.click(screen.getByTestId('move-0-1'));
  await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));
}

describe('the order mirror carries the user reorder to the host', () => {
  it('a user reorder reaches the completion payload', async () => {
    // THE READ CONSUMER. The user dragged beta above alpha. Nothing in the
    // VALUES records that — the slice still reads `lines[k0].label = alpha`,
    // `lines[k1].label = beta`, in that key order — so if the completion payload
    // is built from the values alone the user's arrangement is silently dropped
    // and the backend receives the rows the user explicitly rejected.
    const onWorkflowComplete = vi.fn();
    await renderLiveAndReorder(onWorkflowComplete);

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(onWorkflowComplete.mock.calls[0][0].items.lines).toEqual([
      { label: 'beta' },
      { label: 'alpha' },
    ]);
  });

  it('a host re-author survives a user reorder', async () => {
    // THE WRITE CONSUMER. The rows the host re-authors are the rows the mirror
    // is describing, so they must keep their keys: re-indexing them `k0..kn`
    // leaves the mirror sequencing `alpha` and `beta` by the arrangement of the
    // rows they replaced, and the host reads back its own array reversed.
    const onWorkflowComplete = vi.fn();
    await renderLiveAndReorder(onWorkflowComplete);

    fireEvent.click(screen.getByTestId('host-rewrite'));
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(onWorkflowComplete.mock.calls[0][0].items.lines).toEqual(AUTHORED);
  });
});
