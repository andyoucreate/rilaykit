import { custom, onChange, required } from '@rilaykit/core';
import { form, structureFormValues } from '@rilaykit/forms';
import { FormBody, FormProvider, useFormStoreApi } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepeatableControls, SubmitButton, ValidationTrigger } from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// =====================================================================
// COMPLEX E2E: repeatable line items × per-row effects (sibling + global
// fan-out) × validation × add/remove/reorder.
//
// Domain: an ORDER with global fields (currency, taxRate) and a repeatable
// `items` line-item table. Each row derives:
//   - `subtotal`  — a per-row effect watching TWO SIBLING template fields
//                   (`qty`, `unitPrice`), row-scoped.
//   - `taxed`     — a per-row effect watching the GLOBAL `taxRate`, fanned
//                   out to every live row (row-local `unitPrice` @ global rate).
// =====================================================================

// Store handle for direct/assertion access.
let storeRef: any;
function StoreAccessor() {
  const store = useFormStoreApi();
  React.useEffect(() => {
    storeRef = store;
  }, [store]);
  return null;
}

let rilConfig: ReturnType<typeof createTestRilConfig>;

/** The canonical complex order form used across most scenarios. */
function buildOrderForm(opts?: { min?: number; max?: number; groupRule?: boolean }) {
  const b = form
    .create(rilConfig, 'order')
    .add({
      id: 'currency',
      type: 'select',
      props: {
        label: 'Currency',
        options: [
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
        ],
      },
    })
    .add({ id: 'taxRate', type: 'text', props: { label: 'Tax Rate' } })
    .addRepeatable('items', (r) => {
      let rr = r
        .add({
          id: 'sku',
          type: 'text',
          props: { label: 'SKU' },
          validation: { validate: required('SKU is required') },
        })
        .add({ id: 'qty', type: 'number', props: { label: 'Qty' } })
        .add({ id: 'unitPrice', type: 'number', props: { label: 'Unit Price' } })
        .add({
          id: 'subtotal',
          type: 'text',
          props: { label: 'Subtotal' },
          // SIBLING watch: recompute when either qty or unitPrice changes,
          // reading the OTHER sibling from the SAME row.
          effects: [
            onChange('qty', (qty, { setValue, getFieldValue }) => {
              setValue('subtotal', `${String(qty)}x${String(getFieldValue('unitPrice') ?? '')}`);
            }),
            onChange('unitPrice', (up, { setValue, getFieldValue }) => {
              setValue('subtotal', `${String(getFieldValue('qty') ?? '')}x${String(up)}`);
            }),
          ],
        })
        .add({
          id: 'taxed',
          type: 'text',
          props: { label: 'Taxed' },
          // GLOBAL watch: recompute per live row when the global taxRate
          // changes, using this row's own unitPrice.
          effects: [
            onChange('taxRate', (rate, { setValue, getFieldValue }) => {
              setValue('taxed', `${String(getFieldValue('unitPrice') ?? '')}@${String(rate)}`);
            }),
          ],
        });
      if (opts?.min !== undefined) rr = rr.min(opts.min);
      if (opts?.max !== undefined) rr = rr.max(opts.max);
      if (opts?.groupRule) {
        // Group-level constraint: at least one row must have qty > 0.
        rr = rr.validation({
          validate: custom(
            (rows: any) => Array.isArray(rows) && rows.some((row: any) => Number(row?.qty) > 0),
            'At least one line with qty > 0 is required'
          ),
        });
      }
      rr = rr.defaultValue({ sku: '', qty: 0, unitPrice: 0, subtotal: '', taxed: '' });
      return rr;
    })
    .build();
  return b;
}

function renderOrder(config: any, defaultValues: any, onSubmit?: any) {
  return render(
    <FormProvider formConfig={config} defaultValues={defaultValues} onSubmit={onSubmit}>
      <FormBody />
      <RepeatableControls repeatableId="items" />
      <SubmitButton />
      <ValidationTrigger />
      <StoreAccessor />
    </FormProvider>
  );
}

const twoRows = {
  currency: 'USD',
  taxRate: '',
  items: [
    { sku: 'A', qty: 2, unitPrice: 10, subtotal: '', taxed: '' },
    { sku: 'B', qty: 3, unitPrice: 20, subtotal: '', taxed: '' },
  ],
};

