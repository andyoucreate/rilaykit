import type { ComponentRenderContext } from '@rilaykit/core';
import { onChange, ril } from '@rilaykit/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormList } from '../../src/components/FormList';
import { FormProvider } from '../../src/components/FormProvider';
import { compileForm } from '../../src/schema/compile-form';
import type { Bindings } from '../../src/schema/types';
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

interface SchemaField {
  id: string;
  type: string;
  props: Record<string, unknown>;
  default?: unknown;
  effects?: Array<{ trigger: 'change'; watch: string; handler: string }>;
}

/** Streamed-chunk compile: lenient, per-chunk fresh compile — the agent path. */
function compileChunk(fields: SchemaField[], bindings: Bindings) {
  return compileForm({ id: 'agentForm', rows: [{ fields }] } as never, catalog, {
    bindings,
    lenient: true,
  });
}

const fieldA: SchemaField = {
  id: 'a',
  type: 'text',
  props: { label: 'A' },
  default: 'hello',
  effects: [{ trigger: 'change', watch: 'a', handler: 'copyToB' }],
};
const fieldB: SchemaField = { id: 'b', type: 'text', props: { label: 'B' } };
const fieldC: SchemaField = { id: 'c', type: 'text', props: { label: 'C' } };

function copyBindings(): Bindings {
  return {
    effects: {
      copyToB: (newValue, context) => {
        context.setValue('b', `${String(newValue)}-derived`);
      },
      copyToD: (newValue, context) => {
        context.setValue('d', `${String(newValue)}-dcopy`);
      },
    },
  };
}

function chunkUi(
  compiled: ReturnType<typeof compileChunk>,
  storeRef: { current: FormStore | null }
) {
  return (
    <FormProvider formConfig={compiled.formConfig as never} defaultValues={compiled.defaultValues}>
      <StoreCapture storeRef={storeRef} />
      {compiled.formConfig.allFields.map((field) => (
        <FormField key={field.id} id={field.id} />
      ))}
    </FormProvider>
  );
}

/**
 * R11-B4 — a streaming GROWTH chunk (same effects, one appended field) must not
 * re-run initial effects over the user's typed answer. Every streamed chunk is
 * a fresh compileForm, so the effect engine used to be torn down and rebuilt on
 * `effectsMap` object identity and `runInitialEffects` re-fired `a`'s effect
 * against its unchanged default, overwriting `b` — user-input corruption on the
 * exact path progressive mounting exists to protect.
 */
