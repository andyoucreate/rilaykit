import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider, useFlow } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';

/**
 * PINNED CONTRACT (round 2 judgment call, behaviour deliberately UNCHANGED):
 *
 * A step callback may write a key that belongs to no form field, and that key
 * reaches onComplete. This is legitimate — `onAfterValidation` exists precisely
 * to stage derived/computed data (the live-step-visibility suite relies on it to
 * drive step conditions), and a staged key lands under its OWN step's slice, so
 * it cannot collide with or overwrite another step's payload. The payload SHAPE
 * is `{ [stepId]: { ...keys } }` either way.
 *
 * This test exists so that if the phantom key ever starts corrupting the shape
 * — leaking to the root, or clobbering a sibling step — it fails loudly.
 */
describe('a step effect may stage data that belongs to no form field', () => {
  it('delivers the staged key under its own step slice, leaving other steps intact', async () => {
    const onComplete = vi.fn();
    const config = ril.create().component('input', { name: 'Input', renderer: MockInput });

    const workflowConfig = flow
      .create(config, 'wf', 'Flow')
      .addStep({
        id: 'A',
        title: 'A',
        formConfig: form.create(config).add({ id: 'a', type: 'input', props: { label: 'A' } }),
        onAfterValidation: (_values, helper) => {
          helper.setStepFields('A', { computedTotal: 42 });
        },
      })
      .addStep({
        id: 'B',
        title: 'B',
        formConfig: form.create(config).add({ id: 'b', type: 'input', props: { label: 'B' } }),
      })
      .build();

    const Probe = () => {
      const { goNext, currentStep, submitWorkflow } = useFlow();
      return (
        <div>
          <output data-testid="step">{currentStep?.id}</output>
          <button type="button" data-testid="next" onClick={() => goNext()}>
            next
          </button>
          <button type="button" data-testid="done" onClick={() => submitWorkflow()}>
            done
          </button>
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onComplete}>
        <Probe />
      </WorkflowProvider>
    );

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('B'));

    fireEvent.click(screen.getByTestId('done'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];

    // The staged key rides in its OWN step's slice — not at the root.
    expect(payload.A.computedTotal).toBe(42);
    expect(payload.computedTotal).toBeUndefined();
    // Sibling steps are untouched by the staging.
    expect(payload.B?.computedTotal).toBeUndefined();
  });
});
