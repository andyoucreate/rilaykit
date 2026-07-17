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
 * Round 39: effects declared on a repeatable TEMPLATE field must fire per-row.
 * They silently no-op'd because the engine looks up effectsMap by the runtime
 * composite key (items[k0].name) while indexEffects keys by the bare watch id
 * (name). Each row derives independently; a template-field target scopes to the
 * SAME row; a global-field target stays global.
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

describe('Round 39: effects fire on repeatable rows, per-row scoped', () => {
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

  it('a per-row onChange effect derives a sibling field IN THE SAME ROW only', async () => {
    const user = userEvent.setup();
    // Repeatable "lines" with a template: name -> slug (derived per row).
    const formConfig = form
      .create(config, 'f')
      .addRepeatable('lines', (r) =>
        r
          .min(2)
          .max(5)
          .add({ id: 'name', type: 'text' })
          .add({
            id: 'slug',
            type: 'text',
            effects: [
              onChange('name', (value, { setValue }) => {
                setValue('slug', `slug:${String(value)}`);
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

    // Two seeded rows k0, k1. Type into row k0's name.
    const order = storeRef.getState()._repeatableOrder.lines;
    expect(order).toHaveLength(2);
    const [k0, k1] = order;

    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].name"]`), 'Widget');

    await waitFor(() =>
      expect(storeRef.getState().values[`lines[${k0}].slug`]).toBe('slug:Widget')
    );
    // Row k1's slug is untouched — the effect is scoped to k0's row, not smeared.
    expect(storeRef.getState().values[`lines[${k1}].slug`] ?? '').toBe('');

    // Now row k1 independently.
    await user.type(document.querySelector(`[data-testid="input-lines[${k1}].name"]`), 'Gadget');
    await waitFor(() =>
      expect(storeRef.getState().values[`lines[${k1}].slug`]).toBe('slug:Gadget')
    );
    // k0 unchanged by k1's edit.
    expect(storeRef.getState().values[`lines[${k0}].slug`]).toBe('slug:Widget');
  });

  it('a per-row effect writing a GLOBAL field target stays global (not row-scoped)', async () => {
    const user = userEvent.setup();
    const formConfig = form
      .create(config, 'f')
      .add({ id: 'lastEditedName', type: 'text' })
      .addRepeatable('lines', (r) =>
        r.min(1).add({
          id: 'name',
          type: 'text',
          effects: [
            onChange('name', (value, { setValue }) => {
              // `lastEditedName` is a GLOBAL field, not a template field.
              setValue('lastEditedName', `last:${String(value)}`);
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

    const [k0] = storeRef.getState()._repeatableOrder.lines;
    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].name"]`), 'Z');

    await waitFor(() => expect(storeRef.getState().values.lastEditedName).toBe('last:Z'));
    // The global key is written, NOT a scoped lines[k0].lastEditedName.
    expect(storeRef.getState().values[`lines[${k0}].lastEditedName`]).toBeUndefined();
  });

  it('an INITIAL run derives per-row from a template default', async () => {
    const formConfig = form
      .create(config, 'f')
      .addRepeatable('lines', (r) =>
        r
          .min(1)
          .defaultValue({ name: 'Seed', slug: '' })
          .add({ id: 'name', type: 'text' })
          .add({
            id: 'slug',
            type: 'text',
            effects: [onChange('name', (v, { setValue }) => setValue('slug', `slug:${String(v)}`))],
          })
      )
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <Probe />
        <AppBody />
      </FormProvider>
    );

    const [k0] = storeRef.getState()._repeatableOrder.lines;
    // runInitialEffects derives slug from the seeded default, per row.
    await waitFor(() => expect(storeRef.getState().values[`lines[${k0}].slug`]).toBe('slug:Seed'));
  });

  it('a per-row derived value follows its row across move (round-37 probe C, now real)', async () => {
    const user = userEvent.setup();
    const formConfig = form
      .create(config, 'f')
      .addRepeatable('lines', (r) =>
        r
          .min(2)
          .add({ id: 'name', type: 'text' })
          .add({
            id: 'slug',
            type: 'text',
            effects: [onChange('name', (v, { setValue }) => setValue('slug', `slug:${String(v)}`))],
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
    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].name"]`), 'A');
    await user.type(document.querySelector(`[data-testid="input-lines[${k1}].name"]`), 'B');
    await waitFor(() => expect(storeRef.getState().values[`lines[${k1}].slug`]).toBe('slug:B'));

    // Move row 0 → 1: order becomes [k1, k0]. Each row's derived value stays with ITS row.
    storeRef.getState()._moveRepeatableItem('lines', 0, 1);
    expect(storeRef.getState()._repeatableOrder.lines).toEqual([k1, k0]);
    expect(storeRef.getState().values[`lines[${k0}].slug`]).toBe('slug:A');
    expect(storeRef.getState().values[`lines[${k1}].slug`]).toBe('slug:B');

    // A further edit to k0's name (now at visual index 1) still derives k0's slug only.
    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].name"]`), 'A2');
    await waitFor(() => expect(storeRef.getState().values[`lines[${k0}].slug`]).toBe('slug:AA2'));
    expect(storeRef.getState().values[`lines[${k1}].slug`]).toBe('slug:B');
  });

  it('a per-row CASCADE (A→B→C in the same row) stays row-scoped', async () => {
    const user = userEvent.setup();
    const formConfig = form
      .create(config, 'f')
      .addRepeatable('lines', (r) =>
        r
          .min(2)
          .add({ id: 'a', type: 'text' })
          .add({
            id: 'b',
            type: 'text',
            effects: [onChange('a', (v, { setValue }) => setValue('b', `b:${String(v)}`))],
          })
          .add({
            id: 'c',
            type: 'text',
            effects: [onChange('b', (v, { setValue }) => setValue('c', `c:${String(v)}`))],
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
    await user.type(document.querySelector(`[data-testid="input-lines[${k0}].a"]`), 'X');
    // a → b → c cascades, all within row k0.
    await waitFor(() => expect(storeRef.getState().values[`lines[${k0}].c`]).toBe('c:b:X'));
    expect(storeRef.getState().values[`lines[${k0}].b`]).toBe('b:X');
    // Row k1 untouched by k0's cascade.
    expect(storeRef.getState().values[`lines[${k1}].c`] ?? '').toBe('');
  });

  it('an ADDED row derives via its own effect', async () => {
    const user = userEvent.setup();
    const formConfig = form
      .create(config, 'f')
      .addRepeatable('lines', (r) =>
        r
          .min(1)
          .add({ id: 'name', type: 'text' })
          .add({
            id: 'slug',
            type: 'text',
            effects: [onChange('name', (v, { setValue }) => setValue('slug', `slug:${String(v)}`))],
          })
      )
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <Probe />
        <AppBody />
      </FormProvider>
    );

    await user.click(document.querySelector('button'));
    await waitFor(() => expect(storeRef.getState()._repeatableOrder.lines).toHaveLength(2));
    const newKey = storeRef.getState()._repeatableOrder.lines[1];
    await user.type(document.querySelector(`[data-testid="input-lines[${newKey}].name"]`), 'New');
    await waitFor(() =>
      expect(storeRef.getState().values[`lines[${newKey}].slug`]).toBe('slug:New')
    );
  });
});
