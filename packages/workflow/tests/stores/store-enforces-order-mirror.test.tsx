import { ril } from '@rilaykit/core';
import { form, parseCompositeKey, useRepeatableField } from '@rilaykit/forms';
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
    // `_defaultValues` holds the defaults AS AUTHORED — it is not the seed, it
    // is what the seed is derived FROM, against the steps live at the moment of
    // the reset (see `store-enforces-step-identity`). This flow is built with no
    // defaults at all, so the seed it derives is empty and the mirror describing
    // it has nothing left to claim.
    expect(state._defaultValues).toEqual({});
    expect(state.allData).toEqual({});
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
    // It re-derives the slice and the mirror in ONE `set`, out of the one
    // normaliser (`normalizeRepeatableSlices`) that hands back the mirror it
    // leaves behind — `_reset`'s justification exactly. It also cannot re-author
    // anything in THIS flow: it only re-shapes a slice whose step has just
    // become live, and this flow's steps never move. The step set moving is what
    // `store-enforces-step-identity` drives it under, where it is a full slice
    // addresser under all three mutations.
    _reconcileStepSet: null,
    _setStepData: (store) => store.getState()._setStepData({ lines: AUTHORED }, 'items'),
    _setAllData: (store) => store.getState()._setAllData({ items: { lines: AUTHORED } }),
    _setFieldValue: (store) => store.getState()._setFieldValue('lines', AUTHORED, 'items'),
    _removeFieldValues: null,
    // It re-authors no rows — it writes no slice and re-keys nothing — so it
    // owes THIS table nothing. It is not otherwise harmless, and the `null` used
    // to be read as saying so: this action IS the mirror, and it is the one door
    // that writes it without a normaliser. Its own invariant, and the door's own
    // enumeration, are below — see `the mirror admits no claim a step's own
    // slice does not bear out`.
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

// =================================================================
// THE MIRROR'S OWN WRITE DOOR — `_setRepeatableOrder`
// =================================================================

/**
 * THE NINTH MEMBER OF THE CLASS, and the first found at the door that IS the
 * mirror rather than at a door that disturbs it.
 *
 * Every enumeration above drives an action that re-authors ROWS and asks whether
 * it left the mirror describing them. `_setRepeatableOrder` re-authors no rows,
 * so it answered `null` to all of them and was never driven — and "no driver" was
 * read as "cannot desync". It writes `_repeatableOrders[stepId] = order`
 * verbatim: it was the only door with no normaliser between it and the mirror,
 * because it had no slice to normalise.
 *
 * WHAT THE PAIR ACTUALLY IS. `WorkflowProvider.handleRepeatableOrderChange`
 * builds `(stepId, order)` from two different places: `order` is whatever the
 * mounted form reported, `stepId` is `currentStep?.id` read at CALL TIME. Those
 * are about the same step only because the form is normally reset in the same
 * commit that moves `currentStep`. That is an incidental synchronisation of two
 * independent things, which is this class's signature — and the diagnosis this
 * test was written to confirm (`the report is misattributed on a recompile that
 * moves the step set under the index`) is NOT what breaks it. On a recompile the
 * form DOES reset, and reports the incoming step's own fresh order, correctly
 * attributed. The empty entry that recompile leaves behind is real but is the
 * incoming step's own — an empty CLAIM where the mirror means to have no opinion,
 * not a misattribution.
 *
 * THE SYNCHRONISATION BREAKS WITHOUT ANY RECOMPILE AT ALL. `FormProvider` resets
 * on the form's STRUCTURAL identity — `[formConfig.id, field shapes, repeatable
 * shapes]` — deliberately, so a config rebuilt on every parent render does not
 * wipe the user's input. Two steps carrying the same form id and the same shape
 * are therefore ONE form to it, and it does not reset between them. Nothing
 * forbids that flow: `flow.build()` and `validateFlowSchema` check STEP ids for
 * uniqueness and say nothing about form ids. So `goNext()` — the plainest
 * exported door there is — leaves the outgoing step's form mounted, the user
 * drags a row, and the report lands under the INCOMING step's id, naming rows
 * only the outgoing step's slice holds.
 *
 * THE FIX IS THE CLASS'S OWN LESSON. The provider cannot be made to name the
 * right step here — the form that produced the report IS the previous step's
 * form, and it knows no step ids to carry one. So the pair is not trusted: the
 * store asks the STEP'S OWN SLICE whether it holds the rows the claim is about,
 * and admits only what the data bears out. Which step the caller named stops
 * mattering. See {@link admissibleStepOrder}.
 */

/**
 * THE INVARIANT ITSELF, over the WHOLE mirror, derived from the store — never a
 * hand-written list of the entries a test happens to expect.
 *
 * Every claim in `_repeatableOrders` must be about rows the step it is filed
 * under actually holds. Read off the store's real state by parsing the flat
 * composite keys of each slice, so an entry filed under a step this test never
 * thought to name fails just the same.
 *
 * Returns the offending claims, so a failure says WHICH step is claiming rows it
 * does not have rather than just `false !== true`.
 */
