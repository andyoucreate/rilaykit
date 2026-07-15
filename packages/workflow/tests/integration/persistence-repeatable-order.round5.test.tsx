import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import type { PersistedWorkflowData, WorkflowPersistenceAdapter } from '../../src/persistence/types';

/**
 * A user reorder must survive a RELOAD, not just an in-session step re-entry.
 *
 * The order is unreconstructable from the values — a move rewrites the order and
 * nothing else — which is exactly why the workflow mirrors it into
 * `_repeatableOrders`. A snapshot that carries the values but not the order
 * therefore restores the rows in their INSERTION order and silently reverts the
 * user's arrangement. The rationale that put the mirror in the store applies
 * verbatim to persistence.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

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

function Harness() {
  const { persistNow } = useFlow();
  return (
    <div>
      <button type="button" data-testid="persist" onClick={() => persistNow?.()}>
        persist
      </button>
      <LinesProbe />
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'order-wf', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .build();
}

const DEFAULT_VALUES = { items: { lines: [{ label: 'alpha' }, { label: 'beta' }] } };

function makeAdapter(seed: PersistedWorkflowData | null = null) {
  let saved: PersistedWorkflowData | null = seed;
  return {
    adapter: {
      save: vi.fn(async (_key: string, data: PersistedWorkflowData) => {
        saved = data;
      }),
      load: vi.fn(async () => saved),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => saved !== null),
    } satisfies WorkflowPersistenceAdapter,
    getSaved: () => saved,
  };
}

describe('persistence — repeatable row order', () => {
  it('restores a user reorder after a reload', async () => {
    const { adapter, getSaved } = makeAdapter();
    const persistedConfig = { ...buildFlow(), persistence: { adapter } };

    const first = render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={DEFAULT_VALUES}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1'));
    fireEvent.click(screen.getByTestId('move-0-1'));
    await waitFor(() => expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0'));

    fireEvent.click(screen.getByTestId('persist'));
    await waitFor(() => expect(getSaved()).not.toBeNull());
    expect(getSaved()?.repeatableOrders).toEqual({ items: { lines: ['k1', 'k0'] } });

    first.unmount();

    render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={DEFAULT_VALUES}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    expect(screen.getByTestId('lines-order').textContent).toBe('k1,k0');
  });

  it('restores a snapshot written before the order was persisted', async () => {
    // A snapshot from an older build: values only, no `repeatableOrders` field.
    // It must still restore — the order falls back to reconstruction from the
    // flat keys, which is exactly what such a session could ever have had.
    const legacy: PersistedWorkflowData = {
      workflowId: 'order-wf',
      currentStepIndex: 0,
      allData: { items: { 'lines[k0].label': 'alpha', 'lines[k1].label': 'beta' } },
      stepData: {},
      visitedSteps: ['items'],
      passedSteps: [],
      lastSaved: Date.now(),
    };
    const { adapter } = makeAdapter(legacy);
    const persistedConfig = { ...buildFlow(), persistence: { adapter } };

    render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={DEFAULT_VALUES}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    expect(screen.getByTestId('lines-order').textContent).toBe('k0,k1');
    expect((screen.getByTestId('lines[k1].label') as HTMLInputElement).value).toBe('beta');
  });
});
