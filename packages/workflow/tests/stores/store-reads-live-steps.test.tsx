import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  FlowBody,
  WorkflowProvider,
  createWorkflowStore,
  useFlow,
  useFlowActions,
} from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * THE SEVENTH DOOR — the invariant was FROZEN AT MOUNT.
 *
 * `createWorkflowStore` closed over `steps` at creation and the provider creates
 * the store ONCE per mount (`useRef`), while reading `workflowConfig.steps` LIVE
 * everywhere else: step derivation, navigation, the persistence clamp,
 * conditions. So a provider handed a RECOMPILED config honoured it for rendering
 * and navigation while the store kept normalising against MOUNT-TIME steps.
 *
 * For a step whose repeatable the mount config did not declare,
 * `flattenAuthoredSlice` receives `repeatableConfigs === undefined` and takes
 * its `if (!repeatableConfigs) return slice;` early-out: the store keeps the
 * AUTHORED array. The two-shape slice is back, and with it the CRITICAL — the
 * row the user deletes has no flat keys to delete, so it is submitted anyway.
 *
 * A server-driven app recompiling a FlowSchema and re-rendering is the product's
 * headline use case, so "the config does not change after mount" was never a
 * premise this store was entitled to.
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

/**
 * The recompile: the SAME step id, gaining the repeatable the mount-time config
 * did not declare.
 */
function buildFlow(withRepeatable: boolean) {
  const itemsForm = withRepeatable
    ? form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} }))
    : form.create(catalog, 'items-form').add({ id: 'note', type: 'text', props: {} });

  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'intro',
      title: 'Intro',
      formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
    })
    .addStep({ id: 'items', title: 'Items', formConfig: itemsForm })
    .build();
}

const AUTHORED = { lines: [{ label: 'keep' }, { label: 'ghost' }] };

function LinesProbe() {
  const { items, remove } = useRepeatableField('lines');
  return (
    <div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-testid={`remove-${item.key}`}
          onClick={() => remove(item.key)}
        >
          {`remove ${item.key}`}
        </button>
      ))}
    </div>
  );
}

function Harness() {
  const { currentStep, submitWorkflow, goNext } = useFlow();
  const actions = useFlowActions();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button
        type="button"
        data-testid="host-write"
        onClick={() => actions.setStepData({ ...AUTHORED }, 'items')}
      >
        write
      </button>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      {currentStep?.id === 'items' ? <LinesProbe /> : null}
      <FlowBody />
    </div>
  );
}

/**
 * The provider is NOT remounted: same element type, same position, so React
 * reuses it and hands it a new `workflowConfig` — exactly what a server-driven
 * host does when it recompiles a FlowSchema.
 */
function Recompiler({ onWorkflowComplete }: { onWorkflowComplete: (data: unknown) => void }) {
  const [withRepeatable, setWithRepeatable] = useState(false);
  const workflowConfig = useMemo(() => buildFlow(withRepeatable), [withRepeatable]);
  return (
    <div>
      <button type="button" data-testid="recompile" onClick={() => setWithRepeatable(true)}>
        recompile
      </button>
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <Harness />
      </WorkflowProvider>
    </div>
  );
}

describe('the store reads its steps at every write', () => {
  it('normalises a write against the swapped-in config, not the creation one', () => {
    let live = buildFlow(false).steps;
    const store = createWorkflowStore({ getSteps: () => live, defaultStepIndex: 1 });

    // The recompile: 'items' now declares the 'lines' repeatable.
    live = buildFlow(true).steps;

    store.getState()._setStepData({ ...AUTHORED }, 'items');

    const slice = store.getState().allData.items as Record<string, unknown>;
    expect(Object.keys(slice)).not.toContain('lines');
    expect(slice['lines[k0].label']).toBe('keep');
    expect(slice['lines[k1].label']).toBe('ghost');
  });

  /**
   * THE OTHER DIRECTION, and the reason a slice stored under the old config is
   * left alone rather than re-normalised: a repeatable the swap REMOVED.
   *
   * `flattenAuthoredSlice` only ever rewrites an AUTHORED array under a
   * DECLARED repeatable id. It cannot un-flatten, so a slice holding
   * `lines[k0].label` keys carries them through a config that no longer declares
   * 'lines' — verbatim, not corrupted. Normalisation is therefore safe in both
   * directions but is not a repair: it fixes the shape of writes, and a slice
   * written under a config where `lines` was an ordinary field was never the
   * wrong shape FOR THAT CONFIG.
   */
  it('carries an already-flat slice through a config that dropped the repeatable', () => {
    let live = buildFlow(true).steps;
    const store = createWorkflowStore({ getSteps: () => live, defaultStepIndex: 1 });

    store.getState()._setStepData({ ...AUTHORED }, 'items');
    const flattened = store.getState().allData.items as Record<string, unknown>;
    expect(flattened['lines[k1].label']).toBe('ghost');

    // The swap drops the repeatable entirely.
    live = buildFlow(false).steps;
    store.getState()._setStepData(flattened, 'items');

    expect(store.getState().allData.items).toEqual(flattened);
  });
});

describe('the store normalises against the LIVE config, not the mount-time one', () => {
  it('never submits a row the user deleted after the config was recompiled', async () => {
    const onWorkflowComplete = vi.fn();
    render(<Recompiler onWorkflowComplete={onWorkflowComplete} />);

    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    // The host recompiles: step 'items' now declares the 'lines' repeatable.
    fireEvent.click(screen.getByTestId('recompile'));

    fireEvent.click(screen.getByTestId('host-write'));
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    // The rows are live in the form — reachable, therefore deletable.
    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());

    fireEvent.click(screen.getByTestId('remove-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(JSON.stringify(onWorkflowComplete.mock.calls[0][0])).not.toContain('ghost');
    expect(onWorkflowComplete.mock.calls[0][0].items.lines).toEqual([{ label: 'keep' }]);
  });

  /**
   * WHY A SWAP DOES NOT RE-NORMALISE THE SLICES ALREADY STORED.
   *
   * A slice written BEFORE the recompile was written under a config where
   * 'lines' was an ordinary field and its array was an ordinary value — it was
   * never the wrong shape FOR THAT CONFIG, so there is nothing to repair. And it
   * does not survive to do harm: the form seeds its rows from the authored array
   * regardless, and the user's first interaction with the step IS a write, which
   * normalises against the live steps like every other write. The slice
   * self-heals at exactly the moment it starts to matter.
   *
   * So the store gets no swap hook, and the provider gets no
   * config-change effect re-writing every slice — an effect that would have to
   * fire on a config identity a host is free to churn every render, feeding a
   * store write back into the subscription that re-renders it. The live-steps
   * read is the whole fix; this test is the evidence for the part NOT built.
   */
  it('honours a deletion on a slice written BEFORE the recompile', async () => {
    const onWorkflowComplete = vi.fn();
    render(<Recompiler onWorkflowComplete={onWorkflowComplete} />);

    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    // The host prefills while config A is live, THEN the server recompiles.
    fireEvent.click(screen.getByTestId('host-write'));
    fireEvent.click(screen.getByTestId('recompile'));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
    fireEvent.click(screen.getByTestId('remove-k1'));
    await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    expect(JSON.stringify(onWorkflowComplete.mock.calls[0][0])).not.toContain('ghost');
    expect(onWorkflowComplete.mock.calls[0][0].items.lines).toEqual([{ label: 'keep' }]);
  });
});
