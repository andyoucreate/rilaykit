import type { ComponentRenderContext } from '@rilaykit/core';
import { onChange, ril } from '@rilaykit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';
import { compileForm } from '../../src/schema/compile-form';
import type { Bindings } from '../../src/schema/types';
import { type FormStore, useFormStoreApi } from '../../src/stores';

const catalog = ril
  .create()
  .component('text', {
    description: 'Text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <input
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </label>
    ),
  })
  .component('textarea', {
    description: 'Textarea',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props, field }: ComponentRenderContext) => (
      <label>
        {String(props.label)}
        <textarea
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
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

function deriveBindings(): Bindings {
  return {
    effects: {
      derive: (newValue, context) => {
        context.setValue('dst', `derived:${String(newValue)}`);
      },
    },
  };
}

function srcField(type: string, def?: string): SchemaField {
  return {
    id: 'src',
    type,
    props: { label: 'Src' },
    ...(def !== undefined ? { default: def } : {}),
    effects: [{ trigger: 'change', watch: 'src', handler: 'derive' }],
  };
}

const dstField: SchemaField = { id: 'dst', type: 'text', props: { label: 'Dst' } };

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
 * R16-A6 — a default RE-SEEDED on a WATCHED field by the provider's
 * growth/retype/default-upgrade layout effect must not fire that field's effect
 * as a USER-grade change. The seed is bracketed by `isApplyingConfigRef`, but
 * the effect engine holds its OWN values subscription: it used to observe the
 * seed with a null cascade chain (`initial: false`), bypassing the user-owned
 * target guard, and the derived write silently replaced the answer the user
 * had typed into the TARGET field — user-input corruption on the exact path
 * progressive mounting exists to protect. A seeded default is default-grade:
 * its cascade must carry `initial: true`, exactly like `runInitialEffects`.
 */
describe('provider-seeded default versus a user-owned effect target (R16-A6)', () => {
  it("variant (a) retype: the re-seeded default's effect does not clobber the user's dst answer", async () => {
    const bindings = deriveBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(
      chunkUi(compileChunk([srcField('text', 'hello'), dstField], bindings), storeRef)
    );

    // Intended initial derive at mount.
    expect(storeRef.current!.getState().values.dst).toBe('derived:hello');

    // The user types into src (so the retype has a user value to drop)...
    const inputSrc = screen.getByLabelText('Src');
    await userEvent.clear(inputSrc);
    await userEvent.type(inputSrc, 'mine');
    expect(storeRef.current!.getState().values.dst).toBe('derived:mine');

    // ...then answers dst themselves (typing, no blur — the schema is still
    // streaming under their cursor).
    const inputDst = screen.getByLabelText('Dst');
    await userEvent.clear(inputDst);
    await userEvent.type(inputDst, 'USER');
    expect(storeRef.current!.getState().values.dst).toBe('USER');

    // Chunk 2: src's torn type completes text→textarea. The retype pass drops
    // the user's src value and re-seeds the default 'hello' — a provider write,
    // nobody's interaction.
    rerender(chunkUi(compileChunk([srcField('textarea', 'hello'), dstField], bindings), storeRef));

    // The retype itself landed: src was re-seeded from the new compile.
    expect(storeRef.current!.getState().values.src).toBe('hello');
    // The seed must NOT have fired src's effect user-grade over the user's answer.
    expect(storeRef.current!.getState().values.dst).toBe('USER');
  });

  it("variant (b) torn default completing: the upgrade seed does not clobber the user's dst answer", async () => {
    const bindings = deriveBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(
      chunkUi(compileChunk([srcField('text', 'hel'), dstField], bindings), storeRef)
    );

    expect(storeRef.current!.getState().values.dst).toBe('derived:hel');

    // The user answers dst; src stays pristine on its torn default.
    const inputDst = screen.getByLabelText('Dst');
    await userEvent.clear(inputDst);
    await userEvent.type(inputDst, 'USER');
    expect(storeRef.current!.getState().values.dst).toBe('USER');

    // Chunk 2: the SAME schema, src's inline default completed 'hel'→'hello'.
    rerender(chunkUi(compileChunk([srcField('text', 'hello'), dstField], bindings), storeRef));

    // The default upgrade itself landed on the pristine src...
    expect(storeRef.current!.getState().values.src).toBe('hello');
    // ...without firing the effect over the user's answer.
    expect(storeRef.current!.getState().values.dst).toBe('USER');
  });

  it('variant (b) on the builder path (no engine rebuild): the SAME engine observing the seed is guarded too', async () => {
    // Builder-path handlers are reference-stable, so `effectsMapEquals` keeps
    // the running engine across the upgrade chunk — this is the pure
    // same-engine-observes-seed path (the compiled variants above rebuild
    // passively, so there the OLD engine observes the seed; both must hold).
    const effects = [
      onChange('src', (value, { setValue }) => {
        setValue('dst', `derived:${String(value)}`);
      }),
    ];
    const formConfig = form
      .create(catalog, 'seed-form')
      .add({ id: 'src', type: 'text', props: { label: 'Src' }, effects })
      .add({ id: 'dst', type: 'text', props: { label: 'Dst' } })
      .build();
    const storeRef: { current: FormStore | null } = { current: null };
    const ui = (defaults: Record<string, unknown>) => (
      <FormProvider formConfig={formConfig} defaultValues={defaults}>
        <StoreCapture storeRef={storeRef} />
        {formConfig.allFields.map((field) => (
          <FormField key={field.id} id={field.id} />
        ))}
      </FormProvider>
    );
    const { rerender } = render(ui({ src: 'hel' }));

    expect(storeRef.current!.getState().values.dst).toBe('derived:hel');

    const inputDst = screen.getByLabelText('Dst');
    await userEvent.clear(inputDst);
    await userEvent.type(inputDst, 'USER');

    // The torn default completes under an IDENTICAL formConfig object: no
    // rebuild, the mounted engine's own subscription observes the upgrade seed.
    rerender(ui({ src: 'hello' }));

    expect(storeRef.current!.getState().values.src).toBe('hello');
    expect(storeRef.current!.getState().values.dst).toBe('USER');
  });

  it('PIN: a real user change to src still re-derives dst (subscription-grade fires are the feature)', async () => {
    const bindings = deriveBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    render(chunkUi(compileChunk([srcField('text', 'hello'), dstField], bindings), storeRef));

    const inputDst = screen.getByLabelText('Dst');
    await userEvent.clear(inputDst);
    await userEvent.type(inputDst, 'USER');
    await userEvent.tab();

    const inputSrc = screen.getByLabelText('Src');
    await userEvent.clear(inputSrc);
    await userEvent.type(inputSrc, 'bye');

    // A watched change the USER made legitimately rewrites its derived target.
    expect(storeRef.current!.getState().values.dst).toBe('derived:bye');
  });

  it('PIN: a late-APPEARING default still derives its untouched dependent (initial-grade, not suppressed)', async () => {
    // src arrives WITHOUT a default; nothing ever wrote dst, so dst is
    // nobody's. When src's default APPEARS on a later chunk, the seed must
    // still run the derive — that is exactly runInitialEffects' job, and the
    // fix tags the seed initial-grade rather than suppressing the fire.
    const bindings = deriveBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(
      chunkUi(compileChunk([srcField('text'), dstField], bindings), storeRef)
    );

    expect(storeRef.current!.getState().values.src).toBeUndefined();
    expect(storeRef.current!.getState().values.dst).toBeUndefined();

    rerender(chunkUi(compileChunk([srcField('text', 'hello'), dstField], bindings), storeRef));

    expect(storeRef.current!.getState().values.src).toBe('hello');
    expect(storeRef.current!.getState().values.dst).toBe('derived:hello');
  });

  it('DOCUMENTED TRADE: a default upgrade does not re-derive a target the mount-time effect already wrote', async () => {
    // At first mount the initial derive writes dst — and the provider's
    // interaction record deliberately counts an effect's write as an
    // interaction with dst. So when src's torn default completes, the
    // initial-grade seed's re-derive onto dst is dropped by the user-owned
    // guard and dst keeps the stale 'derived:hel'. This is the same
    // conservative trade the engine already makes when a genuine rebuild
    // re-runs runInitialEffects: never rewrite a field somebody (user OR
    // effect) already filled, because the engine cannot tell the two apart —
    // and losing a keystroke is strictly worse than keeping a stale derive.
    const bindings = deriveBindings();
    const storeRef: { current: FormStore | null } = { current: null };
    const { rerender } = render(
      chunkUi(compileChunk([srcField('text', 'hel'), dstField], bindings), storeRef)
    );

    expect(storeRef.current!.getState().values.dst).toBe('derived:hel');

    rerender(chunkUi(compileChunk([srcField('text', 'hello'), dstField], bindings), storeRef));

    expect(storeRef.current!.getState().values.src).toBe('hello');
    expect(storeRef.current!.getState().values.dst).toBe('derived:hel');
  });
});
