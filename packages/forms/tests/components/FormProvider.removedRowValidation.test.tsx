import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FormField } from '../../src/components/FormField';
import { FormList } from '../../src/components/FormList';
import { FormProvider } from '../../src/components/FormProvider';
import { compileForm } from '../../src/schema/compile-form';
import { type FormStore, useFormStoreApi } from '../../src/stores';

const catalog = ril.create().component('text', {
  description: 'Text input',
  propsSchema: z.object({ label: z.string() }),
  renderer: ({ props, field }: ComponentRenderContext) => (
    <label>
      {String(props.label)}
      <input value={String(field?.value ?? '')} onChange={(e) => field?.onChange(e.target.value)} />
    </label>
  ),
});

function StoreCapture({ storeRef }: { storeRef: { current: FormStore | null } }) {
  storeRef.current = useFormStoreApi();
  return null;
}

/**
 * A repeatable row removed while its async validation is in flight: the late
 * verdict must not write a ghost error under the removed row's composite key
 * (`items[k0].sku`) and wedge isValid — the R7-1 class, one door deeper (a live
 * ROW must exist in _repeatableOrder, not just the template field).
 */
describe('a repeatable row removed mid-validation does not wedge the form', () => {
  it('drops the late verdict for a row no longer in _repeatableOrder', async () => {
    let releaseValidation: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    const bindings = {
      validators: {
        slowFail: () => ({
          '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: async (_v: unknown) => {
              await gate;
              return { issues: [{ message: 'bad sku' }] };
            },
          },
        }),
      },
    };
    const { formConfig, defaultValues } = compileForm(
      {
        id: 'order',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              min: 0,
              rows: [
                {
                  fields: [
                    {
                      id: 'sku',
                      type: 'text',
                      props: { label: 'SKU' },
                      validation: { rules: [{ type: 'slowFail' }] },
                    },
                  ],
                },
              ],
            },
          },
        ],
      } as never,
      catalog,
      { bindings }
    );
    const storeRef: { current: FormStore | null } = { current: null };
    render(
      <FormProvider formConfig={formConfig as never} defaultValues={defaultValues}>
        <StoreCapture storeRef={storeRef} />
        <FormList id="items">
          {({ items, add, remove }) => (
            <>
              {items.map((item) => (
                <div key={item.key}>
                  {item.allFields.map((field) => (
                    <FormField key={field.id} id={field.id} config={field} />
                  ))}
                  <button type="button" onClick={() => remove(item.key)}>
                    remove-{item.index}
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => add()}>
                add-row
              </button>
            </>
          )}
        </FormList>
      </FormProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'add-row' }));
    await userEvent.type(screen.getByLabelText('SKU'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'remove-0' }));
    expect(Object.keys(storeRef.current!.getState().values)).toEqual([]);
    expect(storeRef.current!.getState().isValid).toBe(true);
    await act(async () => {
      releaseValidation?.();
      await gate;
      await new Promise((r) => setTimeout(r, 0));
    });
    const state = storeRef.current!.getState();
    expect(state.isValid).toBe(true);
    expect(state.errors['items[k0].sku'] ?? []).toEqual([]);
  });
});
