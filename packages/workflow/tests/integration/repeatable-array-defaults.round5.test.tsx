import { ril } from '@rilaykit/core';
import { form, useRepeatableField } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import type { PersistedWorkflowData, WorkflowPersistenceAdapter } from '../../src/persistence/types';

/**
 * The append-only mirror, re-entering through a SHAPE MISMATCH.
 *
 * An authored default for a repeatable lives in the step slice in its AUTHORED
 * shape (`lines: [{label:'alpha'}]`, under the bare repeatable id), while the
 * form mirrors every change as FLAT COMPOSITE keys (`lines[k0].label`).
 * `_removeFieldValues` only deletes flat keys, so a row that exists ONLY in the
 * raw array is untouchable: it is submitted to the backend after the user
 * deleted it, and comes back on step re-entry.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: ({ id, field }) => (
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
      />
    ),
  });
}

const catalog = makeCatalog();

function LinesProbe() {
  const { items, remove } = useRepeatableField('lines');
  return (
    <div>
      <output data-testid="lines-order">{items.map((item) => item.key).join(',')}</output>
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
  const { goNext, goPrevious, currentStep, submitWorkflow } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="back" onClick={() => goPrevious()}>
        back
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <LinesProbe />
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
    })
    .addStep({
      id: 'review',
      title: 'Review',
      formConfig: form.create(catalog, 'review-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .build();
}

const DEFAULT_VALUES = { items: { lines: [{ label: 'alpha' }, { label: 'beta' }] } };

async function deleteSecondRow() {
  await waitFor(() => expect(screen.getByTestId('lines[k1].label')).toBeTruthy());
  fireEvent.click(screen.getByTestId('remove-k1'));
  await waitFor(() => expect(screen.queryByTestId('lines[k1].label')).toBeNull());
}

describe('array-shaped repeatable defaults — deletion', () => {
  it('never submits a default-authored row the user deleted', async () => {
    const onWorkflowComplete = vi.fn();
    render(
      <WorkflowProvider
        workflowConfig={buildFlow()}
        defaultValues={DEFAULT_VALUES}
        onWorkflowComplete={onWorkflowComplete}
      >
        <Harness />
      </WorkflowProvider>
    );

    await deleteSecondRow();

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain('beta');
    expect((payload.items as Record<string, unknown>)['lines[k0].label']).toBe('alpha');
  });

  it('does not resurrect a default-authored row on step re-entry', async () => {
    render(
      <WorkflowProvider workflowConfig={buildFlow()} defaultValues={DEFAULT_VALUES}>
        <Harness />
      </WorkflowProvider>
    );

    await deleteSecondRow();

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('items'));

    expect(screen.getByTestId('lines-order').textContent).toBe('k0');
    expect((screen.getByTestId('lines[k0].label') as HTMLInputElement).value).toBe('alpha');
    expect(screen.queryByTestId('lines[k1].label')).toBeNull();
  });
});

describe('array-shaped repeatable defaults — persistence round trip', () => {
  it('does not resurrect a deleted default-authored row through save/restore', async () => {
    let saved: PersistedWorkflowData | null = null;
    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async (_key, data) => {
        saved = data;
      }),
      load: vi.fn(async () => saved),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => saved !== null),
    };

    const persistedConfig = { ...buildFlow(), persistence: { adapter } };

    function PersistHarness() {
      const { persistNow } = useFlow();
      return (
        <button type="button" data-testid="persist" onClick={() => persistNow?.()}>
          persist
        </button>
      );
    }

    const first = render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={DEFAULT_VALUES}>
        <Harness />
        <PersistHarness />
      </WorkflowProvider>
    );

    await deleteSecondRow();

    fireEvent.click(screen.getByTestId('persist'));
    await waitFor(() => expect(saved).not.toBeNull());
    expect(JSON.stringify(saved)).not.toContain('beta');

    first.unmount();

    render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={DEFAULT_VALUES}>
        <Harness />
        <PersistHarness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
    expect(screen.getByTestId('lines-order').textContent).toBe('k0');
    expect(screen.queryByTestId('lines[k1].label')).toBeNull();
  });
});
