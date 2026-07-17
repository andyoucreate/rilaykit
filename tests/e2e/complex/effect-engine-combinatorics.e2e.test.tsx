import { onChange, required, when } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { createFormStore, form } from '@rilaykit/forms';
import { FormBody, FormProvider, useFormStoreApi } from '@rilaykit/forms/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Deep source import: EffectEngine is not on the package's public surface, but
// these scenarios need to drive it in isolation (no React) with exact control
// over the cascade chain, abort controllers and the user-owned/initial guards.
import { EffectEngine } from '../../../packages/forms/src/effects/effect-engine';
import {
  FieldErrorDisplay,
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
} from '../_setup/test-helpers';

// =====================================================================
// COMPLEX E2E: field-EFFECT engine combinatorics.
//
// Two halves:
//   1. DIRECT-ENGINE — an EffectEngine bound to a bare createFormStore(), so a
//      cascade / cycle / abort / initial-guard runs with no React or provider
//      wiring in the way. Every asserted contract is verified against
//      effect-engine.ts first (line refs in comments).
//   2. FULL-PROVIDER — the engine as the real FormProvider wires it, combining
//      axes that are individually covered elsewhere but never TOGETHER:
//      effect↔condition feedback, repeatable fan-out mid-cascade, initial
//      derivation, effect→validation ordering, and setProps→renderer.
// =====================================================================

