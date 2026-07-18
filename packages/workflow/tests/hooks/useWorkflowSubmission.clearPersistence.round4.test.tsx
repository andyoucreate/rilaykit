import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';

describe('workflow persistence cleared on completion (round-4, Bug 9)', () => {
  let config: ril<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  it('removes the persisted entry after a successful completion so it cannot resurrect', async () => {
    const store = new Map<string, PersistedWorkflowData>();
    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async (key: string, data: PersistedWorkflowData) => {
        store.set(key, data);
      }),
      load: vi.fn(async (key: string) => store.get(key) ?? null),
      remove: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      exists: vi.fn(async (key: string) => store.has(key)),
    };

    const workflowConfig = flow
      .create(config, 'complete-flow', 'Complete Flow')
      .addStep({
        id: 'stepA',
        title: 'Step A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'stepB',
        title: 'Step B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ persistence: { adapter, options: { autoPersist: true } } })
      .build();

    let flowApi: ReturnType<typeof useFlow> | null = null;
    const Probe = () => {
      flowApi = useFlow();
      return null;
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={vi.fn()}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(flowApi).not.toBeNull());

    // Persist some state, then reach the last step.
    await act(async () => {
      await flowApi?.persistNow?.();
    });
    expect(store.size).toBe(1);

    await act(async () => {
      await flowApi?.goNext();
    });

    // Complete the workflow.
    await act(async () => {
      await flowApi?.submitWorkflow();
    });

    await waitFor(() => {
      expect(adapter.remove).toHaveBeenCalled();
      expect(store.size).toBe(0);
    });
  });
});
