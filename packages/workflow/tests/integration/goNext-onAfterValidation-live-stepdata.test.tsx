import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * Bug (sibling of the round-6 submission staleness): goNext() passed the
 * render-time `workflowState.stepData` snapshot as the FIRST positional arg to
 * `onAfterValidation`. WorkflowProvider.handleSubmit writes the structured form
 * values via setStepData(values) then synchronously calls goNext() in the same
 * tick — no React commit between — so the snapshot is pre-submit: it holds only
 * the incrementally-changed fields (flat repeatable composite keys) and is
 * MISSING untouched default-valued fields. The live store (getAllData()) has the
 * correct structured slice. The fix reads the live current-step slice, mirroring
 * the round-6 submission fix.
 */

let config: ReturnType<typeof buildRil>;

function buildRil() {
  return ril.create().component('input', {
    name: 'Text Input',
    renderer: MockInput,
  });
}

describe('goNext passes the live current-step slice to onAfterValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config = buildRil();
  });

  it('includes untouched default-valued fields in the onAfterValidation stepData arg', async () => {
    let capturedStepData: Record<string, unknown> | undefined;

    const workflowConfig = flow
      .create(config, 'goNext-live-defaults-flow', 'goNext Live Defaults Flow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: form
          .create(config)
          .add({ id: 'a', type: 'input', props: { label: 'A' } })
          .add({ id: 'b', type: 'input', props: { label: 'B' } }),
        onAfterValidation: (values) => {
          capturedStepData = values;
        },
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: form.create(config).add({
          id: 'c',
          type: 'input',
          props: { label: 'C' },
        }),
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={{ step1: { a: 'x' } }}>
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('input-b')).toBeInTheDocument();
    });

    // Change ONLY field b; leave field a at its default ('x').
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: 'y' } });

    // Submit step 1 -> handleSubmit writes values then goNext() same-tick.
    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(capturedStepData).toBeDefined();
    });

    // Must include the untouched default `a`, not just the changed `b`.
    expect(capturedStepData).toEqual({ a: 'x', b: 'y' });
  });

  it('exposes structured repeatable data (not flat composite keys) to onAfterValidation', async () => {
    let capturedStepData: Record<string, unknown> | undefined;

    const workflowConfig = flow
      .create(config, 'goNext-live-repeatable-flow', 'goNext Live Repeatable Flow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: form.create(config).addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'input', props: { label: 'Name' } })
            .min(1)
            .defaultValue({ name: '' })
        ),
        onAfterValidation: (values) => {
          capturedStepData = values;
        },
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: form.create(config).add({
          id: 'c',
          type: 'input',
          props: { label: 'C' },
        }),
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-items[k0].name'), {
      target: { value: 'Widget' },
    });

    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(capturedStepData).toBeDefined();
    });

    expect(capturedStepData).toEqual({ items: [{ name: 'Widget' }] });
  });
});
