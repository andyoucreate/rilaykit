import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { Flow, flow, useFlow, useFlowData, useStep } from '@rilaykit/workflow';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const r = ril.create().component('text', { renderer: ({ id }) => <input data-testid={id} /> });
const wf = flow
  .create(r, 'wf', 'WF')
  .addStep({
    id: 'a',
    title: 'Step A',
    metadata: { hero: 'yes' },
    formConfig: form.create(r, 'a').add({ id: 'a-f', type: 'text', props: {} }).build(),
  })
  .addStep({
    id: 'b',
    title: 'Step B',
    formConfig: form.create(r, 'b').add({ id: 'b-f', type: 'text', props: {} }).build(),
  });

function Probe() {
  const { currentStep } = useFlow();
  const { step, index, metadata } = useStep();
  const data = useFlowData();
  return (
    <output data-testid="probe">{`${currentStep.id}|${step.title}|${index}|${metadata.hero}|${Object.keys(data).length}`}</output>
  );
}

function StepProbe() {
  const { step, index, metadata } = useStep();
  return (
    <output data-testid="step-probe">{`${step.id}|${index}|${JSON.stringify(metadata)}`}</output>
  );
}

const OLD_HOOK_NAMES = [
  'useWorkflowContext',
  'useWorkflowAllData',
  'useWorkflowStepData',
  'useWorkflowActions',
  'useWorkflowStore',
  'useWorkflowStoreApi',
  'useCurrentStepIndex',
  'useWorkflowNavigationState',
  'useWorkflowSubmitState',
  'useWorkflowSubmitting',
  'useWorkflowTransitioning',
  'useWorkflowInitializing',
] as const;

describe('useFlow* family', () => {
  it('exposes flow context, current step and data', () => {
    render(
      <Flow of={wf}>
        <Probe />
      </Flow>
    );
    expect(screen.getByTestId('probe').textContent).toBe('a|Step A|0|yes|0');
  });

  it('useStep reflects the active step and defaults metadata to {}', () => {
    render(
      <Flow of={wf} defaultStep="b">
        <StepProbe />
      </Flow>
    );
    expect(screen.getByTestId('step-probe').textContent).toBe('b|1|{}');
  });

  it('old names are gone from the public surface', async () => {
    const mod = await import('@rilaykit/workflow');
    for (const oldName of OLD_HOOK_NAMES) {
      expect(oldName in mod, oldName).toBe(false);
    }
  });
});
