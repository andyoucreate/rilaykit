import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';

function createRil() {
  return ril.create().component('input', { name: 'Text Input', renderer: MockInput });
}

function buildFlow(config: ReturnType<typeof createRil>) {
  return flow
    .create(config, 'skip-flow', 'Skip Flow')
    .addStep({
      id: 'A',
      title: 'A',
      allowSkip: true,
      formConfig: form.create(config).add({ id: 'fa', type: 'input', props: { label: 'A' } }),
    })
    .addStep({
      id: 'B',
      title: 'B',
      formConfig: form.create(config).add({ id: 'fb', type: 'input', props: { label: 'B' } }),
    })
    .addStep({
      id: 'C',
      title: 'C',
      formConfig: form.create(config).add({ id: 'fc', type: 'input', props: { label: 'C' } }),
    })
    .build();
}

function Ctrl() {
  const { skipStep, goNext, currentStep } = useFlow();
  return (
    <div>
      <div data-testid="step">{currentStep?.id ?? 'none'}</div>
      <button type="button" data-testid="skip" onClick={() => skipStep()}>
        Skip
      </button>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        Next
      </button>
    </div>
  );
}

describe('skip transition failure must not leak the skip-suppression signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires onStepComplete for A on a normal advance after a FAILED skip', async () => {
    const config = createRil();
    const onStepComplete = vi.fn();
    const onStepStart = vi.fn();
    const workflowConfig = buildFlow(config);

    // onStepChange throws exactly once (fails the skip's transition), then succeeds.
    let thrown = false;
    const onStepChange = vi.fn(() => {
      if (!thrown) {
        thrown = true;
        throw new Error('boom');
      }
    });

    render(
      <WorkflowProvider
        workflowConfig={{ ...workflowConfig, analytics: { onStepComplete, onStepStart } }}
        onStepChange={onStepChange}
      >
        <Ctrl />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    // Skip A — the transition throws in onStepChange and is caught (returns false).
    fireEvent.click(screen.getByTestId('skip'));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledTimes(1));
    // Still on A (transition failed).
    expect(screen.getByTestId('step')).toHaveTextContent('A');
    expect(onStepComplete).not.toHaveBeenCalled();

    // Now advance A normally — this is a real completion, must NOT be suppressed.
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    expect(onStepComplete).toHaveBeenCalledWith(
      'A',
      expect.any(Number),
      expect.anything(),
      expect.anything()
    );
  });

  it('happy path: a successful skip fires no onStepComplete for A', async () => {
    const config = createRil();
    const onStepComplete = vi.fn();
    const onStepStart = vi.fn();
    const workflowConfig = buildFlow(config);

    render(
      <WorkflowProvider
        workflowConfig={{ ...workflowConfig, analytics: { onStepComplete, onStepStart } }}
      >
        <Ctrl />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    fireEvent.click(screen.getByTestId('skip'));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('B'));

    // A was skipped, not completed.
    expect(onStepComplete).not.toHaveBeenCalledWith(
      'A',
      expect.any(Number),
      expect.anything(),
      expect.anything()
    );
  });
});
