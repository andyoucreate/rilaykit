import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { MockInput } from '../_helpers/mock-components';

/**
 * BUG 7: auto-save termination invariant. A single state change must produce
 * exactly one debounced save, and once the state is quiescent the auto-save
 * effect must NOT keep firing (no infinite save loop). This pins the
 * lastSavedState-equality guard in usePersistence.
 */
describe('Workflow persistence - auto-save termination', () => {
  const Setter = () => {
    const { setValue } = useFlow();
    return (
      <button type="button" data-testid="set" onClick={() => setValue('a', 'foo')}>
        set
      </button>
    );
  };

  let config: ril<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  it('saves exactly once per change and stops when the state is quiescent', async () => {
    const store = new Map<string, PersistedWorkflowData>();
    const save = vi.fn(async (key: string, data: PersistedWorkflowData) => {
      store.set(key, data);
    });
    const adapter: WorkflowPersistenceAdapter = {
      save,
      load: vi.fn(async () => null),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => false),
      listKeys: vi.fn(async () => []),
      clear: vi.fn(async () => {}),
    };

    const workflowConfig = flow
      .create(config, 'autosave-flow', 'Autosave Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .configure({
        persistence: { adapter, options: { autoPersist: true, debounceMs: 20 } },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Setter />
      </WorkflowProvider>
    );

    // Let initialization settle and any mount-driven save flush.
    await waitFor(() => expect(screen.getByTestId('set')).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Only count saves triggered by the explicit change below.
    save.mockClear();

    fireEvent.click(screen.getByTestId('set'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    // Quiescent period: no further state change must NOT produce another save.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(save).toHaveBeenCalledTimes(1);
  });
});
