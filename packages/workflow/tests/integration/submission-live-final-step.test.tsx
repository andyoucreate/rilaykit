import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider } from '../../src/react';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * Bug: submitWorkflow read the render-time `workflowState.allData` snapshot for
 * the completion payload. On the FINAL step, WorkflowProvider.handleSubmit
 * writes the structured form values into the store then synchronously calls
 * submitWorkflow() in the same tick — no React commit between — so the snapshot
 * is pre-submit: the final step's slice holds flat repeatable composite keys
 * (`items[k0].name`) instead of the structured `{ items: [{ name }] }`, and
 * untouched default-valued fields are missing.
 */

let config: ReturnType<typeof buildRil>;

function buildRil() {
  return ril.create().component('input', {
    name: 'Text Input',
    renderer: MockInput,
  });
}

describe('Workflow submission reads live store for the final-step completion payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config = buildRil();
  });

  it('delivers the final step slice as structured data, not flat composite keys', async () => {
    const workflowConfig = flow
      .create(config, 'live-submission-flow', 'Live Submission Flow')
      .addStep({
        id: 'first',
        title: 'First',
        formConfig: form.create(config).add({
          id: 'alpha',
          type: 'input',
          props: { label: 'Alpha' },
        }),
      })
      .addStep({
        id: 'final',
        title: 'Final',
        formConfig: form.create(config).addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'input', props: { label: 'Name' } })
            .min(1)
            .defaultValue({ name: '' })
        ),
      })
      .build();

    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    // Advance to the final step.
    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
    });

    // Fill the final step's repeatable item via the form.
    fireEvent.change(screen.getByTestId('input-items[k0].name'), {
      target: { value: 'Widget' },
    });

    // Submit on the final step.
    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const completionData = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(completionData.final).toEqual({ items: [{ name: 'Widget' }] });
  });

  it('includes untouched default-valued final-step fields in the completion payload', async () => {
    const workflowConfig = flow
      .create(config, 'live-submission-defaults-flow', 'Live Submission Defaults Flow')
      .addStep({
        id: 'first',
        title: 'First',
        formConfig: form.create(config).add({
          id: 'alpha',
          type: 'input',
          props: { label: 'Alpha' },
        }),
      })
      .addStep({
        id: 'final',
        title: 'Final',
        formConfig: form.create(config).addRepeatable('items', (r) =>
          r
            .add(
              { id: 'name', type: 'input', props: { label: 'Name' } },
              { id: 'sku', type: 'input', props: { label: 'SKU' } }
            )
            .min(1)
            .defaultValue({ name: '', sku: 'DEFAULT-SKU' })
        ),
      })
      .build();

    const onWorkflowComplete = vi.fn();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <FlowBody />
        <NextButton testId="next-button" />
      </WorkflowProvider>
    );

    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
    });

    // Only touch `name`; `sku` keeps its untouched default value.
    fireEvent.change(screen.getByTestId('input-items[k0].name'), {
      target: { value: 'Gadget' },
    });

    fireEvent.click(screen.getByTestId('next-button'));

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const completionData = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(completionData.final).toEqual({
      items: [{ name: 'Gadget', sku: 'DEFAULT-SKU' }],
    });
  });
});
