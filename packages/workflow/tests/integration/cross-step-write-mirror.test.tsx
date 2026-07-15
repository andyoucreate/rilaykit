import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * A cross-step write from the LAST step: the one path with no navigation
 * behind it to heal the current step's mirror.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

function Harness() {
  const { currentStep, workflowState, goNext } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <output data-testid="stepdata">{JSON.stringify(workflowState.stepData)}</output>
      <output data-testid="alldata">{JSON.stringify(workflowState.allData)}</output>
      <button type="submit" data-testid="form-next">
        form next
      </button>
      {/* On the LAST step the form's submit completes the workflow outright;
          `goNext` is the path that runs onAfterValidation and then finds no
          next visible step — the one with no navigation behind it. */}
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <FlowBody />
    </div>
  );
}

function buildFlow() {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'one',
      title: 'One',
      formConfig: form.create(catalog, 'one-form').add({ id: 'a', type: 'text', props: {} }),
    })
    .addStep({
      id: 'two',
      title: 'Two',
      formConfig: form.create(catalog, 'two-form').add({ id: 'b', type: 'text', props: {} }),
      // The last step: `goNext` runs this, finds no next visible step and
      // returns false, so no navigation re-seeds the mirror afterwards.
      onAfterValidation: (_data, helper) => {
        helper.setStepFields('one', { computed: 'from-two' });
      },
    })
    .build();
}

describe('a cross-step write from the last step', () => {
  it('records the write in allData without corrupting the current step mirror', async () => {
    render(
      <WorkflowProvider
        workflowConfig={buildFlow()}
        defaultValues={{ one: { a: 'A' }, two: { b: 'B' } }}
      >
        <Harness />
      </WorkflowProvider>
    );

    fireEvent.click(screen.getByTestId('form-next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('two'));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('alldata').textContent ?? '{}').one).toEqual({
        a: 'A',
        computed: 'from-two',
      })
    );

    // Still on the last step, and its mirror still describes IT.
    expect(screen.getByTestId('step').textContent).toBe('two');
    expect(JSON.parse(screen.getByTestId('stepdata').textContent ?? '{}')).toEqual({ b: 'B' });
  });
});
