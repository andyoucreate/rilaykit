import { required, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { FormBody, FormProvider } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  FormStateDisplay,
  SetValueButton,
  SubmitButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// DEEP CONDITIONAL VISIBILITY + conditional-required + submit-payload filtering
// ----------------------------------------------------------------------------
// One complex form family exercised across many intersecting scenarios.
// ============================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createTestRilConfig();
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Type into a Mock text input by field id. */
function typeText(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}

/** Choose an option in a Mock select input by field id. */
function selectOption(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}

/** Toggle a Mock checkbox input by field id to a desired checked state. */
function setCheckbox(id: string, checked: boolean) {
  const el = screen.getByTestId(`input-${id}`) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}

/**
 * A 4-level AND-chain: A controls B, {A,B} control C, {A,B,C} control D.
 * Each deeper level ANDs its parent's value on top of the ancestors, so the
 * chain both cascades open level-by-level and fully COLLAPSES the instant A
 * resets (every deeper condition still requires A === 'l1').
 */
function buildChainForm() {
  return form
    .create(rilConfig, 'deep-chain')
    .add({
      id: 'a',
      type: 'select',
      props: {
        label: 'A',
        options: [
          { value: '', label: '-- none --' },
          { value: 'l1', label: 'Level 1' },
          { value: 'stop', label: 'Stop' },
        ],
      },
    })
    .add({
      id: 'b',
      type: 'text',
      props: { label: 'B' },
      conditions: {
        visible: when('a').equals('l1'),
      },
    })
    .add({
      id: 'c',
      type: 'text',
      props: { label: 'C' },
      conditions: {
        visible: when('a').equals('l1').and(when('b').equals('go')),
      },
    })
    .add({
      id: 'd',
      type: 'text',
      props: { label: 'D' },
      conditions: {
        visible: when('a').equals('l1').and(when('b').equals('go')).and(when('c').equals('go')),
      },
    })
    .build();
}

// ============================================================================
// 1. DEEP VISIBILITY CHAIN (A -> B -> C -> D)
// ============================================================================

describe('deep visibility chain A -> B -> C -> D', () => {
  it('cascades open one level at a time', async () => {
    render(
      <FormProvider formConfig={buildChainForm()} defaultValues={{}}>
        <FormBody />
      </FormProvider>
    );

    // Only A is visible initially.
    expect(screen.getByTestId('field-a')).toBeInTheDocument();
    expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-d')).not.toBeInTheDocument();

    // A = l1 -> B appears, C/D stay hidden.
    await act(async () => selectOption('a', 'l1'));
    await waitFor(() => expect(screen.getByTestId('field-b')).toBeInTheDocument());
    expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-d')).not.toBeInTheDocument();

    // B = go -> C appears, D stays hidden.
    await act(async () => typeText('b', 'go'));
    await waitFor(() => expect(screen.getByTestId('field-c')).toBeInTheDocument());
    expect(screen.queryByTestId('field-d')).not.toBeInTheDocument();

    // C = go -> D appears.
    await act(async () => typeText('c', 'go'));
    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());
  });

  it('collapses deeper levels when an intermediate value changes', async () => {
    render(
      <FormProvider formConfig={buildChainForm()} defaultValues={{ a: 'l1', b: 'go', c: 'go' }}>
        <FormBody />
      </FormProvider>
    );

    // Whole chain open from defaults.
    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());
    expect(screen.getByTestId('field-c')).toBeInTheDocument();

    // Change B away from 'go' -> C AND D both collapse (both AND on b === 'go').
    await act(async () => typeText('b', 'nope'));
    await waitFor(() => {
      expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-d')).not.toBeInTheDocument();
    });
    // B itself still visible (only depends on A).
    expect(screen.getByTestId('field-b')).toBeInTheDocument();

    // Restore B -> C reappears; D reappears only because C still holds 'go'.
    await act(async () => typeText('b', 'go'));
    await waitFor(() => {
      expect(screen.getByTestId('field-c')).toBeInTheDocument();
      expect(screen.getByTestId('field-d')).toBeInTheDocument();
    });
  });

  it('collapses the WHOLE chain when A resets', async () => {
    render(
      <FormProvider formConfig={buildChainForm()} defaultValues={{ a: 'l1', b: 'go', c: 'go' }}>
        <FormBody />
      </FormProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());

    // Reset A -> B, C, D all disappear at once.
    await act(async () => selectOption('a', ''));
    await waitFor(() => {
      expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-d')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('field-a')).toBeInTheDocument();

    // Set A to a non-matching value -> still fully collapsed.
    await act(async () => selectOption('a', 'stop'));
    await waitFor(() => expect(screen.queryByTestId('field-b')).not.toBeInTheDocument());
  });
});

// ============================================================================
// 2. CONDITIONAL REQUIRED GATED BY VISIBILITY
// ============================================================================

/**
 * `invoiceEmail` is both VISIBLE and REQUIRED only when `wantsInvoice` is on.
 * When off it is neither shown nor enforced.
 */
function buildConditionalRequiredForm() {
  return form
    .create(rilConfig, 'cond-required')
    .add({ id: 'wantsInvoice', type: 'checkbox', props: { label: 'Wants invoice' } })
    .add({
      id: 'invoiceEmail',
      type: 'text',
      props: { label: 'Invoice email' },
      conditions: {
        visible: when('wantsInvoice').equals(true),
        required: when('wantsInvoice').equals(true),
      },
    })
    .build();
}

describe('conditional required gated by visibility', () => {
  it('does NOT block submit when the controller is off (field hidden)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildConditionalRequiredForm()}
        defaultValues={{ wantsInvoice: false, invoiceEmail: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
      </FormProvider>
    );

    // Field is hidden.
    expect(screen.queryByTestId('field-invoiceEmail')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    // Hidden + empty required field does not block submit.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The hidden field's value is filtered out of the payload.
    expect(onSubmit.mock.calls[0][0]).toEqual({ wantsInvoice: false });
  });

  it('BLOCKS submit when visible + empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildConditionalRequiredForm()}
        defaultValues={{ wantsInvoice: false, invoiceEmail: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
        <FieldErrorDisplay id="invoiceEmail" />
      </FormProvider>
    );

    // Turn the controller on -> field appears and becomes required.
    await act(async () => setCheckbox('wantsInvoice', true));
    await waitFor(() => expect(screen.getByTestId('field-invoiceEmail')).toBeInTheDocument());

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    await waitFor(() => {
      expect(screen.getByTestId('errors-invoiceEmail')).toBeInTheDocument();
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits when visible + filled', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildConditionalRequiredForm()}
        defaultValues={{ wantsInvoice: false, invoiceEmail: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    await act(async () => setCheckbox('wantsInvoice', true));
    await waitFor(() => expect(screen.getByTestId('field-invoiceEmail')).toBeInTheDocument());
    await act(async () => typeText('invoiceEmail', 'a@b.com'));

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ wantsInvoice: true, invoiceEmail: 'a@b.com' });
  });
});

// ============================================================================
// 3. REPEATABLE ROWS + GLOBAL FIELD FEEDING PER-ROW VISIBILITY
// ============================================================================

/**
 * A GLOBAL `shipping` toggle feeds every row's `tracking` visibility, and each
 * row's own `type` feeds that same row's `weight` (intra-item scope).
 */
function buildRepeatableForm() {
  return form
    .create(rilConfig, 'repeatable-cond')
    .add({
      id: 'shipping',
      type: 'select',
      props: {
        label: 'Shipping',
        options: [
          { value: '', label: '-- none --' },
          { value: 'tracked', label: 'Tracked' },
          { value: 'none', label: 'No tracking' },
        ],
      },
    })
    .addRepeatable('items', (r) =>
      r
        .add({
          id: 'type',
          type: 'select',
          props: {
            label: 'Type',
            options: [
              { value: '', label: 'Select...' },
              { value: 'physical', label: 'Physical' },
              { value: 'digital', label: 'Digital' },
            ],
          },
        })
        .add({
          id: 'weight',
          type: 'text',
          props: { label: 'Weight' },
          conditions: { visible: when('type').equals('physical') },
        })
        .add({
          id: 'tracking',
          type: 'text',
          props: { label: 'Tracking' },
          conditions: { visible: when('shipping').equals('tracked') },
        })
        .defaultValue({ type: '', weight: '', tracking: '' })
    )
    .build();
}

describe('repeatable rows with global + intra-item visibility', () => {
  it('global field drives per-row visibility across all rows', async () => {
    render(
      <FormProvider
        formConfig={buildRepeatableForm()}
        defaultValues={{
          shipping: 'tracked',
          items: [
            { type: 'physical', weight: '5kg', tracking: 'T1' },
            { type: 'digital', weight: '', tracking: 'T2' },
          ],
        }}
      >
        <FormBody />
        <SetValueButton id="shipping" value="none" />
      </FormProvider>
    );

    // shipping=tracked -> both rows show tracking.
    await waitFor(() => {
      expect(screen.getByTestId('field-items[k0].tracking')).toBeInTheDocument();
      expect(screen.getByTestId('field-items[k1].tracking')).toBeInTheDocument();
    });
    // Intra-item: only the physical row shows weight.
    expect(screen.getByTestId('field-items[k0].weight')).toBeInTheDocument();
    expect(screen.queryByTestId('field-items[k1].weight')).not.toBeInTheDocument();

    // Flip global to 'none' -> tracking disappears in EVERY row.
    await act(async () => fireEvent.click(screen.getByTestId('set-shipping')));
    await waitFor(() => {
      expect(screen.queryByTestId('field-items[k0].tracking')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-items[k1].tracking')).not.toBeInTheDocument();
    });
    // weight unaffected by the global toggle.
    expect(screen.getByTestId('field-items[k0].weight')).toBeInTheDocument();
  });

  it('drops hidden per-row fields from the submit payload, re-includes when shown', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildRepeatableForm()}
        defaultValues={{
          shipping: 'none',
          items: [{ type: 'digital', weight: 'STALE', tracking: 'STALE' }],
        }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <SetValueButton id="shipping" value="tracked" />
      </FormProvider>
    );

    // shipping=none & type=digital -> both weight and tracking hidden.
    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Hidden per-row fields dropped; only the visible `type` survives in the row.
    expect(onSubmit.mock.calls[0][0]).toEqual({
      shipping: 'none',
      items: [{ type: 'digital' }],
    });

    // Reveal tracking by flipping the global -> its value ships again.
    await act(async () => fireEvent.click(screen.getByTestId('set-shipping')));
    await waitFor(() => expect(screen.getByTestId('field-items[k0].tracking')).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual({
      shipping: 'tracked',
      items: [{ type: 'digital', tracking: 'STALE' }],
    });
  });

  it('drops a WHOLE repeatable whose entire template is hidden from the payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const config = form
      .create(rilConfig, 'whole-hidden-repeatable')
      .add({ id: 'wantsExtras', type: 'checkbox', props: { label: 'Extras' } })
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('extras', (r) =>
        r
          .add({
            id: 'label',
            type: 'text',
            props: { label: 'Label' },
            conditions: { visible: when('wantsExtras').equals(true) },
          })
          .defaultValue({ label: '' })
      )
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{
          wantsExtras: false,
          title: 'Order',
          extras: [{ label: 'ghost' }],
        }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The whole `extras` repeatable has no visible template field -> dropped
    // entirely (not surfaced as an empty array key).
    expect(onSubmit.mock.calls[0][0]).toEqual({ wantsExtras: false, title: 'Order' });
    expect('extras' in onSubmit.mock.calls[0][0]).toBe(false);
  });
});

// ============================================================================
// 4. SUBMIT PAYLOAD FILTERING ON THE DEEP CHAIN
// ============================================================================

describe('submit payload filtering on the deep chain', () => {
  it('drops the collapsed tail of the chain from the payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildChainForm()}
        defaultValues={{ a: 'l1', b: 'go', c: 'go', d: 'deep' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());

    // Collapse the tail: B away from 'go' hides C and D (their store values persist).
    await act(async () => typeText('b', 'closed'));
    await waitFor(() => expect(screen.queryByTestId('field-c')).not.toBeInTheDocument());

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // c and d were hidden at submit time -> dropped, even though their values
    // ('go' / 'deep') still live in the store.
    expect(onSubmit.mock.calls[0][0]).toEqual({ a: 'l1', b: 'closed' });
  });

  it('re-includes a value when its field becomes visible again', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildChainForm()}
        defaultValues={{ a: 'l1', b: 'go', c: 'go', d: 'deep' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());

    // Hide the tail, then re-reveal it unchanged.
    await act(async () => typeText('b', 'closed'));
    await waitFor(() => expect(screen.queryByTestId('field-d')).not.toBeInTheDocument());
    await act(async () => typeText('b', 'go'));
    await waitFor(() => expect(screen.getByTestId('field-d')).toBeInTheDocument());

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Full chain visible again -> preserved store values re-included.
    expect(onSubmit.mock.calls[0][0]).toEqual({ a: 'l1', b: 'go', c: 'go', d: 'deep' });
  });
});

// ============================================================================
// 5. RAPID TOGGLING — no stale value / error wedges isValid
// ============================================================================

/** A field with base required() validation, visible only when its toggle is on. */
function buildToggledRequiredForm() {
  return form
    .create(rilConfig, 'toggled-required')
    .add({ id: 'show', type: 'checkbox', props: { label: 'Show' } })
    .add({
      id: 'name',
      type: 'text',
      props: { label: 'Name' },
      validation: { validate: required('Name is required') },
      conditions: { visible: when('show').equals(true) },
    })
    .build();
}

describe('rapid toggling keeps isValid clean', () => {
  it('on -> off -> on with a valid value leaves no stale error and isValid true', async () => {
    render(
      <FormProvider
        formConfig={buildToggledRequiredForm()}
        defaultValues={{ show: true, name: '' }}
      >
        <FormBody />
        <ValidationTrigger />
        <FieldErrorDisplay id="name" />
        <FormStateDisplay />
      </FormProvider>
    );

    // Fill a valid value while shown, validate -> ok.
    await act(async () => typeText('name', 'Alice'));
    await act(async () => fireEvent.click(screen.getByTestId('validate-btn')));
    await waitFor(() => expect(screen.getByTestId('validation-valid')).toHaveTextContent('true'));

    // Rapidly toggle off -> on -> off -> on. Value 'Alice' persists in the store.
    await act(async () => {
      setCheckbox('show', false);
      setCheckbox('show', true);
      setCheckbox('show', false);
      setCheckbox('show', true);
    });

    await waitFor(() => expect(screen.getByTestId('field-name')).toBeInTheDocument());
    // Value survived the churn.
    expect(screen.getByTestId('input-name')).toHaveValue('Alice');

    // Re-validate -> still valid, no stale error resurrected.
    await act(async () => fireEvent.click(screen.getByTestId('validate-btn')));
    await waitFor(() => expect(screen.getByTestId('validation-valid')).toHaveTextContent('true'));
    expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();
  });

  it('an error raised while visible does not wedge submit once the field is hidden', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildToggledRequiredForm()}
        defaultValues={{ show: true, name: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FieldErrorDisplay id="name" />
        <FormStateDisplay />
      </FormProvider>
    );

    // Submit while visible + empty -> blocked with a required error.
    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => {
      expect(screen.getByTestId('errors-name')).toBeInTheDocument();
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Hide the field WHILE it holds the error, then submit again.
    await act(async () => setCheckbox('show', false));
    await waitFor(() => expect(screen.queryByTestId('field-name')).not.toBeInTheDocument());

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    // The now-invisible field's error must not wedge the form.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ show: false });
    await waitFor(() => expect(screen.getByTestId('is-valid')).toHaveTextContent('true'));
    // The stale error is gone from the UI.
    expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 6. CONDITIONAL REQUIRED *INSIDE* REPEATABLE ROWS (per-row scoped)
// ============================================================================

/**
 * Per-row `qty` is required only when THAT row's `type` is 'physical', and is
 * only visible then too. The condition must scope to the row's own key, not
 * leak across rows.
 */
function buildRepeatableRequiredForm() {
  return form
    .create(rilConfig, 'repeatable-required')
    .addRepeatable('items', (r) =>
      r
        .add({
          id: 'type',
          type: 'select',
          props: {
            label: 'Type',
            options: [
              { value: '', label: 'Select...' },
              { value: 'physical', label: 'Physical' },
              { value: 'digital', label: 'Digital' },
            ],
          },
        })
        .add({
          id: 'qty',
          type: 'text',
          props: { label: 'Qty' },
          conditions: {
            visible: when('type').equals('physical'),
            required: when('type').equals('physical'),
          },
        })
        .defaultValue({ type: '', qty: '' })
    )
    .build();
}

describe('conditional required inside repeatable rows', () => {
  it('blocks submit when a physical row leaves its required qty empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildRepeatableRequiredForm()}
        defaultValues={{
          items: [
            { type: 'physical', qty: '' },
            { type: 'digital', qty: '' },
          ],
        }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FieldErrorDisplay id="items[k0].qty" />
        <FormStateDisplay />
      </FormProvider>
    );

    // Row k0 (physical) shows qty; row k1 (digital) does not.
    await waitFor(() => expect(screen.getByTestId('field-items[k0].qty')).toBeInTheDocument());
    expect(screen.queryByTestId('field-items[k1].qty')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    await waitFor(() => {
      expect(screen.getByTestId('errors-items[k0].qty')).toBeInTheDocument();
      expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not leak a row required-error across rows and submits when satisfied', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildRepeatableRequiredForm()}
        defaultValues={{
          items: [
            { type: 'physical', qty: '10' },
            { type: 'digital', qty: '' },
          ],
        }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    await waitFor(() => expect(screen.getByTestId('field-items[k0].qty')).toBeInTheDocument());

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));

    // k0 satisfies its required qty; k1 is digital so qty is neither required
    // nor shipped.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      items: [{ type: 'physical', qty: '10' }, { type: 'digital' }],
    });
  });

  it('stops enforcing a row required field once that row turns non-physical', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormProvider
        formConfig={buildRepeatableRequiredForm()}
        defaultValues={{ items: [{ type: 'physical', qty: '' }] }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FieldErrorDisplay id="items[k0].qty" />
        <FormStateDisplay />
      </FormProvider>
    );

    // Physical + empty qty -> blocked.
    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(screen.getByTestId('errors-items[k0].qty')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();

    // Switch the row to digital -> qty hidden, requirement lifted.
    await act(async () => selectOption('items[k0].type', 'digital'));
    await waitFor(() =>
      expect(screen.queryByTestId('field-items[k0].qty')).not.toBeInTheDocument()
    );

    await act(async () => fireEvent.click(screen.getByTestId('submit-btn')));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ items: [{ type: 'digital' }] });
    await waitFor(() => expect(screen.getByTestId('is-valid')).toHaveTextContent('true'));
    expect(screen.queryByTestId('errors-items[k0].qty')).not.toBeInTheDocument();
  });
});