describe('streaming growth chunks and the effect engine (R11-B4)', () => {
  it('runs the intended initial effect on FIRST mount (b derives from a default)', () => {
    const storeRef: { current: FormStore | null } = { current: null };
    render(chunkUi(compileChunk([fieldA, fieldB], copyBindings()), storeRef));

    expect(storeRef.current!.getState().values.a).toBe('hello');
    expect(storeRef.current!.getState().values.b).toBe('hello-derived');
  });

  it("keeps the user's typed answer through a growth chunk with unchanged effects", async () => {
    const bindings = copyBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(chunkUi(compileChunk([fieldA, fieldB], bindings), storeRef));

    // Intended initial effect fired at mount.
    expect(storeRef.current!.getState().values.b).toBe('hello-derived');

    // The user answers b (the hunter's repro: typing, no blur — the schema is
    // still streaming under their cursor).
    const inputB = screen.getByLabelText('B');
    await userEvent.clear(inputB);
    await userEvent.type(inputB, 'user-answer');
    expect(storeRef.current!.getState().values.b).toBe('user-answer');

    // Chunk 2: the SAME schema grown by one appended field `c` — the canonical
    // progressive-mounting growth event. `a` never changed.
    rerender(chunkUi(compileChunk([fieldA, fieldB, fieldC], bindings), storeRef));

    expect(storeRef.current!.getState().values.b).toBe('user-answer');
    // The growth itself landed: c is mounted.
    expect(screen.getByLabelText('C')).not.toBeNull();
  });

  it('still overwrites a touched target when the WATCHED field genuinely changes', async () => {
    // Subscription-driven effects are the feature, not the bug: after the user
    // touched b, changing `a` must still rewrite b with the derived value.
    const storeRef: { current: FormStore | null } = { current: null };
    render(chunkUi(compileChunk([fieldA, fieldB], copyBindings()), storeRef));

    const inputB = screen.getByLabelText('B');
    await userEvent.clear(inputB);
    await userEvent.type(inputB, 'user-answer');
    await userEvent.tab();

    const inputA = screen.getByLabelText('A');
    await userEvent.clear(inputA);
    await userEvent.type(inputA, 'bye');

    expect(storeRef.current!.getState().values.b).toBe('bye-derived');
  });

  it('a growth chunk that ARRIVES WITH a new effect still runs that new effect', async () => {
    const bindings = copyBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(chunkUi(compileChunk([fieldA, fieldB], bindings), storeRef));

    const inputB = screen.getByLabelText('B');
    await userEvent.clear(inputB);
    await userEvent.type(inputB, 'user-answer');

    // Chunk 2 appends c (default 'seed') carrying a NEW effect c -> d, plus d.
    const fieldCWithEffect: SchemaField = {
      ...fieldC,
      default: 'seed',
      effects: [{ trigger: 'change', watch: 'c', handler: 'copyToD' }],
    };
    const fieldD: SchemaField = { id: 'd', type: 'text', props: { label: 'D' } };
    rerender(chunkUi(compileChunk([fieldA, fieldB, fieldCWithEffect, fieldD], bindings), storeRef));

    const values = storeRef.current!.getState().values;
    // The new effect ran its initial pass against c's seeded default...
    expect(values.c).toBe('seed');
    expect(values.d).toBe('seed-dcopy');
    // ...without clobbering the user's answer on the way.
    expect(values.b).toBe('user-answer');
  });

  it('a pure growth re-render with content-identical effects does not re-execute them', async () => {
    // Builder path: handler references are stable across builds, so a growth
    // chunk with UNCHANGED effects must keep the SAME engine alive. Tearing it
    // down re-runs `runInitialEffects`, re-executing every effect (a re-fired
    // remote lookup per streamed chunk) and aborting in-flight ones.
    let executions = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const effectsA = [
      onChange('a', async (value, { setValue }) => {
        executions += 1;
        await gate;
        setValue('b', `${String(value)}-late`);
      }),
    ];
    const build = (grown: boolean) => {
      const builder = form
        .create(catalog, 'growth-form')
        .add({ id: 'a', type: 'text', props: { label: 'A' }, effects: effectsA })
        .add({ id: 'b', type: 'text', props: { label: 'B' } });
      return (
        grown ? builder.add({ id: 'c', type: 'text', props: { label: 'C' } }) : builder
      ).build();
    };
    const storeRef: { current: FormStore | null } = { current: null };
    const ui = (grown: boolean) => {
      const formConfig = build(grown);
      return (
        <FormProvider formConfig={formConfig}>
          <StoreCapture storeRef={storeRef} />
          {formConfig.allFields.map((field) => (
            <FormField key={field.id} id={field.id} />
          ))}
        </FormProvider>
      );
    };
    const { rerender } = render(ui(false));

    // One keystroke starts the gated async effect.
    await userEvent.type(screen.getByLabelText('A'), 'g');
    expect(executions).toBe(1);
    expect(storeRef.current!.getState().values.b).toBeUndefined();

    // Growth chunk arrives mid-flight: same effects content, fresh effectsMap object.
    rerender(ui(true));

    // The engine survived the growth: the effect was NOT re-executed...
    expect(executions).toBe(1);

    await act(async () => {
      release?.();
      await gate;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // ...and the ORIGINAL in-flight run completed instead of being aborted.
    expect(executions).toBe(1);
    expect(storeRef.current!.getState().values.b).toBe('g-late');
  });
});

/**
 * R11-B5 — a late async effect must not resurrect a REMOVED repeatable row's
 * composite key in the store (`lines[k0].price` back after removal). Mirrors
 * the validation-side row-liveness guard (f581563): a write whose row is no
 * longer in `_repeatableOrder` is dropped.
 */
describe('late async effect versus a removed repeatable row (R11-B5)', () => {
  function priceSetup() {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bindings: Bindings = {
      effects: {
        priceLookup: async (_newValue, context) => {
          // Capture the row keys that are live when the lookup STARTS.
          const rowKeys = Object.keys(context.getValues()).filter((key) =>
            key.startsWith('lines[')
          );
          await gate;
          for (const key of rowKeys) {
            context.setValue(key, 'looked-up');
          }
        },
      },
    };
    const { formConfig, defaultValues } = compileForm(
      {
        id: 'order',
        rows: [
          {
            fields: [
              {
                id: 'currency',
                type: 'text',
                props: { label: 'Currency' },
                effects: [{ trigger: 'change', watch: 'currency', handler: 'priceLookup' }],
              },
            ],
          },
          {
            kind: 'repeatable',
            repeatable: {
              id: 'lines',
              min: 0,
              rows: [
                { fields: [{ id: 'price', type: 'text', props: { label: 'Price' }, default: '' }] },
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
        <FormField id="currency" />
        <FormList id="lines">
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
    return { storeRef, release: () => release?.(), gate };
  }

  it('drops the late write for a row no longer in _repeatableOrder', async () => {
    const { storeRef, release, gate } = priceSetup();

    await userEvent.click(screen.getByRole('button', { name: 'add-row' }));
    expect(Object.keys(storeRef.current!.getState().values)).toContain('lines[k0].price');

    // The lookup starts while the row is live...
    await userEvent.type(screen.getByLabelText('Currency'), 'E');
    // ...and the row is removed before it settles.
    await userEvent.click(screen.getByRole('button', { name: 'remove-0' }));
    expect(
      Object.keys(storeRef.current!.getState().values).filter((key) => key.startsWith('lines['))
    ).toEqual([]);

    await act(async () => {
      release();
      await gate;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The ghost key must NOT be resurrected.
    expect(
      Object.keys(storeRef.current!.getState().values).filter((key) => key.startsWith('lines['))
    ).toEqual([]);
  });

  it('still lands the late write when the row IS live', async () => {
    const { storeRef, release, gate } = priceSetup();

    await userEvent.click(screen.getByRole('button', { name: 'add-row' }));
    await userEvent.type(screen.getByLabelText('Currency'), 'E');

    await act(async () => {
      release();
      await gate;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(storeRef.current!.getState().values['lines[k0].price']).toBe('looked-up');
  });
});
