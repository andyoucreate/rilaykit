/**
 * PROOF — the repeatable SHAPE class, closed by exhaustion rather than by
 * guarding whichever boundary a hunter happened to walk past.
 *
 * THE INVARIANT
 * -------------
 * Inside the workflow store, a step slice is ALWAYS flat composite keys for
 * repeatables (`lines[k0].label`). Structuring to the authored shape
 * (`lines: [{label:'a'}]`) happens at EVERY host-facing boundary, and
 * flattening happens at EVERY host-authored write. No third representation, no
 * exceptions.
 *
 * WHY IT EXISTS: `_removeFieldValues` deletes flat keys. A row that also exists
 * inside a raw authored array is therefore unreachable — it survives the user's
 * delete, is submitted to the backend, and is resurrected on step re-entry.
 * Two shapes coexisting in one slice IS the bug; it has re-entered twice, each
 * time through a boundary nobody had enumerated.
 *
 * WHY THIS SUITE IS SHAPED LIKE THIS: guarding boundaries one at a time is what
 * failed, twice. So this drives ONE flow through EVERY door — every write
 * (authored defaults, form submit, both StepDataHelper mutators, a user edit, a
 * user deletion, a persistence restore) and every read (completion payload,
 * onAfterValidation's data param, the helper's readers, all three analytics
 * callbacks, the public hooks, the persistence snapshot) — with a repeatable
 * carrying authored default rows and a row the user deletes. It asserts the
 * store holds exactly ONE shape at EVERY commit, and that every host-facing
 * read is the authored shape. A new door added without a boundary fails here.
 */
import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import {
  FlowBody,
  WorkflowProvider,
  flow,
  useFlow,
  useFlowActions,
  useFlowData,
  useStepData,
  useStepDataById,
} from '@rilaykit/workflow';
import type { PersistedWorkflowData, WorkflowPersistenceAdapter } from '@rilaykit/workflow';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProofTextInput } from '../_setup/proof-fixtures';

const catalog = ril.create().component('text', { renderer: ProofTextInput });

/** Every repeatable id in the flow. A bare one in a slice IS the pathology. */
const REPEATABLE_IDS = ['lines', 'tags', 'refs'] as const;

// =================================================================
// THE INVARIANT PROBE
// =================================================================

/**
 * Every `allData` the store ever published, sampled at each commit. The
 * invariant is about what the store HOLDS, not about what it happens to hand
 * out at the end — a slice that is briefly two-shaped is already lost data.
 */
let storeSnapshots: Array<Record<string, unknown>> = [];

function InvariantProbe() {
  const allData = useFlowData();
  storeSnapshots.push(structuredClone(allData));
  return null;
}

/**
 * Fails if any step slice carries a repeatable's rows as an authored array —
 * the second representation.
 */
function expectStoreIsFlatOnly(snapshots: Array<Record<string, unknown>>): void {
  for (const snapshot of snapshots) {
    for (const [stepId, slice] of Object.entries(snapshot)) {
      if (typeof slice !== 'object' || slice === null || Array.isArray(slice)) continue;
      for (const id of REPEATABLE_IDS) {
        expect(
          Object.keys(slice as Record<string, unknown>),
          `step "${stepId}" holds the authored array shape under "${id}" — the store must speak flat composite keys ONLY`
        ).not.toContain(id);
      }
    }
  }
}

// =================================================================
// THE FLOW
// =================================================================

/** What every HOST-facing read observed, per boundary name. */
let hostReads: Record<string, unknown>;
const analytics = {
  onStepComplete: vi.fn(),
  onWorkflowComplete: vi.fn(),
  onWorkflowAbandon: vi.fn(),
};

