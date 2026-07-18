import { ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';
import { type FlowSchema, compileFlow } from '../../src/schema';
import { MockInput } from '../_helpers/mock-components';
import { NextButton } from '../_helpers/nav-buttons';

/**
 * Hunt R11 finding A1 — a conditionally-hidden STEP's compiled `default` must
 * NOT land in the `onWorkflowComplete` payload.
 *
 * The store seeds every step's defaults into `allData` at creation, visibility
 * notwithstanding; the completion payload used to ship `allData` verbatim. A
 * non-US user therefore delivered `shipping.shipExpress: 'express-please'` —
 * an answer to a question they were never asked, byte-identical to what a US
 * user who confirmed the step produces.
 *
 * The CONTROL pins the other half of the contract: a user who SEES the step
 * still ships its untouched default.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockInput,
  });
}

// The hunter's A1 repro schema: step `shipping` visible only when
// `locale.country == 'US'`, holding a defaulted field.
const schema: FlowSchema = {
  version: 1,
  id: 'checkout-flow',
  name: 'Checkout',
  steps: [
    {
      id: 'locale',
      title: 'Locale',
      form: {
        version: 1,
        id: 'locale-form',
        fields: [{ id: 'country', type: 'text', props: { label: 'Country' } }],
      },
    },
    {
      id: 'shipping',
      title: 'Shipping',
      conditions: {
        visible: { field: 'locale.country', operator: 'equals', value: 'US' },
      },
      form: {
        version: 1,
        id: 'shipping-form',
        fields: [
          {
            id: 'shipExpress',
            type: 'text',
            props: { label: 'Express shipping' },
            default: 'express-please',
          },
        ],
      },
    },
    {
      id: 'confirm',
      title: 'Confirm',
      form: {
        version: 1,
        id: 'confirm-form',
        fields: [{ id: 'notes', type: 'text', props: { label: 'Notes' } }],
      },
    },
  ],
};

function StepIndicator() {
  const { currentStep } = useFlow();
  return <output data-testid="step">{currentStep?.id ?? 'none'}</output>;
}

function renderFlow(onWorkflowComplete: (data: Record<string, unknown>) => void) {
  const catalog = makeCatalog();
  const { workflowConfig, defaultValues } = compileFlow(schema, catalog);

  render(
    <WorkflowProvider
      workflowConfig={workflowConfig}
      defaultValues={defaultValues}
      onWorkflowComplete={onWorkflowComplete}
    >
      <StepIndicator />
      <FlowBody />
      <NextButton testId="next" />
    </WorkflowProvider>
  );
}

describe('hidden step defaults must not ship in the completion payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A1: a conditionally-hidden step is ABSENT from onWorkflowComplete', async () => {
    const onWorkflowComplete = vi.fn();
    renderFlow(onWorkflowComplete);

    await waitFor(() => {
      expect(screen.getByTestId('step')).toHaveTextContent('locale');
    });

    // Non-US user: the shipping step must never render.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => {
      expect(screen.getByTestId('step')).toHaveTextContent('confirm');
    });
    expect(screen.queryByTestId('input-shipExpress')).toBeNull();

    fireEvent.change(screen.getByTestId('input-notes'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const completionData = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    // The step the user never reached must not enter the payload at all.
    expect(completionData).not.toHaveProperty('shipping');
    expect(completionData.locale).toEqual({ country: 'FR' });
    expect(completionData.confirm).toEqual({ notes: 'hi' });
  });

  it('CONTROL: a US user who SEES the shipping step ships its untouched default', async () => {
    const onWorkflowComplete = vi.fn();
    renderFlow(onWorkflowComplete);

    await waitFor(() => {
      expect(screen.getByTestId('step')).toHaveTextContent('locale');
    });

    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'US' } });
    fireEvent.click(screen.getByTestId('next'));

    // The shipping step renders, prefilled with its compiled default.
    await waitFor(() => {
      expect(screen.getByTestId('step')).toHaveTextContent('shipping');
    });
    expect(screen.getByTestId('input-shipExpress')).toHaveValue('express-please');

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => {
      expect(screen.getByTestId('step')).toHaveTextContent('confirm');
    });

    fireEvent.change(screen.getByTestId('input-notes'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const completionData = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    // The untouched default of a step the user confirmed IS a real answer.
    expect(completionData.shipping).toEqual({ shipExpress: 'express-please' });
    expect(completionData.locale).toEqual({ country: 'US' });
    expect(completionData.confirm).toEqual({ notes: 'hi' });
  });
});