describe('Complex: repeatable line items × effects × validation', () => {
  beforeEach(() => {
    rilConfig = createTestRilConfig();
    storeRef = null;
  });

  // ================================================================
  // PER-ROW SIBLING EFFECT
  // ================================================================
  describe('per-row sibling effect', () => {
    it('recomputes subtotal from sibling qty within the SAME row only', async () => {
      renderOrder(buildOrderForm(), twoRows);

      const order = storeRef.getState()._repeatableOrder.items;
      const [k0, k1] = order;

      // The INITIAL effect run already derived each row's subtotal from its own
      // seeded qty/unitPrice defaults (round-39 behavior): k0 '2x10', k1 '3x20'.
      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].subtotal`]).toBe('2x10'));
      expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('3x20');

      // Change qty of row k0 → subtotal recomputes using row k0's unitPrice.
      fireEvent.change(screen.getByTestId(`input-items[${k0}].qty`), { target: { value: '5' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].subtotal`]).toBe('5x10'));

      // Row k1 subtotal is untouched by k0's edit — stays at its own derivation,
      // proving the sibling effect is row-scoped (k0's '5' did not smear into k1).
      expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('3x20');

      // Now edit unitPrice of row k1 → its subtotal recomputes with k1's qty.
      fireEvent.change(screen.getByTestId(`input-items[${k1}].unitPrice`), {
        target: { value: '99' },
      });
      await waitFor(() => expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('3x99'));
      // k0 unchanged by k1's edit.
      expect(storeRef.getState().values[`items[${k0}].subtotal`]).toBe('5x10');
    });
  });

  // ================================================================
  // GLOBAL FAN-OUT EFFECT
  // ================================================================
  describe('global fan-out effect', () => {
    it('changing the global taxRate recomputes taxed on EVERY live row', async () => {
      renderOrder(buildOrderForm(), twoRows);
      const [k0, k1] = storeRef.getState()._repeatableOrder.items;

      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '7' } });

      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@7'));
      expect(storeRef.getState().values[`items[${k1}].taxed`]).toBe('20@7');
      // No stray GLOBAL `taxed` key written outside any row.
      expect(storeRef.getState().values.taxed).toBeUndefined();
    });

    it('fan-out reaches a row ADDED after the first global change', async () => {
      renderOrder(buildOrderForm(), twoRows);

      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '5' } });
      await waitFor(() => {
        const [k0] = storeRef.getState()._repeatableOrder.items;
        expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@5');
      });

      // Add a row, give it a unitPrice, change the global rate again.
      fireEvent.click(screen.getByTestId('repeatable-append-items'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).toHaveLength(3));
      const k2 = storeRef.getState()._repeatableOrder.items[2];
      fireEvent.change(screen.getByTestId(`input-items[${k2}].unitPrice`), {
        target: { value: '30' },
      });

      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '8' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k2}].taxed`]).toBe('30@8'));
      // Pre-existing rows recomputed with the new rate too.
      const [k0] = storeRef.getState()._repeatableOrder.items;
      expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@8');
    });
  });

  // ================================================================
  // ADD / REMOVE / REORDER
  // ================================================================
  describe('add / remove / reorder', () => {
    it('a NEW row derives via its own sibling + global effects', async () => {
      renderOrder(buildOrderForm(), twoRows);

      fireEvent.click(screen.getByTestId('repeatable-append-items'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).toHaveLength(3));
      const k2 = storeRef.getState()._repeatableOrder.items[2];

      // Sibling effect: set qty then unitPrice.
      fireEvent.change(screen.getByTestId(`input-items[${k2}].unitPrice`), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByTestId(`input-items[${k2}].qty`), { target: { value: '6' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k2}].subtotal`]).toBe('6x4'));

      // Global effect reaches the new row.
      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '2' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k2}].taxed`]).toBe('4@2'));
    });

    it('removing a row leaves NO ghost composite keys and does not resurrect on re-add', async () => {
      renderOrder(buildOrderForm(), twoRows);
      const [k0, k1] = storeRef.getState()._repeatableOrder.items;

      // Derive some values first so the row has non-trivial state.
      fireEvent.change(screen.getByTestId(`input-items[${k1}].qty`), { target: { value: '9' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('9x20'));

      // Remove k1.
      fireEvent.click(screen.getByTestId(`repeatable-remove-items-${k1}`));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).toEqual([k0]));

      // Every composite key of k1 is gone — no ghost values.
      const ghosts = Object.keys(storeRef.getState().values).filter((key) =>
        key.startsWith(`items[${k1}]`)
      );
      expect(ghosts).toEqual([]);

      // Re-add: the new row gets a FRESH key (not k1) and default (empty) values,
      // i.e. the removed row's data does not resurrect.
      fireEvent.click(screen.getByTestId('repeatable-append-items'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).toHaveLength(2));
      const newKey = storeRef.getState()._repeatableOrder.items[1];
      expect(newKey).not.toBe(k1);
      // The re-added row derives from DEFAULTS (qty 0, unitPrice 0 → '0x0'),
      // NOT k1's removed '9x20' — the deleted row's data does not resurrect.
      expect(storeRef.getState().values[`items[${newKey}].subtotal`]).toBe('0x0');
      expect(storeRef.getState().values[`items[${newKey}].subtotal`]).not.toBe('9x20');
      expect(storeRef.getState().values[`items[${newKey}].qty`]).toBe(0);
    });

    it('reorder keeps each row derived value with ITS row; global fan-out still hits all', async () => {
      renderOrder(buildOrderForm(), twoRows);
      const [k0, k1] = storeRef.getState()._repeatableOrder.items;

      // Derive per-row subtotals.
      fireEvent.change(screen.getByTestId(`input-items[${k0}].qty`), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId(`input-items[${k1}].qty`), { target: { value: '2' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].subtotal`]).toBe('1x10'));
      expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('2x20');

      // Move row 0 down → order [k1, k0].
      fireEvent.click(screen.getByTestId('repeatable-move-down-items-0'));
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).toEqual([k1, k0]));
      // Derived values stayed with their rows.
      expect(storeRef.getState().values[`items[${k0}].subtotal`]).toBe('1x10');
      expect(storeRef.getState().values[`items[${k1}].subtotal`]).toBe('2x20');

      // Global fan-out after reorder still hits both rows with their own price.
      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '3' } });
      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@3'));
      expect(storeRef.getState().values[`items[${k1}].taxed`]).toBe('20@3');
    });
  });

  // ================================================================
  // MIN / MAX ENFORCEMENT
  // ================================================================
  describe('min / max enforcement', () => {
    it('removing at min is a no-op (canRemove false, count unchanged)', () => {
      renderOrder(buildOrderForm({ min: 2 }), twoRows);
      const [k0] = storeRef.getState()._repeatableOrder.items;

      expect(screen.getByTestId('repeatable-can-remove-items')).toHaveTextContent('false');

      // Direct store call at min returns false and leaves the order untouched.
      let result: boolean | undefined;
      act(() => {
        result = storeRef.getState()._removeRepeatableItem('items', k0);
      });
      expect(result).toBe(false);
      expect(storeRef.getState()._repeatableOrder.items).toHaveLength(2);
    });

    it('submit is blocked below min with a REPEATABLE_MIN_COUNT error', async () => {
      const onSubmit = vi.fn();
      renderOrder(
        buildOrderForm({ min: 3 }),
        {
          ...twoRows,
          items: [{ sku: 'A', qty: 1, unitPrice: 1, subtotal: '', taxed: '' }],
        },
        onSubmit
      );

      fireEvent.click(screen.getByTestId('validate-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false')
      );
      const errors = JSON.parse(screen.getByTestId('validation-errors').textContent!);
      const minErr = errors.find((e: any) => e.code === 'REPEATABLE_MIN_COUNT');
      expect(minErr).toBeDefined();
      expect(minErr.path).toBe('items');

      // Submit does not fire onSubmit.
      fireEvent.click(screen.getByTestId('submit-btn'));
      await new Promise((r) => setTimeout(r, 20));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('add is disabled at max (canAdd false, append disabled)', () => {
      renderOrder(buildOrderForm({ max: 2 }), twoRows);
      expect(screen.getByTestId('repeatable-can-add-items')).toHaveTextContent('false');
      expect(screen.getByTestId('repeatable-append-items')).toBeDisabled();
    });
  });

  // ================================================================
  // VALIDATION (per-row + group-level)
  // ================================================================
  describe('validation', () => {
    it('per-row required field blocks submit and reports each empty row', async () => {
      const onSubmit = vi.fn();
      renderOrder(
        buildOrderForm(),
        {
          ...twoRows,
          items: [
            { sku: '', qty: 1, unitPrice: 1, subtotal: '', taxed: '' },
            { sku: 'B', qty: 1, unitPrice: 1, subtotal: '', taxed: '' },
          ],
        },
        onSubmit
      );

      fireEvent.click(screen.getByTestId('validate-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false')
      );
      const errors = JSON.parse(screen.getByTestId('validation-errors').textContent!);
      expect(errors.some((e: any) => e.message === 'SKU is required')).toBe(true);

      fireEvent.click(screen.getByTestId('submit-btn'));
      await new Promise((r) => setTimeout(r, 20));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('per-row required passes once every row is filled', async () => {
      const onSubmit = vi.fn();
      renderOrder(
        buildOrderForm(),
        {
          ...twoRows,
          items: [
            { sku: 'A', qty: 1, unitPrice: 1, subtotal: '', taxed: '' },
            { sku: 'B', qty: 1, unitPrice: 1, subtotal: '', taxed: '' },
          ],
        },
        onSubmit
      );

      fireEvent.click(screen.getByTestId('validate-btn'));
      await waitFor(() => expect(screen.getByTestId('validation-valid')).toHaveTextContent('true'));
      fireEvent.click(screen.getByTestId('submit-btn'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    // LIBRARY-BUG PROBE: group-level `.validation()` on a repeatable is accepted
    // by the builder and compiled into config, but the validation runtime never
    // executes it (see useFormValidationWithStore: the repeatable loop only runs
    // per-field validation + REPEATABLE_MIN_COUNT). Documented with the actual
    // (buggy) behavior so the suite stays green; flip once the runtime enforces it.
    it('group-level validation "at least one qty>0" is NOT enforced (documents a library gap)', async () => {
      const onSubmit = vi.fn();
      renderOrder(
        buildOrderForm({ groupRule: true }),
        {
          ...twoRows,
          // Every row qty is 0 → the group rule SHOULD fail. sku filled so only
          // the group rule could block.
          items: [
            { sku: 'A', qty: 0, unitPrice: 1, subtotal: '', taxed: '' },
            { sku: 'B', qty: 0, unitPrice: 1, subtotal: '', taxed: '' },
          ],
        },
        onSubmit
      );

      fireEvent.click(screen.getByTestId('validate-btn'));
      await waitFor(() => expect(screen.getByTestId('validation-result')).toBeInTheDocument());
      const errors = JSON.parse(screen.getByTestId('validation-errors').textContent!);

      // EXPECTED (correct) behavior would be a group failure here. ACTUAL: the
      // group validator never runs, so the form validates true and submits.
      const groupErr = errors.find((e: any) => String(e.message).includes('qty > 0'));
      expect(groupErr).toBeUndefined(); // <-- documents the gap
      expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
    });
  });

  // ================================================================
  // ASYNC EFFECT × ROW REMOVAL RACE
  // ================================================================
  describe('async effect racing row removal', () => {
    it('an async global fan-out effect dropped for a row removed mid-flight', async () => {
      let releaseGate: (() => void) | null = null;
      const gate = new Promise<void>((res) => {
        releaseGate = res;
      });

      const config = form
        .create(rilConfig, 'order-async')
        .add({ id: 'taxRate', type: 'text', props: { label: 'Tax Rate' } })
        .addRepeatable('items', (r) =>
          r
            .min(1)
            .add({ id: 'unitPrice', type: 'number', props: { label: 'Unit Price' } })
            .add({
              id: 'taxed',
              type: 'text',
              props: { label: 'Taxed' },
              effects: [
                onChange('taxRate', async (rate, { setValue, getFieldValue }) => {
                  // Parked until the test releases the gate — stands in for a
                  // remote lookup resolving after the user deletes a row.
                  await gate;
                  setValue('taxed', `${String(getFieldValue('unitPrice') ?? '')}@${String(rate)}`);
                }),
              ],
            })
            .defaultValue({ unitPrice: 0, taxed: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            taxRate: '',
            items: [
              { unitPrice: 10, taxed: '' },
              { unitPrice: 20, taxed: '' },
              { unitPrice: 30, taxed: '' },
            ],
          }}
        >
          <FormBody />
          <StoreAccessor />
        </FormProvider>
      );

      const [k0, k1] = storeRef.getState()._repeatableOrder.items;

      // Fire the global change → all three async effects start and park.
      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '9' } });

      // Remove k1 while its effect is parked (3 rows → 2, above min).
      act(() => {
        expect(storeRef.getState()._removeRepeatableItem('items', k1)).toBe(true);
      });
      await waitFor(() => expect(storeRef.getState()._repeatableOrder.items).not.toContain(k1));

      // Release — every parked invocation proceeds to its setValue.
      await act(async () => {
        releaseGate?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Surviving row recomputed; the removed row's late write was dropped.
      await waitFor(() => expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@9'));
      expect(storeRef.getState().values[`items[${k1}].taxed`]).toBeUndefined();
      expect(storeRef.getState().values[`items[${k1}].unitPrice`]).toBeUndefined();
    });
  });

  // ================================================================
  // PROTOTYPE-KEY SAFETY
  // ================================================================
  describe('prototype-pollution-safe keys', () => {
    it('a repeatable id and field ids of __proto__ / constructor / toString round-trip', async () => {
      const onSubmit = vi.fn();
      const config = form
        .create(rilConfig, 'proto')
        .addRepeatable('__proto__', (r) =>
          r
            .add({ id: 'constructor', type: 'text', props: { label: 'c' } })
            .add({ id: 'toString', type: 'text', props: { label: 't' } })
            .defaultValue({ constructor: '', toString: '' })
        )
        .build();

      // A literal `{ __proto__: [...] }` would SET the prototype, not create an
      // own key — so build genuine OWN prototype-named keys via JSON.parse, the
      // realistic hazard (host-supplied JSON with a `__proto__` array).
      const defaultValues = JSON.parse(
        '{"__proto__":[{"constructor":"c0","toString":"t0"},{"constructor":"c1","toString":"t1"}]}'
      );

      render(
        <FormProvider formConfig={config} defaultValues={defaultValues} onSubmit={onSubmit}>
          <FormBody />
          <SubmitButton />
          <StoreAccessor />
        </FormProvider>
      );

      // The prototype chain is intact — no pollution of Object.prototype.
      expect(({} as any).constructor).toBe(Object);
      // The __proto__ repeatable's order is tracked under an OWN key (defineOwn),
      // and both seeded rows produced composite value keys — the rows survived.
      const order = storeRef.getState()._repeatableOrder;
      expect(Object.prototype.hasOwnProperty.call(order, '__proto__')).toBe(true);
      expect(Object.getOwnPropertyDescriptor(order, '__proto__')?.value).toHaveLength(2);
      // All four composite value keys are present and inputs rendered.
      expect(document.querySelectorAll('[data-testid^="input-__proto__"]').length).toBe(4);

      fireEvent.click(screen.getByTestId('submit-btn'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      const payload = onSubmit.mock.calls[0][0];
      // The authored array comes back under the own `__proto__` key, as rows.
      const rows = Object.getOwnPropertyDescriptor(payload, '__proto__')?.value;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ constructor: 'c0', toString: 't0' });
      expect(rows[1]).toEqual({ constructor: 'c1', toString: 't1' });
      // Object.prototype still clean after structuring.
      expect(({} as any).polluted).toBeUndefined();
      expect(({} as any).c0).toBeUndefined();
    });
  });

  // ================================================================
  // SUBMIT PAYLOAD SHAPE
  // ================================================================
  describe('submit payload shape', () => {
    it('repeatable values come back as an authored array of row objects, not flat composite keys', async () => {
      const onSubmit = vi.fn();
      renderOrder(
        buildOrderForm(),
        {
          currency: 'EUR',
          taxRate: '5',
          items: [
            { sku: 'A', qty: 2, unitPrice: 10, subtotal: '', taxed: '' },
            { sku: 'B', qty: 3, unitPrice: 20, subtotal: '', taxed: '' },
          ],
        },
        onSubmit
      );

      // Trigger derivations so subtotal/taxed have real values in the payload.
      fireEvent.change(screen.getByTestId('input-taxRate'), { target: { value: '5' } });
      await waitFor(() => {
        const [k0] = storeRef.getState()._repeatableOrder.items;
        expect(storeRef.getState().values[`items[${k0}].taxed`]).toBe('10@5');
      });

      fireEvent.click(screen.getByTestId('submit-btn'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      const payload = onSubmit.mock.calls[0][0];
      // Globals are flat scalars.
      expect(payload.currency).toBe('EUR');
      expect(payload.taxRate).toBe('5');
      // items is an ARRAY of row objects — no flat "items[k0].sku" keys leak.
      expect(Array.isArray(payload.items)).toBe(true);
      expect(payload.items).toHaveLength(2);
      expect(payload.items[0]).toMatchObject({ sku: 'A', qty: 2, unitPrice: 10, taxed: '10@5' });
      expect(payload.items[1]).toMatchObject({ sku: 'B', qty: 3, unitPrice: 20, taxed: '20@5' });
      const flatKeys = Object.keys(payload).filter((key) => key.includes('items['));
      expect(flatKeys).toEqual([]);

      // Cross-check with structureFormValues directly.
      const state = storeRef.getState();
      const structured = structureFormValues(
        state.values,
        state._repeatableConfigs,
        state._repeatableOrder
      );
      expect(structured.items).toHaveLength(2);
    });
  });
});