// ---------------------------------------------------------------------
// PART 1 — DIRECT ENGINE
// ---------------------------------------------------------------------
describe('Effect engine (direct): cascade / cycle / abort / guards', () => {
  // A deferred whose resolution the test controls — no timers, fully
  // deterministic ordering of async effect completion.
  function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  // --- Scenario 1a: cascade chain A→B→C→D propagates in ONE change, in order.
  it('a 4-link cascade A→B→C→D propagates in one change, in declaration order, exact values', () => {
    const store = createFormStore({ a: '', b: '', c: '', d: '' });
    const order: string[] = [];
    const engine = new EffectEngine({
      store,
      effectsMap: {
        a: [
          onChange('a', (v, { setValue }) => {
            order.push('a');
            setValue('b', `b(${String(v)})`);
          }),
        ],
        b: [
          onChange('b', (v, { setValue }) => {
            order.push('b');
            setValue('c', `c(${String(v)})`);
          }),
        ],
        c: [
          onChange('c', (v, { setValue }) => {
            order.push('c');
            setValue('d', `d(${String(v)})`);
          }),
        ],
      },
    });
    engine.start();

    // A single user-grade write to `a` — the whole chain settles synchronously
    // (zustand notifies inside `set`, sync effects run to completion).
    store.getState()._setValue('a', 'X');

    expect(order).toEqual(['a', 'b', 'c']);
    const values = store.getState().values;
    expect(values.b).toBe('b(X)');
    expect(values.c).toBe('c(b(X))');
    expect(values.d).toBe('d(c(b(X)))');

    engine.stop();
  });

  // --- Scenario 1b: a genuine cycle A→B→A is bounded by the visited set.
  it('a cycle A↔B is bounded (no infinite loop, no crash) by the visited-set guard', () => {
    const store = createFormStore({ a: '', b: '' });
    let aRuns = 0;
    let bRuns = 0;
    const engine = new EffectEngine({
      store,
      effectsMap: {
        a: [
          onChange('a', (v, { setValue }) => {
            aRuns++;
            setValue('b', `B:${String(v)}`);
          }),
        ],
        b: [
          onChange('b', (v, { setValue }) => {
            bRuns++;
            setValue('a', `A:${String(v)}`);
          }),
        ],
      },
    });
    engine.start();

    // Returns (does not hang): the second visit to `a` hits chain.visited and is
    // skipped (effect-engine.ts:292). a fires once, b fires once, then a's
    // re-entry is dropped.
    store.getState()._setValue('a', 'x');

    expect(aRuns).toBe(1);
    expect(bRuns).toBe(1);
    expect(store.getState().values.b).toBe('B:x');
    // b's effect DID write a once (A:B:x); a's effect does NOT run a second time.
    expect(store.getState().values.a).toBe('A:B:x');

    engine.stop();
  });

  // --- Scenario 1c: a long LINEAR chain is capped at MAX_CASCADE_DEPTH (10).
  it('a linear chain is bounded at depth 10: field at depth 10 is written but its effect does not fire', () => {
    // f0→f1→…→f12. Each fN effect derives f(N+1).
    const N = 13;
    const initial: Record<string, unknown> = {};
    const effectsMap: Record<string, ReturnType<typeof onChange>[]> = {};
    for (let i = 0; i < N; i++) {
      initial[`f${i}`] = '';
      if (i < N - 1) {
        const next = i + 1;
        effectsMap[`f${i}`] = [
          onChange(`f${i}`, (_v, { setValue }) => {
            setValue(`f${next}`, `set${next}`);
          }),
        ];
      }
    }
    const store = createFormStore(initial);
    const engine = new EffectEngine({ store, effectsMap });
    engine.start();

    store.getState()._setValue('f0', 'go');

    const values = store.getState().values;
    // f0 changed (user), its effect ran at depth 0 → wrote f1 … up the chain.
    // A field is PROCESSED at depth = its index; the guard is `depth >= 10`
    // BEFORE effects run (effect-engine.ts:300). f10 is processed at depth 10 →
    // returns immediately → never writes f11. But f10's own VALUE was written by
    // f9's effect (which ran at depth 9) before that early return.
    expect(values.f10).toBe('set10');
    expect(values.f11).toBe(''); // depth cap stopped the cascade here
    expect(values.f12).toBe('');

    engine.stop();
  });

  // --- Scenario 3: abort — rapid input drops the superseded async run.
  it('a superseded async effect is aborted: only the latest value lands (abort keyed by fieldId)', async () => {
    const store = createFormStore({ source: '', derived: '' });
    const d1 = deferred();
    const d2 = deferred();
    let call = 0;
    const engine = new EffectEngine({
      store,
      effectsMap: {
        source: [
          onChange('source', async (v, { setValue }) => {
            const mine = ++call;
            // First invocation parks on d1, second on d2 — the test releases
            // the STALE one first to prove the abort guard drops it.
            await (mine === 1 ? d1.promise : d2.promise);
            setValue('derived', `d:${String(v)}`);
          }),
        ],
      },
    });
    engine.start();

    // Two rapid changes: the second aborts the first's controller
    // (effect-engine.ts:317-320) before the first ever resolves.
    store.getState()._setValue('source', '1');
    store.getState()._setValue('source', '2');

    // Release the STALE run first — its captured controller is aborted, so its
    // setValue is a no-op (effect-engine.ts:352 aborted-signal guard).
    d1.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().values.derived).toBe('');

    // Release the LIVE run — its write lands.
    d2.resolve();
    await waitFor(() => expect(store.getState().values.derived).toBe('d:2'));

    engine.stop();
  });

  // --- Scenario 6: user-owned target guard is INITIAL-only, checked at write time.
  it('the user-owned guard drops an INITIAL write onto a user-owned target, but a subscription write still lands', () => {
    const store = createFormStore({ src: 'seed', target: 'typed-by-user' });
    const userOwned = new Set<string>(['target']);
    const engine = new EffectEngine({
      store,
      isUserOwnedField: (id) => userOwned.has(id),
      effectsMap: {
        src: [onChange('src', (_v, { setValue }) => setValue('target', 'derived'))],
      },
    });
    engine.start();

    // INITIAL run: chain.initial === true, target is user-owned → write dropped
    // (effect-engine.ts:359). The user's answer survives.
    engine.runInitialEffects();
    expect(store.getState().values.target).toBe('typed-by-user');

    // A real subscription-driven change is USER-grade (chain.initial === false),
    // so the guard does NOT apply — the effect legitimately rewrites its derived
    // target even though `isUserOwnedField('target')` is still true.
    store.getState()._setValue('src', 'changed');
    expect(store.getState().values.target).toBe('derived');

    engine.stop();
  });

  // --- Scenario 4-liveness: a late async write to a REMOVED composite key is dropped.
  it('a late async write to a removed repeatable row (composite key) is dropped by row-liveness', async () => {
    // Hand-built repeatable-shaped store: config + order + composite values.
    const store = createFormStore({
      taxRate: '',
      'lines[k0].price': 10,
      'lines[k1].price': 20,
    });
    store.setState({
      _repeatableConfigs: {
        lines: {
          id: 'lines',
          rows: [],
          allFields: [
            { id: 'price', componentId: 'number', props: {} },
            { id: 'taxed', componentId: 'text', props: {} },
          ],
        },
      },
      _repeatableOrder: { lines: ['k0', 'k1'] },
    } as never);

    const gate = deferred();
    const engine = new EffectEngine({
      store,
      // Template effect declared in `lines`, watching a GLOBAL field → fans out
      // per live row (effect-engine.ts:397-410).
      effectsMap: {
        taxRate: [
          {
            ...onChange('taxRate', async (rate, { setValue, getFieldValue }) => {
              await gate.promise;
              setValue('taxed', `${String(getFieldValue('price'))}@${String(rate)}`);
            }),
            declaringRepeatableId: 'lines',
          },
        ],
      },
    });
    engine.start();

    store.getState()._setValue('taxRate', '9');

    // Remove k1 while both async effects are parked.
    store.setState({ _repeatableOrder: { lines: ['k0'] } } as never);

    gate.resolve();
    await waitFor(() => expect(store.getState().values['lines[k0].taxed']).toBe('10@9'));
    // k1's row is gone from the live order → its late write is refused
    // (effect-engine.ts:363 isTargetRowLive).
    expect(store.getState().values['lines[k1].taxed']).toBeUndefined();

    engine.stop();
  });
});

