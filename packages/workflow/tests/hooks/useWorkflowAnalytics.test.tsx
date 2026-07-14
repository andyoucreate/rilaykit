import { type ril, ril as rilFactory } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import type {
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../../src/persistence/types';
import { MockInput } from '../_helpers/mock-components';

/**
 * Analytics lifecycle contracts:
 * - BUG 2: onStepComplete must receive the COMPLETED step's data.
 * - BUG 5: skipping fires onStepSkip only (never onStepComplete, never passed).
 * - BUG 6: resuming from persistence must not emit phantom analytics for the
 *   default step.
 */
describe('Workflow analytics lifecycle', () => {
  const Probe = () => {
    const { currentStep, workflowState, goNext, skipStep } = useFlow();
    return (
      <div>
        <div data-testid="step">{currentStep?.id ?? 'none'}</div>
        <div data-testid="passed">{Array.from(workflowState.passedSteps).join(',')}</div>
        <button type="button" data-testid="next" onClick={() => goNext()}>
          next
        </button>
        <button type="button" data-testid="skip" onClick={() => skipStep()}>
          skip
        </button>
      </div>
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

  it('BUG 2: onStepComplete receives the completed step data, not the new step', async () => {
    const onStepComplete = vi.fn();

    const workflowConfig = flow
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
      .configure({ analytics: { onStepComplete } })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
        <FlowBody />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'foo' } });
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    await waitFor(() => expect(onStepComplete).toHaveBeenCalledTimes(1));
    expect(onStepComplete.mock.calls[0][0]).toBe('A');
    expect(onStepComplete.mock.calls[0][2]).toEqual({ a: 'foo' });
  });

  it('BUG 5: skipping a step fires onStepSkip only, never onStepComplete nor passed', async () => {
    const onStepSkip = vi.fn();
    const onStepComplete = vi.fn();

    const workflowConfig = flow
      .create(config, 'skip-flow', 'Skip Flow')
      .addStep({
        id: 'A',
        title: 'A',
        allowSkip: true,
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .configure({ analytics: { onStepSkip, onStepComplete } })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    fireEvent.click(screen.getByTestId('skip'));

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    expect(onStepSkip).toHaveBeenCalledTimes(1);
    expect(onStepSkip.mock.calls[0][0]).toBe('A');
    // A skip is not a completion.
    expect(onStepComplete).not.toHaveBeenCalled();
    // A skip bypasses validation, so the step is not "passed".
    expect(screen.getByTestId('passed')).not.toHaveTextContent('A');
  });

  it('BUG 6: resuming from persistence emits no phantom analytics for the default step', async () => {
    const onStepStart = vi.fn();
    const onStepComplete = vi.fn();

    const persisted: PersistedWorkflowData = {
      workflowId: 'persist-flow',
      currentStepIndex: 2,
      allData: { A: {}, B: {}, C: {} },
      stepData: {},
      visitedSteps: ['A', 'B', 'C'],
      passedSteps: ['A', 'B'],
      lastSaved: Date.now(),
    };

    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => persisted),
      remove: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
      listKeys: vi.fn(async () => []),
      clear: vi.fn(async () => {}),
    };

    const workflowConfig = flow
      .create(config, 'persist-flow', 'Persist Flow')
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
      .addStep({
        id: 'C',
        title: 'C',
        formConfig: form.create(config).add({ id: 'c', type: 'input', props: { label: 'C' } }),
      })
      .configure({
        analytics: { onStepStart, onStepComplete },
        persistence: { adapter },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('C'));

    await waitFor(() => expect(onStepStart).toHaveBeenCalledTimes(1));
    expect(onStepStart.mock.calls[0][0]).toBe('C');
    expect(onStepComplete).not.toHaveBeenCalled();
  });

  it('BUG 6 guard: a fresh (non-persisted) flow still fires onStepStart(step0) once', async () => {
    const onStepStart = vi.fn();

    const workflowConfig = flow
      .create(config, 'fresh-flow', 'Fresh Flow')
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
      .configure({ analytics: { onStepStart } })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <Probe />
      </WorkflowProvider>
    );

    await waitFor(() => expect(onStepStart).toHaveBeenCalledTimes(1));
    expect(onStepStart.mock.calls[0][0]).toBe('A');
  });
});
