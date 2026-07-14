import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Flow, flow, useFlow, useFlowData, useStep } from '@rilaykit/workflow';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const wf = flow.create(r, 'wf', 'WF').addStep({
  id: 'a',
  title: 'Step A',
  metadata: { hero: 'yes' },
  formConfig: form.create(r, 'a').add({ id: 'a-f', type: 'text', props: {} }).build(),
});

function Probe() {
  const { currentStep } = useFlow();
  const { step, index, metadata } = useStep();
  const data = useFlowData();
  return (
    <output data-testid="probe">{`${currentStep.id}|${step.title}|${index}|${metadata.hero}|${Object.keys(data).length}`}</output>
  );
}

describe('useFlow* family', () => {
  it('exposes flow context, current step and data', () => {
    render(
      <Flow of={wf}>
        <Probe />
      </Flow>
    );
    expect(screen.getByTestId('probe').textContent).toBe('a|Step A|0|yes|0');
  });

  it('old names are gone from the public surface', async () => {
    const mod = await import('@rilaykit/workflow');
    expect('useWorkflowContext' in mod).toBe(false);
    expect('useWorkflowAllData' in mod).toBe(false);
    expect('useCurrentStepIndex' in mod).toBe(false);
  });
});
