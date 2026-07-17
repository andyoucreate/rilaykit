import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';

/**
 * Bug 6 — an async persistence load that resolves AFTER the form became
 * interactive must not clobber input the user already typed. Loaded data is
 * the base, but keys the user already set win.
 */
describe('Persistence load race (Bug 6)', () => {
  let config: ril<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = rilFactory.create().component('input', {
      name: 'Text Input',
      renderer: MockInput,
    });
  });

  it('preserves user input typed before a deferred load resolves, while other persisted keys apply', async () => {
    let resolveLoad: (value: PersistedWorkflowData | null) => void = () => {};
    const loadPromise = new Promise<PersistedWorkflowData | null>((resolve) => {
      resolveLoad = resolve;
    });

    const persisted: PersistedWorkflowData = {
      workflowId: 'race-flow',
      currentStepIndex: 0,
      allData: { stepA: { name: 'persisted-name', email: 'persisted-email' } },
      stepData: { name: 'persisted-name', email: 'persisted-email' },
      visitedSteps: ['stepA'],
      passedSteps: [],
      lastSaved: Date.now(),
    };

    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(() => loadPromise),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
    };

    const workflowConfig = flow
      .create(config, 'race-flow', 'Race Flow')
      .addStep({
        id: 'stepA',
        title: 'Step A',
        formConfig: form
          .create(config)
          .add({ id: 'name', type: 'input', props: { label: 'Name' } })
          .add({ id: 'email', type: 'input', props: { label: 'Email' } }),
      })
      .configure({ persistence: { adapter } })
      .build();

    let setValueRef: ((fieldId: string, value: unknown) => void) | null = null;
    const Probe = () => {
      const { setValue, workflowState } = useFlow();
      setValueRef = setValue;
      const stepA = (workflowState.allData.stepA ?? {}) as Record<string, unknown>;
      return (
        <div>
          <div data-testid="name">{String(stepA.name ?? '')}</div>
          <div data-testid="email">{String(stepA.email ?? '')}</div>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    // The load has not resolved yet; the user types into 'name'.
    await waitFor(() => expect(setValueRef).not.toBeNull());
    act(() => {
      setValueRef?.('name', 'typed-by-user');
    });

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('typed-by-user'));

    // Now the deferred load resolves.
    await act(async () => {
      resolveLoad(persisted);
      await loadPromise;
    });

    // The user's in-flight edit survives; the untouched persisted key applies.
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('persisted-email'));
    expect(screen.getByTestId('name')).toHaveTextContent('typed-by-user');
  });

  it('fully restores persisted state when the user has not interacted before load resolves', async () => {
    const persisted: PersistedWorkflowData = {
      workflowId: 'resume-flow',
      currentStepIndex: 0,
      allData: { stepA: { name: 'persisted-name', email: 'persisted-email' } },
      stepData: { name: 'persisted-name', email: 'persisted-email' },
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

    const workflowConfig = flow
      .create(config, 'resume-flow', 'Resume Flow')
      .addStep({
        id: 'stepA',
        title: 'Step A',
        formConfig: form
          .create(config)
          .add({ id: 'name', type: 'input', props: { label: 'Name' } })
          .add({ id: 'email', type: 'input', props: { label: 'Email' } }),
      })
      .configure({ persistence: { adapter } })
      .build();

    const Probe = () => {
      const { workflowState } = useFlow();
      const stepA = (workflowState.allData.stepA ?? {}) as Record<string, unknown>;
      return (
        <div>
          <div data-testid="name">{String(stepA.name ?? '')}</div>
          <div data-testid="email">{String(stepA.email ?? '')}</div>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('persisted-name'));
    expect(screen.getByTestId('email')).toHaveTextContent('persisted-email');
  });
});
