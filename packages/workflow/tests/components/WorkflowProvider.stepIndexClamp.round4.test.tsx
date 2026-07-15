import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { useStep } from '../../src/hooks/useStep';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { useFlowStore } from '../../src/stores/workflowStore';
import { MockInput } from '../_helpers/mock-components';

describe('WorkflowProvider currentStepIndex clamping (round-4)', () => {
  let config: ril<Record<string, unknown>>;

  const twoStepFlow = (adapter: WorkflowPersistenceAdapter) =>
    flow
      .create(config, 'clamp-flow', 'Clamp Flow')
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
      .configure({ persistence: { adapter } })
      .build();

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  // BUG 4
  it('clamps an out-of-range persisted currentStepIndex to the last valid index', async () => {
    const persisted: PersistedWorkflowData = {
      workflowId: 'clamp-flow',
      currentStepIndex: 99,
      allData: {},
      stepData: {},
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

    const Probe = () => {
      const { workflowState } = useFlow();
      return <div data-testid="idx">{workflowState.currentStepIndex}</div>;
    };

    render(
      <WorkflowProvider workflowConfig={twoStepFlow(adapter)}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('idx')).toHaveTextContent('1'));
    expect(screen.getByTestId('idx')).not.toHaveTextContent('99');
  });

  // BUG 5
  it('useStep() does not throw when the store holds an out-of-range index', async () => {
    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => null),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => false),
    };

    let stepResult: ReturnType<typeof useStep> | null = null;
    let storeRef: ReturnType<typeof useFlowStore> | null = null;

    const Probe = () => {
      storeRef = useFlowStore();
      stepResult = useStep();
      return <div data-testid="ok">rendered</div>;
    };

    render(
      <WorkflowProvider workflowConfig={twoStepFlow(adapter)}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('ok')).toBeInTheDocument());

    // Drive the store out of range directly, bypassing the provider clamp.
    expect(() =>
      act(() => {
        storeRef?.getState()._loadPersistedState({ currentStepIndex: 99 });
      })
    ).not.toThrow();

    expect(screen.getByTestId('ok')).toBeInTheDocument();
    expect(stepResult?.metadata).toEqual({});
  });
});
