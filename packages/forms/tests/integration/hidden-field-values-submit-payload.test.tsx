import { type ComponentRenderContext, ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormField, FormProvider } from '../../src';
import { type FormSchema, compileForm } from '../../src/schema';

/**
 * Hunt R11 findings A2/A3 — the submit payload must honour the visibility
 * contract the validation layer already enforces (invisible = nonexistent):
 *
 * - A2: a `when()`-hidden field's compiled `default` (seeded into the store at
 *   mount) must NOT ship in the submit payload — the host/agent would receive
 *   an answer to a question the user was never asked, byte-identical to a real
 *   answer.
 * - A3: a field revealed, filled, then hidden again before submit must not ship
 *   its retracted value either. The value may stay in the STORE (re-reveal
 *   restores the user's typing); only the PAYLOAD excludes it.
 * - CONTROL: a VISIBLE field always ships — its untouched default, its falsy or
 *   empty value, and any field with no condition at all.
 */

const MockInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label htmlFor={id}>{String(props.label ?? id)}</label>
    <input
      id={id}
      type="text"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      data-testid={`input-${id}`}
    />
  </div>
);

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockInput,
  });
}

// The hunter's A2 repro schema: `country`, plus two fields visible only when
// `country == 'US'` — `shipExpress` (with a compiled default) and `giftWrap`
// (no default).
const schema: FormSchema = {
  version: 1,
  id: 'shipping-form',
  fields: [
    { id: 'country', type: 'text', props: { label: 'Country' } },
    {
      id: 'shipExpress',
      type: 'text',
      props: { label: 'Express shipping' },
      default: 'express-please',
      conditions: {
        visible: { field: 'country', operator: 'equals', value: 'US' },
      },
    },
    {
      id: 'giftWrap',
      type: 'text',
      props: { label: 'Gift wrap' },
      conditions: {
        visible: { field: 'country', operator: 'equals', value: 'US' },
      },
    },
  ],
};

function renderForm(onSubmit: (data: Record<string, unknown>) => void) {
  const catalog = makeCatalog();
  const { formConfig, defaultValues } = compileForm(schema, catalog);

  render(
    <FormProvider formConfig={formConfig} defaultValues={defaultValues} onSubmit={onSubmit}>
      <FormField id="country" />
      <FormField id="shipExpress" />
      <FormField id="giftWrap" />
      <button type="submit" data-testid="submit">
        Submit
      </button>
    </FormProvider>
  );
}

describe('hidden field values must not ship in the submit payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A2: a hidden field with a compiled default is ABSENT from the payload', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // User answers FR: both conditional fields stay hidden.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });
    await waitFor(() => {
      expect(screen.queryByTestId('field-shipExpress')).toBeNull();
      expect(screen.queryByTestId('field-giftWrap')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    // The whole payload: the visible answer, and NOTHING the user never saw.
    expect(payload).toEqual({ country: 'FR' });
    expect(payload).not.toHaveProperty('shipExpress');
    expect(payload).not.toHaveProperty('giftWrap');
  });

  it('A3: a field revealed, filled, then hidden again does not ship its retracted value', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // Reveal: country US shows both conditional fields.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'US' } });
    await waitFor(() => {
      expect(screen.getByTestId('field-giftWrap')).toBeInTheDocument();
    });

    // Fill the revealed field...
    fireEvent.change(screen.getByTestId('input-giftWrap'), { target: { value: 'yes-wrap-it' } });

    // ...then retract the question: country FR hides it again.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });
    await waitFor(() => {
      expect(screen.queryByTestId('field-giftWrap')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({ country: 'FR' });
    expect(payload).not.toHaveProperty('giftWrap');
    expect(payload).not.toHaveProperty('shipExpress');
  });

  it('CONTROL: visible fields always ship — untouched default, empty value, unconditioned field', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // Country US: both conditional fields are visible.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'US' } });
    await waitFor(() => {
      expect(screen.getByTestId('field-shipExpress')).toBeInTheDocument();
      expect(screen.getByTestId('field-giftWrap')).toBeInTheDocument();
    });

    // A VISIBLE field holding an empty string must stay in the payload.
    fireEvent.change(screen.getByTestId('input-giftWrap'), { target: { value: 'wrap' } });
    fireEvent.change(screen.getByTestId('input-giftWrap'), { target: { value: '' } });

    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({
      country: 'US',
      shipExpress: 'express-please',
      giftWrap: '',
    });
  });
});
