// @ts-nocheck - generic constraints relaxed for test ergonomics
import { type ComponentRenderContext, onChange, ril } from '@rilaykit/core';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormField } from '../../src/components/FormField';
import { FormList } from '../../src/components/FormList';
import { FormProvider } from '../../src/components/FormProvider';
import { type FormStore, useFormStoreApi } from '../../src/stores';

/**
 * Round 42 (fan-out): an effect on a repeatable TEMPLATE field that watches a
 * GLOBAL field must fan out per live row — a per-row `total` recomputed when a
 * global `taxRate` changes. Before the fix it fired ONCE globally (rowScope null)
 * and wrote a stray global key; the rows never recomputed.
 */
const MockText = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

const AppBody = () => (
  <FormBody>
    {({ rows }) =>
      rows.map((row) =>
        row.kind === 'repeatable' ? (
          <FormList key={row.id} id={row.repeatable.id}>
            {({ items, add }) => (
              <div>
                {items.map((item) => (
                  <div key={item.key} data-row={item.key}>
                    {item.allFields.map((f) => (
                      <FormField key={f.id} id={f.id} config={f} />
                    ))}
                  </div>
                ))}
                <button type="button" onClick={() => add()}>
                  add
                </button>
              </div>
            )}
          </FormList>
        ) : (
          <div key={row.id}>
            {row.fields.map((f) => (
              <FormField key={f.id} id={f.id} />
            ))}
          </div>
        )
      )
    }
  </FormBody>
);

describe('Round 42: a repeatable-row effect watching a GLOBAL field fans out per row', () => {
  let config: ReturnType<typeof ril.create>;
  let storeRef: FormStore | null;

  const Probe = () => {
    storeRef = useFormStoreApi();
    return null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storeRef = null;
    config = ril.create().component('text', { name: 'Text', renderer: MockText });
  });

  it('a global taxRate change recomputes every live row, and adds/removes track', async () => {
    const user = userEvent.setup();
    const formConfig = form
      .create(config, 'f')
      .add({ id: 'taxRate', type: 'text' })
      .addRepeatable('lines', (r) =>
        r
          .min(2)
          .add({ id: 'price', type: 'text' })
          .add({
            id: 'total',
            type: 'text',
            // Watches the GLOBAL `taxRate`; derives a per-row total.
            effects: [
              onChange('taxRate', (rate, { setValue, getFieldValue }) => {
                setValue('total', `${String(getFieldValue('price'))}@${String(rate)}`);
              }),
            ],
          })
      )
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <Probe />
        <AppBody />
      </FormProvider>
    );

    const [k0, k1] = storeRef.getState()._repeatableOrder.lines;
    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].price"]`), 'A');
    await user.type(document.querySelector(`[data-testid="input-lines[${k1}].price"]`), 'B');

    // Change the GLOBAL taxRate → every row's total recomputes with ITS price.
    await user.type(document.querySelector('[data-testid="input-taxRate"]'), '9');

    await waitFor(() => expect(storeRef.getState().values[`lines[${k0}].total`]).toBe('A@9'));
    expect(storeRef.getState().values[`lines[${k1}].total`]).toBe('B@9');
    // No stray global `total` key.
    expect(storeRef.getState().values.total).toBeUndefined();

    // Add a row, set its price, change taxRate again → the new row recomputes too.
    await user.click(document.querySelector('button'));
    await waitFor(() => expect(storeRef.getState()._repeatableOrder.lines).toHaveLength(3));
    const k2 = storeRef.getState()._repeatableOrder.lines[2];
    await user.type(document.querySelector(`[data-testid="input-lines[${k2}].price"]`), 'C');
    await user.clear(document.querySelector('[data-testid="input-taxRate"]'));
    await user.type(document.querySelector('[data-testid="input-taxRate"]'), '7');

    await waitFor(() => expect(storeRef.getState().values[`lines[${k2}].total`]).toBe('C@7'));
    expect(storeRef.getState().values[`lines[${k0}].total`]).toBe('A@7');
  });
});