function buildFlow() {
  return (
    flow
      .create(catalog, 'shape-proof', 'Shape proof')
      .addStep({
        id: 'items',
        title: 'Items',
        formConfig: form
          .create(catalog, 'items-form')
          .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
        // READ: the data param + the helper's readers + the CONTEXT param, in
        // ONE invocation. One invocation must speak ONE shape: a host reading
        // `context.allData[stepId].lines` next to a `data.lines` that is an
        // array has been handed two representations of the same values.
        onAfterValidation: (data, helper, context) => {
          hostReads.afterValidationParam = structuredClone(data);
          hostReads.helperGetStepData = structuredClone(helper.getStepData('items'));
          hostReads.helperGetAllData = structuredClone(helper.getAllData().items);
          hostReads.afterValidationContextAllData = structuredClone(context.allData.items);
          helper.setNextStepFields({ tags: [{ name: 'x' }, { name: 'y' }] });
        },
      })
      .addStep({
        id: 'extra',
        title: 'Extra',
        formConfig: form
          .create(catalog, 'extra-form')
          .addRepeatable('tags', (rb) => rb.add({ id: 'name', type: 'text', props: {} })),
        // WRITE: a cross-step setStepData naming a LATER step.
        onAfterValidation: (_data, helper) => {
          helper.setStepData('review', { note: 'from-helper' });
        },
      })
      .addStep({
        id: 'review',
        title: 'Review',
        formConfig: form
          .create(catalog, 'review-form')
          .add({ id: 'note', type: 'text', props: {} }),
      })
      // WRITE: the PUBLIC `useFlowActions().setFieldValue` — the fifth door, and
      // the last action the store left exempt from its own invariant. This step's
      // repeatable is prefilled through NOTHING ELSE: if the action stops
      // flattening, the rows here become unreachable to the user and this step is
      // where the ghost row survives the delete.
      .addStep({
        id: 'wrap',
        title: 'Wrap',
        formConfig: form
          .create(catalog, 'wrap-form')
          .addRepeatable('refs', (rb) => rb.add({ id: 'url', type: 'text', props: {} })),
      })
      .configure({ analytics })
      .build()
  );
}

/** The authored defaults — the FIRST write door, and two rows the user owns. */
const DEFAULT_VALUES = {
  items: { lines: [{ label: 'alpha' }, { label: 'beta' }] },
};

function RepeatableProbe({ id }: { id: string }) {
  const { items, remove } = useRepeatableField(id);
  return (
    <div>
      <output data-testid={`${id}-order`}>{items.map((item) => item.key).join(',')}</output>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-testid={`remove-${id}-${item.key}`}
          onClick={() => remove(item.key)}
        >
          {`remove ${item.key}`}
        </button>
      ))}
    </div>
  );
}

/** The public read surfaces, rendered so their EXACT shape is assertable. */
function PublicHooksProbe() {
  const { currentStep, workflowState } = useFlow();
  const stepData = useStepData();
  const itemsSlice = useStepDataById('items');
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <output data-testid="hook-allData">{JSON.stringify(workflowState.allData)}</output>
      <output data-testid="hook-useStepData">{JSON.stringify(stepData)}</output>
      <output data-testid="hook-useStepDataById">{JSON.stringify(itemsSlice)}</output>
    </div>
  );
}

function Harness() {
  const { currentStep, submitWorkflow, persistNow } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <PublicHooksProbe />
      <InvariantProbe />
      {currentStep?.id === 'items' ? <RepeatableProbe id="lines" /> : null}
      {currentStep?.id === 'extra' ? <RepeatableProbe id="tags" /> : null}
      {currentStep?.id === 'wrap' ? <RepeatableProbe id="refs" /> : null}
      {/* A host prefilling a repeatable the natural way, through the public
          action, on a step the user has not reached yet. */}
      <button
        type="button"
        data-testid="action-prefill-refs"
        onClick={() =>
          actions.setFieldValue('refs', [{ url: 'ghost-a' }, { url: 'ghost-b' }], 'wrap')
        }
      >
        prefill refs
      </button>
      <button type="submit" data-testid="form-next">
        next
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <button type="button" data-testid="persist" onClick={() => persistNow?.()}>
        persist
      </button>
      <FlowBody />
    </div>
  );
}

function makeAdapter(): {
  adapter: WorkflowPersistenceAdapter;
  saved: () => PersistedWorkflowData | null;
} {
  let stored: PersistedWorkflowData | null = null;
  return {
    adapter: {
      save: async (_key, data) => {
        stored = structuredClone(data);
      },
      load: async () => stored,
      remove: async () => {
        stored = null;
      },
      exists: async () => stored !== null,
    },
    saved: () => stored,
  };
}

// =================================================================
// THE PROOF
// =================================================================

beforeEach(() => {
  storeSnapshots = [];
  hostReads = {};
  analytics.onStepComplete.mockClear();
  analytics.onWorkflowComplete.mockClear();
  analytics.onWorkflowAbandon.mockClear();
});

