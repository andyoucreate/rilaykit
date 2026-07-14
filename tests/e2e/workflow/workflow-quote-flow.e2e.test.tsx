/**
 * =============================================================================
 * FLAGSHIP E2E — "Quote flow": a realistic 3-step Flow composing every
 * subsystem at once (select + async Standard-Schema validation gating submit,
 * cross-step prefill via onAfterValidation/setNextStepFields, a repeatable
 * group with per-item required validation, and the exact namespaced
 * completion payload).
 *
 * It proves, end-to-end through the real stores/registry (never mocked):
 *   1. Async coupon validation GATES Flow.Next — an invalid coupon ('TAKEN')
 *      cannot advance the step; correcting it advances.
 *   2. onAfterValidation prefills the NEXT step's field from THIS step's data.
 *   3. Repeatable seats survive as a STRUCTURED array (not flat composite keys).
 *   4. onComplete receives the exact payload, namespaced by step id.
 * =============================================================================
 */
import { async as asyncValidator, required } from '@rilaykit/core';
import { useRepeatableField } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { Flow, ril } from 'rilaykit';
import { describe, expect, it, vi } from 'vitest';
import { MockSelectInput, MockTextInput } from '../_setup/test-helpers';

// A real (non-mocked) ~50ms async delay so the coupon validator exercises the
// genuine async validation path that gates submit().
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createQuoteCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
    .component('select', {
      name: 'Select',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    });
}

// Seat controls live inside the flow's form context (the form store spans the
// whole Flow), so useRepeatableField('seats') binds to the active step form.
function SeatControls() {
  const { count, append, canAdd } = useRepeatableField('seats');
  return (
    <div>
      <span data-testid="seat-count">{count}</span>
      <button type="button" data-testid="add-seat" onClick={() => append()} disabled={!canAdd}>
        Add seat
      </button>
    </div>
  );
}

function NextBtn() {
  return (
    <Flow.Next>
      {({ go, submitting }) => (
        <button type="button" data-testid="next" onClick={go} disabled={submitting}>
          Next
        </button>
      )}
    </Flow.Next>
  );
}

describe('Flagship — quote flow (every subsystem at once)', () => {
  it('gates async validation, prefills across steps, and completes with the exact namespaced payload', async () => {
    const catalog = createQuoteCatalog();

    const planForm = catalog
      .form('plan')
      .add({
        id: 'plan',
        type: 'select',
        props: {
          label: 'Plan',
          options: [
            { value: 'basic', label: 'Basic' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      })
      .add({
        id: 'coupon',
        type: 'text',
        props: { label: 'Coupon' },
        validation: {
          validate: asyncValidator<string>(async (v) => {
            await delay(50);
            return v !== 'TAKEN';
          }, 'Coupon already taken'),
        },
      });

    const detailsForm = catalog
      .form('details')
      .add({ id: 'contactName', type: 'text', props: { label: 'Contact name' } })
      .addRepeatable('seats', (r) =>
        r
          .add({
            id: 'name',
            type: 'text',
            props: { label: 'Seat name' },
            validation: { validate: required('Seat name is required') },
          })
          .min(1)
          .defaultValue({ name: '' })
      );

    const reviewForm = catalog
      .form('review')
      .add({ id: 'signature', type: 'text', props: { label: 'Signature' } });

    const quoteFlow = catalog
      .flow('quote', 'Quote flow')
      .step({
        id: 'plan',
        title: 'Plan',
        formConfig: planForm.build(),
        onAfterValidation: (values, helper) => {
          helper.setNextStepFields({ contactName: `Hi ${values.plan}` });
        },
      })
      .step({ id: 'details', title: 'Details', formConfig: detailsForm.build() })
      .step({ id: 'review', title: 'Review', formConfig: reviewForm.build() })
      .build();

    const onComplete = vi.fn();

    render(
      <Flow of={quoteFlow} onComplete={onComplete}>
        <Flow.Body />
        <SeatControls />
        <NextBtn />
      </Flow>
    );

    // --- Step 1: choose Pro plan, enter a TAKEN coupon ---
    await waitFor(() => {
      expect(screen.getByTestId('input-plan')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-plan'), { target: { value: 'pro' } });
    fireEvent.change(screen.getByTestId('input-coupon'), { target: { value: 'TAKEN' } });

    await waitFor(() => {
      expect(screen.getByTestId('input-plan')).toHaveValue('pro');
      expect(screen.getByTestId('input-coupon')).toHaveValue('TAKEN');
    });

    // Attempt to advance — the async validator rejects 'TAKEN', so submit() is
    // gated and the flow stays on step 1 (the plan select proves non-advance).
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    // Let the async submit fully settle: the button re-enables once the 50ms
    // validator resolves and submit() returns without navigating.
    await waitFor(() => {
      expect(screen.getByTestId('next')).not.toBeDisabled();
    });
    // Still on step 1: the coupon input is still mounted, details field is not.
    expect(screen.getByTestId('input-coupon')).toBeInTheDocument();
    expect(screen.queryByTestId('input-contactName')).not.toBeInTheDocument();

    // --- Correct the coupon, advance to step 2 ---
    fireEvent.change(screen.getByTestId('input-coupon'), { target: { value: 'SAVE10' } });
    await waitFor(() => {
      expect(screen.getByTestId('input-coupon')).toHaveValue('SAVE10');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    // Step 2 mounted — contactName PREFILLED by onAfterValidation ('Hi pro').
    await waitFor(() => {
      expect(screen.getByTestId('input-contactName')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-contactName')).toHaveValue('Hi pro');

    // Repeatable seats: min 1 → one seat present. Add a second.
    await waitFor(() => {
      expect(screen.getByTestId('seat-count')).toHaveTextContent('1');
    });
    fireEvent.change(screen.getByTestId('input-seats[k0].name'), { target: { value: 'Alice' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-seat'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('seat-count')).toHaveTextContent('2');
    });
    fireEvent.change(screen.getByTestId('input-seats[k1].name'), { target: { value: 'Bob' } });

    await waitFor(() => {
      expect(screen.getByTestId('input-seats[k0].name')).toHaveValue('Alice');
      expect(screen.getByTestId('input-seats[k1].name')).toHaveValue('Bob');
    });

    // Advance to step 3 (repeatable required validation passes: both filled).
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-signature')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('input-signature'), { target: { value: 'Neo' } });
    await waitFor(() => {
      expect(screen.getByTestId('input-signature')).toHaveValue('Neo');
    });

    // --- Complete ---
    await act(async () => {
      fireEvent.click(screen.getByTestId('next'));
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    // EXACT payload: namespaced by step id; repeatable seats is a STRUCTURED
    // array of objects (never flat composite keys); prefill survived across steps.
    expect(onComplete).toHaveBeenCalledWith({
      plan: { plan: 'pro', coupon: 'SAVE10' },
      details: {
        contactName: 'Hi pro',
        seats: [{ name: 'Alice' }, { name: 'Bob' }],
      },
      review: { signature: 'Neo' },
    });
  });
});
