import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { MockInput } from '../_helpers/mock-components';

/**
 * Golden-path race — after a workflow completes, clear-on-completion removes
 * the persisted data. A debounced auto-save scheduled from the last edit /
 * navigation transition (plus the auto-persist effect re-running once
 * isSubmitting flips back to false with lastSavedState reset to undefined)
 * must NOT fire afterwards and write the finished workflow back into storage.
 * If it did, re-mounting the same provider would resurrect the completed flow.
 */
describe('Workflow persistence - no resurrection after clear-on-completion', () => {
  let config: ril<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  const buildConfig = (adapter: WorkflowPersistenceAdapter) =>
    flow
      .create(config, 'complete-flow', 'Complete Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ persistence: { adapter, options: { autoPersist: true } } })
      .build();

  it('does not re-persist the completed workflow after the completion clear', async () => {
    const store = new Map<string, PersistedWorkflowData>();
    const save = vi.fn(async (key: string, data: PersistedWorkflowData) => {
      store.set(key, data);
    });
    const remove = vi.fn(async (key: string) => {
      store.delete(key);
    });
    const adapter: WorkflowPersistenceAdapter = {
      save,
      load: vi.fn(async (key: string) => store.get(key) ?? null),
      remove,
      exists: vi.fn(async (key: string) => store.has(key)),
    };

    let goNextRef: (() => Promise<boolean>) | null = null;
    let submitRef: (() => Promise<void>) | null = null;
    let currentStepIndexRef = -1;
    const Probe = () => {
      const { goNext, submitWorkflow, workflowState } = useFlow();
      goNextRef = goNext;
      submitRef = submitWorkflow;
      currentStepIndexRef = workflowState.currentStepIndex;
      return <div data-testid="step-index">{workflowState.currentStepIndex}</div>;
    };

    const onComplete = vi.fn();
    const { unmount } = render(
      <WorkflowProvider workflowConfig={buildConfig(adapter)} onWorkflowComplete={onComplete}>
        <Probe />
      </WorkflowProvider>
    );

    // Settle initialization.
    await waitFor(() => expect(screen.getByTestId('step-index')).toHaveTextContent('0'));

    // Navigate to the last step. This schedules a debounced auto-save that is
    // still PENDING when we complete below — the completion clear must cancel
    // it so it cannot write the finished workflow back after removal.
    await act(async () => {
      await goNextRef?.();
    });
    await waitFor(() => expect(screen.getByTestId('step-index')).toHaveTextContent('1'));

    // Complete the workflow immediately — clear-on-completion removes the
    // persisted data (round-4 behavior).
    await act(async () => {
      await submitRef?.();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);

    // Only observe saves scheduled/fired from here on (i.e. after the clear).
    save.mockClear();

    // Advance well past the debounce window. No resurrection: the pending
    // navigation save must have been cancelled, the post-completion auto-persist
    // effect re-run (isSubmitting flipping back to false with lastSavedState
    // reset to undefined) must NOT schedule a new save, so the store stays empty.
    // Two act phases: the first flushes the post-submit effect (which, unfixed,
    // schedules the resurrecting save), the second lets that debounce fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(store.size).toBe(0);
    expect(save).not.toHaveBeenCalled();

    // Re-mounting the same provider must start fresh, not restored onto step B.
    unmount();
    currentStepIndexRef = -1;
    render(
      <WorkflowProvider workflowConfig={buildConfig(adapter)} onWorkflowComplete={vi.fn()}>
        <Probe />
      </WorkflowProvider>
    );
    await waitFor(() => expect(screen.getByTestId('step-index')).toHaveTextContent('0'));
    expect(currentStepIndexRef).toBe(0);
  });
});
