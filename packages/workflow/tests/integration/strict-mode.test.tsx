import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';

function createRil() {
  return ril.create().component('input', { name: 'Text Input', renderer: MockInput });
}

function StepProbe() {
  const { currentStep } = useFlow();
  return <div data-testid="step">{currentStep?.id ?? 'none'}</div>;
}

describe('StrictMode double-mount must not double-fire one-time analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires onWorkflowStart and onStepStart exactly once', async () => {
    const config = createRil();
    const onWorkflowStart = vi.fn();
    const onStepStart = vi.fn();

    const workflowConfig = flow
      .create(config, 'strict-flow', 'Strict Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'fa', type: 'input', props: { label: 'A' } }),
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'fb', type: 'input', props: { label: 'B' } }),
      })
      .build();

    render(
      <StrictMode>
        <WorkflowProvider
          workflowConfig={{ ...workflowConfig, analytics: { onWorkflowStart, onStepStart } }}
        >
          <StepProbe />
          <FlowBody />
        </WorkflowProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('A'));

    expect(onWorkflowStart).toHaveBeenCalledTimes(1);
    expect(onStepStart).toHaveBeenCalledTimes(1);
  });
});