// ---------------------------------------------------------------------
// PART 2 — FULL PROVIDER
// ---------------------------------------------------------------------

let storeRef: ReturnType<typeof useFormStoreApi> | null = null;
function StoreAccessor() {
  const store = useFormStoreApi();
  React.useEffect(() => {
    storeRef = store;
  }, [store]);
  return null;
}

function makeConfig() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
    .component('number', { name: 'Number', renderer: MockNumberInput, defaultProps: { label: '' } })
    .component('select', {
      name: 'Select',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    });
}

describe('Effect engine (provider): condition feedback / fan-out / init / validation / props', () => {
  let rilConfig: ReturnType<typeof makeConfig>;

  beforeEach(() => {
    rilConfig = makeConfig();
    storeRef = null;
  });

  // --- Scenario 2a: an effect writes a value that flips ANOTHER field's `visible`.
  it('an effect-written value flips a dependent field visible condition live', async () => {
    const config = form
      .create(rilConfig, 'gate-form')
      .add({
        id: 'trigger',
        type: 'text',
        // Writing `trigger` derives `gate`; `secret` keys its visibility on `gate`.
        effects: [
          onChange('trigger', (v, { setValue }) =>
            setValue('gate', v === 'open' ? 'open' : 'shut')
          ),
        ],
      })
      .add({ id: 'gate', type: 'text' })
      .add({
        id: 'secret',
        type: 'text',
        conditions: { visible: when('gate').equals('open').build() },
      })
      .build();

    render(
      <FormProvider formConfig={config} defaultValues={{ trigger: '', gate: '', secret: '' }}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );

    // Hidden initially — gate is '' not 'open'.
    expect(screen.queryByTestId('input-secret')).toBeNull();

    fireEvent.change(screen.getByTestId('input-trigger'), { target: { value: 'open' } });

    // The effect set gate='open' → secret's visible condition flips → it renders.
    await waitFor(() => expect(screen.getByTestId('input-secret')).toBeInTheDocument());
    expect(storeRef!.getState().values.gate).toBe('open');

    // Flip back: effect sets gate='shut' → secret hides again.
    fireEvent.change(screen.getByTestId('input-trigger'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.queryByTestId('input-secret')).toBeNull());
  });

  // --- Scenario 2b: an effect flips a dependent field's conditional `required`.
  it('an effect-written value makes a dependent field conditionally required (live condition map)', async () => {
    const config = form
      .create(rilConfig, 'req-form')
      .add({
        id: 'trigger',
        type: 'text',
        effects: [onChange('trigger', (v, { setValue }) => setValue('gate', String(v)))],
      })
      .add({ id: 'gate', type: 'text' })
      .add({
        id: 'detail',
        type: 'text',
        conditions: { required: when('gate').equals('need').build() },
      })
      .build();

    render(
      <FormProvider formConfig={config} defaultValues={{ trigger: '', gate: '', detail: '' }}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );

    // detail starts NOT required (gate is '').
    await waitFor(() => expect(screen.getByTestId('input-detail')).toBeInTheDocument());
    expect(storeRef!.getState()._fieldConditions.detail?.required ?? false).toBe(false);

    // Flip gate to 'need' via the effect → detail becomes conditionally required.
    fireEvent.change(screen.getByTestId('input-trigger'), { target: { value: 'need' } });
    await waitFor(() => expect(storeRef!.getState().values.gate).toBe('need'));

    // The effect-written value propagated through the reactive condition layer:
    // detail's live `required` flips true off an effect-derived dependency.
    await waitFor(() => {
      expect(storeRef!.getState()._fieldConditions.detail?.required).toBe(true);
    });
  });

  // --- Scenario 4: sibling (row-scoped) + global fan-out effects, add/remove mid-life.
  it('per-row sibling derive + global fan-out coexist with row isolation across add/remove', async () => {
    const config = form
      .create(rilConfig, 'order')
      .add({ id: 'rate', type: 'text' })
      .addRepeatable('lines', (r) =>
        r
          .min(2)
          .add({ id: 'price', type: 'number' })
          .add({
            id: 'subtotal',
            type: 'text',
            // sibling watch, row-scoped
            effects: [
              onChange('price', (p, { setValue }) => setValue('subtotal', `s:${String(p)}`)),
            ],
          })
          .add({
            id: 'taxed',
            type: 'text',
            // GLOBAL watch → fans out to every live row using THIS row's price
            effects: [
              onChange('rate', (rate, { setValue, getFieldValue }) => {
                setValue('taxed', `${String(getFieldValue('price'))}@${String(rate)}`);
              }),
            ],
          })
          .defaultValue({ price: 0, subtotal: '', taxed: '' })
      )
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{
          rate: '',
          lines: [
            { price: 10, subtotal: '', taxed: '' },
            { price: 20, subtotal: '', taxed: '' },
          ],
        }}
      >
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );

    const [k0, k1] = storeRef!.getState()._repeatableOrder.lines;

    // Initial derivation already ran per row from the seeded prices: k0 's:10',
    // k1 's:20' (round-39 initial-effects contract).
    await waitFor(() => expect(storeRef!.getState().values[`lines[${k1}].subtotal`]).toBe('s:20'));

    // Sibling derive is row-scoped: editing k0.price only touches k0.subtotal.
    fireEvent.change(screen.getByTestId(`input-lines[${k0}].price`), { target: { value: '15' } });
    await waitFor(() => expect(storeRef!.getState().values[`lines[${k0}].subtotal`]).toBe('s:15'));
    // k1 is untouched by k0's edit — its seeded derivation stands (no smear).
    expect(storeRef!.getState().values[`lines[${k1}].subtotal`]).toBe('s:20');

    // Global fan-out hits BOTH rows, each with its own price.
    fireEvent.change(screen.getByTestId('input-rate'), { target: { value: '7' } });
    await waitFor(() => expect(storeRef!.getState().values[`lines[${k0}].taxed`]).toBe('15@7'));
    expect(storeRef!.getState().values[`lines[${k1}].taxed`]).toBe('20@7');
    // No stray global `taxed`/`subtotal` keys leaked outside any row.
    expect(storeRef!.getState().values.taxed).toBeUndefined();
    expect(storeRef!.getState().values.subtotal).toBeUndefined();

    // Add a row directly, seed its price, re-fire the global change.
    act(() => {
      storeRef!.getState()._appendRepeatableItem('lines', { price: 30, subtotal: '', taxed: '' });
    });
    await waitFor(() => expect(storeRef!.getState()._repeatableOrder.lines).toHaveLength(3));
    const k2 = storeRef!.getState()._repeatableOrder.lines[2];

    fireEvent.change(screen.getByTestId('input-rate'), { target: { value: '9' } });
    await waitFor(() => expect(storeRef!.getState().values[`lines[${k2}].taxed`]).toBe('30@9'));
    // Pre-existing rows recomputed too — fan-out reaches the new live-row set.
    expect(storeRef!.getState().values[`lines[${k0}].taxed`]).toBe('15@9');
    expect(storeRef!.getState().values[`lines[${k1}].taxed`]).toBe('20@9');

    // Remove k0 → a later global change must NOT resurrect any k0 key.
    act(() => {
      storeRef!.getState()._removeRepeatableItem('lines', k0);
    });
    await waitFor(() => expect(storeRef!.getState()._repeatableOrder.lines).not.toContain(k0));
    fireEvent.change(screen.getByTestId('input-rate'), { target: { value: '3' } });
    await waitFor(() => expect(storeRef!.getState().values[`lines[${k1}].taxed`]).toBe('20@3'));
    expect(storeRef!.getState().values[`lines[${k0}].taxed`]).toBeUndefined();
  });

  // --- Scenario 5: runInitialEffects fires ONCE per seeded row (no double-fire).
  it('initial derivation fires once per seeded row (no double-fire) for pre-seeded repeatable rows', async () => {
    const runs: string[] = [];
    const config = form
      .create(rilConfig, 'init-form')
      .addRepeatable('lines', (r) =>
        r
          .min(1)
          .add({ id: 'name', type: 'text' })
          .add({
            id: 'slug',
            type: 'text',
            effects: [
              onChange('name', (v, { setValue }) => {
                runs.push(String(v));
                setValue('slug', `slug:${String(v)}`);
              }),
            ],
          })
      )
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{
          lines: [
            { name: 'Alpha', slug: '' },
            { name: 'Beta', slug: '' },
          ],
        }}
      >
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );

    const [k0, k1] = storeRef!.getState()._repeatableOrder.lines;
    await waitFor(() =>
      expect(storeRef!.getState().values[`lines[${k0}].slug`]).toBe('slug:Alpha')
    );
    expect(storeRef!.getState().values[`lines[${k1}].slug`]).toBe('slug:Beta');

    // Each seeded row's effect fired exactly once at mount — not twice.
    expect(runs.filter((v) => v === 'Alpha')).toHaveLength(1);
    expect(runs.filter((v) => v === 'Beta')).toHaveLength(1);
  });

  // --- Scenario 7: effect writes a field that must then validate; its error shows.
  it('an effect-derived value is re-validated on write and its error surfaces', async () => {
    const config = form
      .create(rilConfig, 'validate-form')
      .add({
        id: 'source',
        type: 'text',
        effects: [
          // Derive `code` = first char of source → length 1 → fails minLength(3).
          onChange('source', (v, { setValue }) => setValue('code', String(v).slice(0, 1))),
        ],
      })
      .add({
        id: 'code',
        type: 'text',
        validation: { validate: required('code required'), debounceMs: 0 },
      })
      .build();

    render(
      <FormProvider formConfig={config} defaultValues={{ source: '', code: '' }}>
        <FormBody />
        <FieldErrorDisplay id="code" />
        <StoreAccessor />
      </FormProvider>
    );

    // Type into source with a value whose derived first char is non-empty → code
    // becomes 'H'. Then clear source → derived code becomes '' → required fails.
    fireEvent.change(screen.getByTestId('input-source'), { target: { value: 'Hello' } });
    await waitFor(() => expect(storeRef!.getState().values.code).toBe('H'));

    fireEvent.change(screen.getByTestId('input-source'), { target: { value: '' } });
    await waitFor(() => expect(storeRef!.getState().values.code).toBe(''));

    // The engine re-validated `code` after each effect write; the required error
    // on the derived field surfaces without the user ever touching `code`.
    await waitFor(() => {
      const codeErrors = storeRef!.getState().errors.code ?? [];
      expect(codeErrors.some((e) => e.message === 'code required')).toBe(true);
    });
  });

  // --- Scenario 8: a setProps effect updates the rendered component props.
  it('a setProps effect pushes new options to the rendered select', async () => {
    const config = form
      .create(rilConfig, 'props-form')
      .add({
        id: 'country',
        type: 'text',
        effects: [
          onChange('country', (v, { setProps }) => {
            const options =
              v === 'FR'
                ? [
                    { value: 'paris', label: 'Paris' },
                    { value: 'lyon', label: 'Lyon' },
                  ]
                : [{ value: 'nyc', label: 'New York' }];
            setProps('city', { options });
          }),
        ],
      })
      .add({ id: 'city', type: 'select' })
      .build();

    render(
      <FormProvider formConfig={config} defaultValues={{ country: '', city: '' }}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );

    // The initial run fired the effect for country='' (a defined value) →
    // the else-branch options ([nyc]) are already on the select at mount.
    await waitFor(() =>
      expect(screen.getByTestId('input-city').querySelectorAll('option')).toHaveLength(1)
    );
    expect(screen.getByTestId('input-city').textContent).toContain('New York');

    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'FR' } });

    await waitFor(() =>
      expect(screen.getByTestId('input-city').querySelectorAll('option')).toHaveLength(2)
    );
    expect(screen.getByTestId('input-city').textContent).toContain('Paris');
    expect(screen.getByTestId('input-city').textContent).toContain('Lyon');

    // Change again → props update reaches the renderer.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'US' } });
    await waitFor(() =>
      expect(screen.getByTestId('input-city').querySelectorAll('option')).toHaveLength(1)
    );
    expect(screen.getByTestId('input-city').textContent).toContain('New York');
  });
});