function claimsNoStepBearsOut(store: WorkflowStore): Record<string, string[]> {
  const { allData, _repeatableOrders: orders } = store.getState();
  const unborne: Record<string, string[]> = {};

  for (const [stepId, order] of Object.entries(orders)) {
    const slice = allData[stepId];
    const held = new Set<string>();
    if (slice && typeof slice === 'object' && !Array.isArray(slice)) {
      for (const key of Object.keys(slice as Record<string, unknown>)) {
        const parsed = parseCompositeKey(key);
        if (parsed) held.add(`${parsed.repeatableId}:${parsed.itemKey}`);
      }
    }

    for (const [repeatableId, rowKeys] of Object.entries(order)) {
      const unheld = rowKeys.filter((rowKey) => !held.has(`${repeatableId}:${rowKey}`));
      // Not `unheld.length > 0`: a row the user appended and has not typed into
      // holds no composite key yet, and the mirror is entitled to arrange it.
      // A claim NO row of which the slice holds is a claim about someone else's
      // rows.
      if (unheld.length === rowKeys.length) unborne[`${stepId}.${repeatableId}`] = rowKeys;
    }
  }

  return unborne;
}

/** Two steps whose forms share an id AND a shape — one form to `FormProvider`. */
function buildTwinFormFlow() {
  const twinForm = () =>
    form
      .create(catalog, 'lines-form')
      .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} }));

  return flow
    .create(catalog, 'wf-twin', 'Twin')
    .addStep({ id: 'alpha', title: 'Alpha', formConfig: twinForm() })
    .addStep({ id: 'xray', title: 'Xray', formConfig: twinForm() })
    .build();
}

describe('the mirror admits no claim a step’s own slice does not bear out', () => {
  let capturedStore: WorkflowStore;
  let capturedActions: UseFlowActionsResult;

  function TwinHarness() {
    capturedStore = useFlowStoreApi();
    capturedActions = useFlowActions();
    return <LinesProbe />;
  }

  async function renderTwinAndReorderAlpha() {
    render(
      <WorkflowProvider
        workflowConfig={buildTwinFormFlow()}
        defaultValues={{ alpha: { lines: [{ label: 'alpha' }, { label: 'beta' }] } }}
      >
        <TwinHarness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1'));
  }

  it('a drag on the NEXT step does not file the previous step’s rows under it', async () => {
    await renderTwinAndReorderAlpha();

    // The user is on `alpha` and drags. This is `alpha`'s form, holding `alpha`'s
    // rows: the arrangement is `alpha`'s and the mirror says so.
    fireEvent.click(screen.getByTestId('move-0-1'));
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));
    expect(capturedStore.getState()._repeatableOrders).toEqual({ alpha: { lines: ['k1', 'k0'] } });

    // The plainest navigation there is. `xray` is a different step with a
    // different (empty) slice — but the same form id and shape, so the mounted
    // form is not reset and goes on holding `alpha`'s rows.
    act(() => capturedActions.setCurrentStep(1));

    // The user drags again. `currentStep?.id` now reads `xray`, so the report is
    // filed under `xray` — an arrangement of `k0`/`k1`, which are rows of
    // `alpha`'s slice. `xray`'s slice holds no rows at all.
    fireEvent.click(screen.getByTestId('move-0-1'));

    // EXACTLY `alpha`'s entry, unchanged, and nothing under `xray`. Not "xray's
    // entry is empty" — an absent entry is the mirror declining to have an
    // opinion, which the read boundary answers by reconstructing insertion order
    // from the flat keys. An empty one says the same thing while riding into
    // every persistence snapshot.
    expect(capturedStore.getState()._repeatableOrders).toEqual({ alpha: { lines: ['k1', 'k0'] } });
  });

  it('leaves NO claim anywhere in the mirror that its own step cannot bear out', async () => {
    await renderTwinAndReorderAlpha();

    fireEvent.click(screen.getByTestId('move-0-1'));
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));
    act(() => capturedActions.setCurrentStep(1));
    fireEvent.click(screen.getByTestId('move-0-1'));

    // THE GENERAL PROPERTY, not the `xray` symptom: whatever the mirror holds
    // when the dust settles, every claim in it is about rows its own step's
    // slice actually has. This is the assertion that must survive mutation —
    // the one above names the step this bug happened to reach.
    expect(claimsNoStepBearsOut(capturedStore)).toEqual({});
  });

  it('still records the arrangement of rows the user has not typed into', async () => {
    // THE OTHER HALF OF THE RULE, and the reason it is not key EQUALITY. A row
    // the user appended but left empty contributes no composite key, so the
    // slice legitimately holds FEWER rows than the form is arranging. Demanding
    // an exact match would throw away the arrangement of every half-filled
    // repeatable — a real user's drag, silently dropped, which is precisely the
    // failure the mirror exists to prevent.
    render(
      <WorkflowProvider workflowConfig={buildSingleStepFlow()} defaultValues={LIVE_DEFAULTS}>
        <TwinHarness />
      </WorkflowProvider>
    );
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1'));

    // A third row, never typed into: `lines[k2].label` is nowhere in the slice.
    act(() => capturedStore.getState()._setRepeatableOrder('items', { lines: ['k2', 'k1', 'k0'] }));

    expect(capturedStore.getState()._repeatableOrders).toEqual({
      items: { lines: ['k2', 'k1', 'k0'] },
    });
  });
});