/** The authored shape of `items` after the user deleted the second row. */
const ITEMS_AUTHORED = { lines: [{ label: 'alpha' }] };
/** The authored shape of `extra` after the user deleted the prefilled row 'y'. */
const EXTRA_AUTHORED = { tags: [{ name: 'x' }] };

describe('PROOF: the repeatable shape boundary', () => {
  it('drives every write door and every read door, and the store never holds two shapes', async () => {
    const { adapter, saved } = makeAdapter();
    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider
        workflowConfig={{ ...buildFlow(), persistence: { adapter } }}
        defaultValues={DEFAULT_VALUES}
        onWorkflowComplete={onWorkflowComplete}
        // READ: onStepChange's context — a documented host callback.
        onStepChange={(_from, _to, context) => {
          hostReads.stepChangeContextAllData = structuredClone(context.allData.items);
        }}
      >
        <Harness />
      </WorkflowProvider>
    );

    // ---- WRITE: authored defaults. Two rows, already flat in the store.
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1');

    // ---- WRITE: the PUBLIC useFlowActions().setFieldValue, prefilling a step
    // the user has yet to reach — the fifth door.
    fireEvent.click(screen.getByTestId('action-prefill-refs'));

    // ---- WRITE: a user edit (_setFieldValue).
    fireEvent.change(screen.getByTestId('lines[k0].label'), {
      target: { value: 'alpha' },
    });

    // ---- WRITE: a user deletion (_removeFieldValues). The row the store must
    // never resurrect and never submit.
    fireEvent.click(screen.getByTestId('remove-lines-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    // ---- READ: the persistence snapshot a host adapter sees. Internal shape.
    fireEvent.click(screen.getByTestId('persist'));
    await waitFor(() => expect(saved()).not.toBeNull());
    expect(saved()?.allData.items).toEqual({ 'lines[k0].label': 'alpha' });

    // ---- WRITE: the form's own submit + WRITE: setNextStepFields (prefills
    // the next step's repeatable) + READ: the data param and both helper
    // readers, all in this one advance.
    fireEvent.click(screen.getByTestId('form-next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('extra'));

    // ONE invocation, ONE shape: the param and the helper's readers agree, and
    // they speak the shape the host authored its defaults in.
    expect(hostReads.afterValidationParam).toEqual(ITEMS_AUTHORED);
    expect(hostReads.helperGetStepData).toEqual(ITEMS_AUTHORED);
    expect(hostReads.helperGetAllData).toEqual(ITEMS_AUTHORED);
    // The CONTEXT param of that same invocation — the door that spoke flat
    // while the `data` param one argument to its left spoke authored.
    expect(hostReads.afterValidationContextAllData).toEqual(ITEMS_AUTHORED);

    // ---- READ: onStepChange's context.
    expect(hostReads.stepChangeContextAllData).toEqual(ITEMS_AUTHORED);

    // ---- READ: analytics.onStepComplete — the authored shape, in BOTH the
    // data param and the context that rides along with it.
    expect(analytics.onStepComplete).toHaveBeenCalledTimes(1);
    expect(analytics.onStepComplete.mock.calls[0][0]).toBe('items');
    expect(analytics.onStepComplete.mock.calls[0][2]).toEqual(ITEMS_AUTHORED);
    expect(analytics.onStepComplete.mock.calls[0][3].allData.items).toEqual(ITEMS_AUTHORED);

    // The helper-prefilled repeatable landed FLAT and is live in the form.
    await waitFor(() => expect(screen.getByTestId('tags[k1].name')).toBeTruthy());
    expect(screen.getByTestId('tags-order').textContent).toBe('k0,k1');

    // ---- WRITE: the user deletes a HELPER-PREFILLED row. Reachable only
    // because the prefill was flattened on the way in.
    fireEvent.click(screen.getByTestId('remove-tags-k1'));
    await waitFor(() => expect(screen.queryByTestId('tags[k1].name')).toBeNull());

    // ---- WRITE: the form submit + a cross-step setStepData naming 'review'.
    fireEvent.click(screen.getByTestId('form-next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));
    expect(analytics.onStepComplete).toHaveBeenCalledTimes(2);
    expect(analytics.onStepComplete.mock.calls[1][2]).toEqual(EXTRA_AUTHORED);

    // ---- READ: the public hooks. The store's INTERNAL shape, deliberately:
    // `workflowState.allData` and the store selectors are the live escape
    // hatch, not the host contract. Pinned so the split is a decision, not an
    // accident.
    const hookAllData = JSON.parse(screen.getByTestId('hook-allData').textContent ?? '{}');
    expect(hookAllData.items).toEqual({ 'lines[k0].label': 'alpha' });
    expect(hookAllData.extra).toEqual({ 'tags[k0].name': 'x' });
    expect(JSON.parse(screen.getByTestId('hook-useStepDataById').textContent ?? '{}')).toEqual({
      'lines[k0].label': 'alpha',
    });
    expect(JSON.parse(screen.getByTestId('hook-useStepData').textContent ?? '{}')).toEqual({
      note: 'from-helper',
    });

    // ---- The fifth door, walked into: the rows the host prefilled through the
    // public action are LIVE and FLAT, so the user can see them — and therefore
    // delete them. An authored array here renders nothing and is undeletable.
    fireEvent.click(screen.getByTestId('form-next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('wrap'));
    await waitFor(() => expect(screen.getByTestId('refs[k1].url')).toBeTruthy());
    expect(screen.getByTestId('refs-order').textContent).toBe('k0,k1');

    // ---- WRITE: the user deletes every row they can see.
    fireEvent.click(screen.getByTestId('remove-refs-k1'));
    fireEvent.click(screen.getByTestId('remove-refs-k0'));
    await waitFor(() => expect(screen.getByTestId('refs-order').textContent).toBe(''));

    // ---- READ: the completion payload + analytics.onWorkflowComplete. The
    // host contract: every deleted row gone, every survivor in the authored
    // shape.
    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0];
    expect(payload).toEqual({
      items: ITEMS_AUTHORED,
      extra: EXTRA_AUTHORED,
      review: { note: 'from-helper' },
      wrap: {},
    });
    expect(JSON.stringify(payload)).not.toContain('beta');
    expect(JSON.stringify(payload)).not.toContain('"y"');
    expect(JSON.stringify(payload)).not.toContain('ghost');
    expect(analytics.onWorkflowComplete.mock.calls[0][2]).toEqual(payload);

    // ---- THE INVARIANT: at no commit did any slice hold a second shape.
    expect(storeSnapshots.length).toBeGreaterThan(1);
    expectStoreIsFlatOnly(storeSnapshots);
  });

  it('hands onWorkflowAbandon the authored shape, and never resurrects a deleted row', async () => {
    const { adapter } = makeAdapter();

    const view = render(
      <WorkflowProvider
        workflowConfig={{ ...buildFlow(), persistence: { adapter } }}
        defaultValues={DEFAULT_VALUES}
      >
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.click(screen.getByTestId('remove-lines-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    view.unmount();

    // ---- READ: analytics.onWorkflowAbandon — the same shape its two siblings
    // on this interface speak.
    expect(analytics.onWorkflowAbandon).toHaveBeenCalledTimes(1);
    expect(analytics.onWorkflowAbandon.mock.calls[0][2]).toEqual({
      items: ITEMS_AUTHORED,
    });
    expectStoreIsFlatOnly(storeSnapshots);
  });

  it('restores a persistence snapshot flat, whichever shape the snapshot carries', async () => {
    // A snapshot written by a host that saved AUTHORED arrays — or by a build
    // from before the store spoke one shape. The restore is a write door.
    const stored: PersistedWorkflowData = {
      workflowId: 'shape-proof',
      currentStepIndex: 0,
      allData: { items: { lines: [{ label: 'alpha' }, { label: 'beta' }] } },
      stepData: {},
      visitedSteps: ['items'],
      passedSteps: [],
      timestamp: Date.now(),
    } as PersistedWorkflowData;

    const adapter: WorkflowPersistenceAdapter = {
      save: async () => {},
      load: async () => stored,
      remove: async () => {},
      exists: async () => true,
    };

    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider
        workflowConfig={{ ...buildFlow(), persistence: { adapter } }}
        defaultValues={DEFAULT_VALUES}
        onWorkflowComplete={onWorkflowComplete}
      >
        <Harness />
      </WorkflowProvider>
    );

    // The restored rows are live and FLAT — so the user can delete one.
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.click(screen.getByTestId('remove-lines-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(onWorkflowComplete.mock.calls[0][0].items).toEqual(ITEMS_AUTHORED);
    expectStoreIsFlatOnly(storeSnapshots);
  });
});
