// @ts-nocheck - generic constraints relaxed for test ergonomics
import { type ComponentRenderContext, onChange, ril } from '@rilaykit/core';
import { act, render, waitFor } from '@testing-library/react';
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
 * Round 43 (bug hunt): the global-watch effect fan-out (#0c3af68) was only tested
 * SYNC. This is the untested intersection: a per-row effect watching a GLOBAL
 * field is ASYNC (a remote lookup), fans out to every live row, and a row is
 * REMOVED while its fan-out invocation is in flight. The row-liveness write guard
 * must drop the removed row's late write — it must not resurrect `lines[k1].total`
 * on a row the user already deleted.
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
            {({ items }) => (
              <div>
                {items.map((item) => (
                  <div key={item.key} data-row={item.key}>
                    {item.allFields.map((f) => (
                      <FormField key={f.id} id={f.id} config={f} />
                    ))}
                  </div>
                ))}
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

describe('Round 43: an async global-watch fan-out does not resurrect a row removed mid-flight', () => {
  let config: ReturnType<typeof ril.create>;
  let storeRef: FormStore | null;
  // A single shared gate every fan-out invocation awaits before it writes.
  let releaseGate: (() => void) | null;
  let gate: Promise<void>;

  const Probe = () => {
    storeRef = useFormStoreApi();
    return null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storeRef = null;
    releaseGate = null;
    gate = new Promise<void>((res) => {
      releaseGate = res;
    });
    config = ril.create().component('text', { name: 'Text', renderer: MockText });
  });

  it('drops the removed row late write, keeps the surviving row recomputed', async () => {
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
            effects: [
              onChange('taxRate', async (rate, { setValue, getFieldValue }) => {
                // In-flight until the test releases the gate — a stand-in for a
                // remote lookup that resolves after the user deletes a row.
                await gate;
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
    // Append a third row so removing k1 is allowed (min is 2 — removing at the
    // minimum is a no-op, which would make this test prove nothing).
    act(() => {
      storeRef.getState()._appendRepeatableItem('lines');
    });
    await waitFor(() => expect(storeRef.getState()._repeatableOrder.lines).toHaveLength(3));

    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].price"]`), 'A');
    await user.type(document.querySelector(`[data-testid="input-lines[${k1}].price"]`), 'B');

    // Change the global taxRate → every live row's async fan-out effect starts and
    // parks on the gate.
    await user.type(document.querySelector('[data-testid="input-taxRate"]'), '9');

    // Remove k1 WHILE its fan-out invocation is parked on the gate (3 rows → 2, allowed).
    act(() => {
      expect(storeRef.getState()._removeRepeatableItem('lines', k1)).toBe(true);
    });
    await waitFor(() => expect(storeRef.getState()._repeatableOrder.lines).not.toContain(k1));

    // Release the gate — both invocations proceed to setValue.
    await act(async () => {
      releaseGate?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The surviving row recomputed; the removed row's late write was dropped and
    // must NOT resurrect its key.
    await waitFor(() => expect(storeRef.getState().values[`lines[${k0}].total`]).toBe('A@9'));
    expect(storeRef.getState().values[`lines[${k1}].total`]).toBeUndefined();
    expect(storeRef.getState().values[`lines[${k1}].price`]).toBeUndefined();
  });
});
