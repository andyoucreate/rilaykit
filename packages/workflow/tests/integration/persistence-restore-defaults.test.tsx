import { ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';
import { compileFlow } from '../../src/schema';

/**
 * A restore must not COST the consumer their compiled defaults.
 *
 * A persisted snapshot only ever carries what a session actually recorded. The
 * steps it says nothing about are not "steps with no data" — they are steps the
 * snapshot has no opinion about, and the flow's own JSON-authored defaults are
 * the answer for them. Replacing `allData` wholesale with the snapshot silently
 * blanks every one of them.
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

const SCHEMA = {
  version: 1,
  id: 'defaults-flow',
  name: 'Defaults Flow',
  steps: [
    {
      id: 'stepA',
      title: 'Step A',
      form: { version: 1, id: 'formA', fields: [{ id: 'name', type: 'text', props: {} }] },
    },
    {
      id: 'stepB',
      title: 'Step B',
      form: {
        version: 1,
        id: 'formB',
        fields: [{ id: 'note', type: 'text', props: {}, default: 'authored-default' }],
      },
    },
  ],
} as const;

function Harness() {
  const { goNext, currentStep } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <FlowBody />
    </div>
  );
}

describe('persistence restore — compiled defaults for unvisited steps', () => {
  it('keeps a step default the snapshot says nothing about', async () => {
    const { workflowConfig, defaultValues } = compileFlow(SCHEMA, catalog);
    expect(defaultValues).toEqual({ stepB: { note: 'authored-default' } });

    // What a session that only ever touched step A recorded: step B is absent,
    // because the user never reached it.
    const persisted: PersistedWorkflowData = {
      workflowId: 'defaults-flow',
      currentStepIndex: 0,
      allData: { stepA: { name: 'typed-earlier' } },
      stepData: { name: 'typed-earlier' },
      visitedSteps: ['stepA'],
      passedSteps: [],
      lastSaved: Date.now(),
    };

    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => persisted),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
    };

    const persistedConfig = { ...workflowConfig, persistence: { adapter } };

    render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={defaultValues}>
        <Harness />
      </WorkflowProvider>
    );

    // The snapshot restores step A's value.
    await waitFor(() =>
      expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('typed-earlier')
    );

    // Step B was never visited, so the snapshot carries nothing for it — its
    // JSON-authored default must still be there.
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('stepB'));
    expect((screen.getByTestId('note') as HTMLInputElement).value).toBe('authored-default');
  });

  it('lets a persisted value win over the compiled default for the same key', async () => {
    const { workflowConfig, defaultValues } = compileFlow(SCHEMA, catalog);

    // The user reached step B last time and cleared the default.
    const persisted: PersistedWorkflowData = {
      workflowId: 'defaults-flow',
      currentStepIndex: 1,
      allData: { stepA: { name: 'typed-earlier' }, stepB: { note: 'user-override' } },
      stepData: { note: 'user-override' },
      visitedSteps: ['stepA', 'stepB'],
      passedSteps: ['stepA'],
      lastSaved: Date.now(),
    };

    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => persisted),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
    };

    const persistedConfig = { ...workflowConfig, persistence: { adapter } };

    render(
      <WorkflowProvider workflowConfig={persistedConfig} defaultValues={defaultValues}>
        <Harness />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('stepB'));
    expect((screen.getByTestId('note') as HTMLInputElement).value).toBe('user-override');
  });
});
