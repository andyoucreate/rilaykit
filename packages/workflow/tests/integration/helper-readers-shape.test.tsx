import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';

/**
 * ONE callback invocation speaks ONE shape.
 *
 * `onAfterValidation` is handed its step's data as a structured `data` param;
 * the `StepDataHelper` it is handed alongside read the store raw, so the same
 * host callback saw the same step in two representations at once — and the
 * documented round-trip idiom
 * `helper.setStepData(id, {...helper.getStepData(id), extra: 1})` mixed them.
 * The helper's readers are host boundaries exactly as the param is.
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
  const { currentStep } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="submit" data-testid="form-next">
        form next
      </button>
      <FlowBody />
    </div>
  );
}

const AUTHORED_SLICE = { lines: [{ label: 'alpha' }] };

function buildFlow(onAfterValidation: (data: any, helper: any) => void) {
  return flow
    .create(catalog, 'wf', 'Order')
    .addStep({
      id: 'items',
      title: 'Items',
      formConfig: form
        .create(catalog, 'items-form')
        .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
      onAfterValidation,
    })
    .addStep({
      id: 'review',
      title: 'Review',
      formConfig: form.create(catalog, 'review-form').add({ id: 'note', type: 'text', props: {} }),
    })
    .build();
}

async function advance() {
  await waitFor(() => expect(screen.getByTestId('lines[k0].label')).toBeTruthy());
  fireEvent.click(screen.getByTestId('form-next'));
  await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('review'));
}

describe('StepDataHelper readers — the same shape as the data param', () => {
  it('structures getStepData and getAllData', async () => {
    const seen: Array<Record<string, unknown>> = [];

    render(
      <WorkflowProvider
        workflowConfig={buildFlow((data, helper) => {
          seen.push({
            param: structuredClone(data),
            viaHelper: structuredClone(helper.getStepData('items')),
            viaAll: structuredClone(helper.getAllData().items),
          });
        })}
        defaultValues={{ items: AUTHORED_SLICE }}
      >
        <Harness />
      </WorkflowProvider>
    );

    await advance();

    expect(seen).toHaveLength(1);
    expect(seen[0].param).toEqual(AUTHORED_SLICE);
    expect(seen[0].viaHelper).toEqual(seen[0].param);
    expect(seen[0].viaAll).toEqual(AUTHORED_SLICE);
  });

  it('keeps the read/write round trip shape-preserving', async () => {
    let roundTripped: Record<string, unknown> | undefined;

    render(
      <WorkflowProvider
        workflowConfig={buildFlow((_data, helper) => {
          // The documented idiom: read a slice, add to it, write it back.
          helper.setStepData('items', { ...helper.getStepData('items'), note: 'added' });
          roundTripped = structuredClone(helper.getStepData('items'));
        })}
        defaultValues={{ items: AUTHORED_SLICE }}
      >
        <Harness />
      </WorkflowProvider>
    );

    await advance();

    // The row survives the round trip as ONE row in the authored shape — it is
    // neither duplicated into a second representation nor lost.
    expect(roundTripped).toEqual({ lines: [{ label: 'alpha' }], note: 'added' });
  });
});
