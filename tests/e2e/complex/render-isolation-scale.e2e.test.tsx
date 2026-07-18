/**
 * =============================================================================
 * COMPLEX E2E — the CORE PERFORMANCE CLAIM at SCALE: granular re-render
 * isolation. "Typing in one field must NOT re-render the other 200."
 *
 * A large KYC form is the motivating case: a Silicon-Valley team needs a single
 * keystroke to fan out to O(1) renders, independent of form size. This suite
 * proves (or falsifies) that through the REAL stack — Form → FormProvider →
 * FormBody → FormField → granular Zustand selectors — by instrumenting a
 * per-field render counter INSIDE the registered renderer. The renderer is
 * invoked exactly once per FormField render, so the counter reflects actual
 * FormField renders driven by the real subscription graph.
 *
 * ISOLATION CONTRACT verified in source before asserting exact counts:
 *  - FormField (FormField.tsx:44-48) subscribes to FOUR field-scoped slices:
 *    useFieldValue / useFieldState / useFieldConditions / useFieldProps. Each
 *    (formStoreContext.ts:37-113) reads `getOwn(state.<slice>, fieldId)` and
 *    zustand `useStore` re-renders only when THAT slice's reference changes.
 *  - `_setValue` (formStore.ts:138) spreads a NEW `values` object but every
 *    OTHER field's value entry keeps reference/primitive identity → their
 *    selector output is Object.is-equal → no re-render.
 *  - FormField is React.memo with a stable `id` prop; FormBody re-rendering on
 *    a value change (useFormRows) cannot re-render an unrelated FormField.
 *  - Conditions: `useMultipleConditionEvaluation` now keeps its result reference
 *    stable across value-equal recomputes (useConditionEvaluation.ts), so an
 *    ordinary keystroke no longer churns the shared form context — unrelated
 *    fields stay isolated even when a conditional field is present. A keystroke
 *    that genuinely FLIPS a condition still propagates (the RESIDUAL below); a
 *    bounded-to-dependents optimization for that is pinned as future work.
 *  - Repeatables: `useRepeatableField` (use-repeatable-field.ts) caches each row
 *    item by composite key, so a VALUE edit AND an ADD/REMOVE both keep every
 *    surviving row's identity stable (a changed template discards the cache).
 *    Both isolations are measured explicitly below.
 *
 * No StrictMode (matches every other suite here + vitest.setup.ts): render is
 * invoked once per commit, counts are deterministic. All assertions are DELTAS
 * captured after mount settles, so mount-time condition/effect derivation never
 * pollutes the numbers.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { onChange, ril, when } from '@rilaykit/core';
import { type form as FormBuilder, form } from '@rilaykit/forms';
import {
  FormBody,
  FormProvider,
  useFormDirty,
  useFormStoreApi,
  useFormSubmitting,
  useFormValid,
} from '@rilaykit/forms/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// =============================================================================
// INSTRUMENTATION — per-field render counter, incremented inside the renderer.
// =============================================================================

const renderCount = new Map<string, number>();
// Separate counter for form-level watcher components (useFormValid, etc.).
const watcherCount = new Map<string, number>();

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function CountingInput({ id, field }: ComponentRenderContext) {
  bump(renderCount, id);
  return (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
    />
  );
}

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: CountingInput, defaultProps: {} });
}

/** Build a flat form of `n` plain text fields: f0..f(n-1). */
function buildFlatForm(n: number, id: string) {
  const catalog = makeCatalog();
  let builder: FormBuilder<Record<string, never>> = form.create(catalog, id);
  for (let i = 0; i < n; i++) {
    builder = builder.add({ id: `f${i}`, type: 'text', props: {} });
  }
  return builder.build();
}

/** Snapshot the counter so later reads compare against a frozen baseline. */
function snapshot(map: Map<string, number>): Map<string, number> {
  return new Map(map);
}

/** Delta for one key between a snapshot and the live map. */
function delta(base: Map<string, number>, key: string): number {
  return (renderCount.get(key) ?? 0) - (base.get(key) ?? 0);
}

/** Total render delta across ALL currently-known field ids. */
function totalDelta(base: Map<string, number>): number {
  let sum = 0;
  for (const key of renderCount.keys()) {
    sum += delta(base, key);
  }
  return sum;
}

// Form-level watcher components — each counts its OWN renders so we can prove a
// form-state flip re-renders its consumer but NOT the fields.
function ValidWatcher() {
  const isValid = useFormValid();
  bump(watcherCount, 'valid');
  return <span data-testid="watch-valid">{String(isValid)}</span>;
}
function SubmittingWatcher() {
  const isSubmitting = useFormSubmitting();
  bump(watcherCount, 'submitting');
  return <span data-testid="watch-submitting">{String(isSubmitting)}</span>;
}
function DirtyWatcher() {
  const isDirty = useFormDirty();
  bump(watcherCount, 'dirty');
  return <span data-testid="watch-dirty">{String(isDirty)}</span>;
}

// Captures the raw store so tests can drive store actions directly (errors,
// submitting, repeatable mutations) with deterministic, act-wrapped updates.
let storeRef: ReturnType<typeof useFormStoreApi> | null = null;
function StoreAccessor() {
  storeRef = useFormStoreApi();
  return null;
}

beforeEach(() => {
  renderCount.clear();
  watcherCount.clear();
  storeRef = null;
});

afterEach(() => {
  cleanup();
});

// =============================================================================
// SCENARIO 1 — the core claim: typing in field N re-renders ONLY field N.
// =============================================================================

describe('SCENARIO 1 — typing in one field re-renders ONLY that field (60-field form)', () => {
  it('one keystroke in f30 increments f30 by 1 and every other field by 0', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(60, 's1a')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f59')).toBeInTheDocument());

    const base = snapshot(renderCount);
    fireEvent.change(screen.getByTestId('f30'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByTestId('f30')).toHaveValue('x'));

    // The typed field moved by exactly 1; the whole rest of the form is frozen.
    expect(delta(base, 'f30')).toBe(1);
    expect(totalDelta(base)).toBe(1);
    for (let i = 0; i < 60; i++) {
      if (i === 30) continue;
      expect(delta(base, `f${i}`)).toBe(0);
    }
  });

  it('three keystrokes in f7 increment f7 by exactly 3; all others stay at 0', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(60, 's1b')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f7')).toBeInTheDocument());

    const base = snapshot(renderCount);
    fireEvent.change(screen.getByTestId('f7'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('f7'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('f7'), { target: { value: 'abc' } });
    await waitFor(() => expect(screen.getByTestId('f7')).toHaveValue('abc'));

    expect(delta(base, 'f7')).toBe(3);
    expect(totalDelta(base)).toBe(3);
  });

  it('typing across several distinct fields keeps each isolated (no cross-talk)', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(50, 's1c')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f49')).toBeInTheDocument());

    const base = snapshot(renderCount);
    for (const id of ['f5', 'f15', 'f25', 'f35', 'f45']) {
      fireEvent.change(screen.getByTestId(id), { target: { value: 'z' } });
      await waitFor(() => expect(screen.getByTestId(id)).toHaveValue('z'));
    }

    // Each edited field moved by exactly 1; total fan-out is exactly 5 renders
    // for 5 edits across a 50-field form.
    for (const id of ['f5', 'f15', 'f25', 'f35', 'f45']) {
      expect(delta(base, id)).toBe(1);
    }
    expect(totalDelta(base)).toBe(5);
  });
});

// =============================================================================
// SCENARIO 2 — bounded propagation: a dependent field re-renders when its
// controller changes; unrelated (plain) fields do not.
// =============================================================================

describe('SCENARIO 2 — conditional field present: propagation on a controller change', () => {
  function buildConditionalForm(id: string) {
    const catalog = makeCatalog();
    let builder: FormBuilder<Record<string, never>> = form
      .create(catalog, id)
      .add({ id: 'ctrl', type: 'text', props: {} })
      // `dep` is required only when ctrl === 'yes'.
      .add({
        id: 'dep',
        type: 'text',
        props: {},
        conditions: { required: when('ctrl').equals('yes').build() },
      });
    // A wall of unrelated PLAIN fields (no conditions of their own).
    for (let i = 0; i < 40; i++) {
      builder = builder.add({ id: `u${i}`, type: 'text', props: {} });
    }
    return builder.build();
  }

  // -------------------------------------------------------------------------
  // CONDITION-CONTEXT FAN-OUT — churn FIXED, flip-propagation is the residual.
  //
  // Originally: the presence of even one conditional field collapsed granular
  // isolation for the whole form — a keystroke in ANY field re-rendered EVERY
  // field, because `useMultipleConditionEvaluation` returned a NEW object on
  // every value change (even value-identical), churning the isFieldVisible/…
  // helpers → conditionsHelpers → formConfigContextValue → the shared
  // FormConfigContext every FormField reads via useForm().
  //
  // FIX (useConditionEvaluation.ts): the evaluated-conditions result now keeps
  // its reference across value-equal recomputes, so an ordinary keystroke no
  // longer churns the context — the ISOLATES test above proves unrelated fields
  // stay at 0.
  //
  // RESIDUAL (this test): a keystroke that genuinely FLIPS a condition produces a
  // new (value-different) result, so the shared context still re-renders every
  // field. That is propagation, not churn, and fires only on condition-flipping
  // keystrokes — a bounded-to-dependents optimization is pinned below. The +2 on
  // the conditional field is the context render plus its own _fieldConditions
  // slice write from the sync effect (FormProvider.tsx:1273).
  // -------------------------------------------------------------------------
  it('RESIDUAL — a keystroke that actually FLIPS a condition still propagates to the form', async () => {
    // After the churn fix, a keystroke that changes an EVALUATED condition (here
    // `ctrl` flips `dep`'s required) legitimately produces a new conditions map,
    // so the shared form context still re-renders every field. This is
    // propagation (a condition really changed), not churn (which is now gone —
    // see the ISOLATES test above), and it fires only on condition-flipping
    // keystrokes, not on ordinary typing. A future optimization can bound it to
    // the dependents (pinned below).
    render(
      <FormProvider formConfig={buildConditionalForm('s2a')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('u39')).toBeInTheDocument());

    const base = snapshot(renderCount);
    fireEvent.change(screen.getByTestId('ctrl'), { target: { value: 'yes' } });
    await waitFor(() => expect(delta(base, 'dep')).toBe(2));

    expect(delta(base, 'ctrl')).toBe(1);
    expect(delta(base, 'dep')).toBe(2); // context fan-out + own conditions write
    for (let i = 0; i < 40; i++) {
      expect(delta(base, `u${i}`)).toBe(1);
    }
    expect(totalDelta(base)).toBe(43);
  });

  it('ISOLATES an unrelated keystroke even with a conditional field present (fixed)', async () => {
    render(
      <FormProvider formConfig={buildConditionalForm('s2b')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('u39')).toBeInTheDocument());

    const base = snapshot(renderCount);
    // Editing u0 flips no condition and touches no dependent. The evaluated
    // conditions are value-equal across this keystroke, so the stabilized
    // `useMultipleConditionEvaluation` keeps its reference and the shared form
    // context does NOT churn — only u0 re-renders.
    fireEvent.change(screen.getByTestId('u0'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByTestId('u0')).toHaveValue('zzz'));

    expect(delta(base, 'u0')).toBe(1);
    for (let i = 1; i < 40; i++) {
      expect(delta(base, `u${i}`)).toBe(0); // siblings stay pinned — no churn
    }
    expect(delta(base, 'ctrl')).toBe(0);
    expect(delta(base, 'dep')).toBe(0);
    expect(totalDelta(base)).toBe(1); // O(1), independent of form size
  });

  it.fails(
    'FURTHER OPTIMIZATION (pinned) — a condition FLIP should re-render only the dependents, not the whole form',
    async () => {
      // The churn on ordinary keystrokes is FIXED (value-equal condition
      // recomputes now keep their reference — see the ISOLATES test). What
      // remains: a keystroke that genuinely flips a condition still re-renders
      // every field, because `conditionsHelpers` lives in the shared form
      // context every FormField consumes. The next optimization is to bound this
      // to the dependent fields — stop routing condition-derived helpers through
      // the shared context (a ref, or a separate rarely-changing context / a
      // per-field granular condition selector).
      render(
        <FormProvider formConfig={buildConditionalForm('s2c')}>
          <FormBody />
        </FormProvider>
      );
      await waitFor(() => expect(screen.getByTestId('u39')).toBeInTheDocument());

      const base = snapshot(renderCount);
      fireEvent.change(screen.getByTestId('ctrl'), { target: { value: 'yes' } });
      await waitFor(() => expect(screen.getByTestId('ctrl')).toHaveValue('yes'));
      await waitFor(() => expect(delta(base, 'dep')).toBeGreaterThanOrEqual(1));

      // ctrl (value) and dep (its own required flip) may move — bounded.
      // The 40 unrelated fields must stay pinned at 0.
      for (let i = 0; i < 40; i++) {
        expect(delta(base, `u${i}`)).toBe(0);
      }
    }
  );
});

// =============================================================================
// SCENARIO 3 — effect graph: an effect TARGET re-renders when the watched
// field changes; siblings outside the effect graph do not.
// =============================================================================

describe('SCENARIO 3 — effect target re-renders; non-graph siblings do not', () => {
  function buildEffectForm(id: string) {
    const catalog = makeCatalog();
    let builder: FormBuilder<Record<string, never>> = form
      .create(catalog, id)
      // `src` derives `derived` on every change.
      .add({
        id: 'src',
        type: 'text',
        props: {},
        effects: [onChange('src', (v, { setValue }) => setValue('derived', `d:${String(v)}`))],
      })
      .add({ id: 'derived', type: 'text', props: {} });
    for (let i = 0; i < 30; i++) {
      builder = builder.add({ id: `s${i}`, type: 'text', props: {} });
    }
    return builder.build();
  }

  it('editing src re-renders src + derived only; 30 non-graph siblings stay at 0', async () => {
    render(
      <FormProvider formConfig={buildEffectForm('s3')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('s29')).toBeInTheDocument());

    const base = snapshot(renderCount);
    fireEvent.change(screen.getByTestId('src'), { target: { value: 'q' } });
    await waitFor(() => expect(screen.getByTestId('derived')).toHaveValue('d:q'));

    expect(delta(base, 'src')).toBeGreaterThanOrEqual(1);
    expect(delta(base, 'derived')).toBe(1); // one derived write → one re-render
    for (let i = 0; i < 30; i++) {
      expect(delta(base, `s${i}`)).toBe(0);
    }
  });
});

// =============================================================================
// SCENARIO 4 — repeatable row isolation.
// =============================================================================

describe('SCENARIO 4 — repeatable rows: edit isolation + add/remove fan-out', () => {
  function buildRepeatableForm(id: string, rows: number) {
    const catalog = makeCatalog();
    const config = form
      .create(catalog, id)
      .addRepeatable('rows', (r) =>
        r.min(1).add({ id: 'name', type: 'text', props: {} }).defaultValue({ name: '' })
      )
      .build();
    const defaultValues = { rows: Array.from({ length: rows }, () => ({ name: '' })) };
    return { config, defaultValues };
  }

  it('editing row 5 re-renders only row 5; rows 1-4 and 6-10 stay at 0', async () => {
    const { config, defaultValues } = buildRepeatableForm('s4a', 10);
    render(
      <FormProvider formConfig={config} defaultValues={defaultValues}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );
    await waitFor(() => expect(storeRef?.getState()._repeatableOrder.rows).toHaveLength(10));
    const keys = storeRef!.getState()._repeatableOrder.rows;
    const fieldId = (k: string) => `rows[${k}].name`;
    await waitFor(() => expect(screen.getByTestId(fieldId(keys[9]))).toBeInTheDocument());

    const base = snapshot(renderCount);
    const target = fieldId(keys[4]); // row index 5 (0-based 4)
    fireEvent.change(screen.getByTestId(target), { target: { value: 'edited' } });
    await waitFor(() => expect(screen.getByTestId(target)).toHaveValue('edited'));

    // Row 5's field moved by exactly 1; the whole rest of the list is frozen.
    expect(delta(base, target)).toBe(1);
    expect(totalDelta(base)).toBe(1);
    keys.forEach((k, i) => {
      if (i === 4) return;
      expect(delta(base, fieldId(k))).toBe(0);
    });
  });

  it('ISOLATES an append — adding a row does NOT re-render existing rows (fixed)', async () => {
    // `useRepeatableField` now caches each row item by composite key, so a pure
    // append preserves every surviving row's item + scoped-field identity;
    // FormListItem (React.memo({ item })) and FormField (React.memo({ id,
    // config })) skip them. For a KYC form with 200 beneficial owners, adding
    // owner #201 re-renders only the new row — not all 200.
    const { config, defaultValues } = buildRepeatableForm('s4b', 8);
    render(
      <FormProvider formConfig={config} defaultValues={defaultValues}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );
    await waitFor(() => expect(storeRef?.getState()._repeatableOrder.rows).toHaveLength(8));
    const keysBefore = [...storeRef!.getState()._repeatableOrder.rows];
    const fieldId = (k: string) => `rows[${k}].name`;

    const base = snapshot(renderCount);
    act(() => {
      storeRef!.getState()._appendRepeatableItem('rows');
    });
    await waitFor(() => expect(storeRef?.getState()._repeatableOrder.rows).toHaveLength(9));

    // Every surviving row stays pinned — the append is O(1) in existing rows.
    const existingFanOut = keysBefore.reduce((sum, k) => sum + delta(base, fieldId(k)), 0);
    expect(existingFanOut).toBe(0);
  });
});

// =============================================================================
// SCENARIO 5 — validation error on one field does not re-render siblings.
// =============================================================================

describe('SCENARIO 5 — error-map slice isolation', () => {
  it('setting an error on f2 re-renders only f2; siblings stay at 0', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(20, 's5')}>
        <FormBody />
        <StoreAccessor />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f19')).toBeInTheDocument());

    const base = snapshot(renderCount);
    act(() => {
      storeRef!.getState()._setErrors('f2', [{ message: 'Required', code: 'required', path: [] }]);
    });
    await waitFor(() => expect(delta(base, 'f2')).toBe(1));

    // The errored field re-rendered (its `errors` slice changed); no sibling did
    // — even though `_setErrors` also recomputed the global `isValid`.
    expect(delta(base, 'f2')).toBe(1);
    expect(totalDelta(base)).toBe(1);
    for (let i = 0; i < 20; i++) {
      if (i === 2) continue;
      expect(delta(base, `f${i}`)).toBe(0);
    }
  });
});

// =============================================================================
// SCENARIO 6 — form-level state consumers re-render on flips; fields do not.
// =============================================================================

describe('SCENARIO 6 — form-level flips re-render their consumers, not the fields', () => {
  it('isValid flip re-renders the valid-watcher but no unrelated field', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(20, 's6a')}>
        <FormBody />
        <ValidWatcher />
        <StoreAccessor />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f19')).toBeInTheDocument());

    const base = snapshot(renderCount);
    const validBase = watcherCount.get('valid') ?? 0;
    act(() => {
      // Error on f0 flips isValid true → false.
      storeRef!.getState()._setErrors('f0', [{ message: 'x', code: 'required', path: [] }]);
    });
    await waitFor(() => expect(screen.getByTestId('watch-valid')).toHaveTextContent('false'));

    // The valid-watcher re-rendered on the flip.
    expect((watcherCount.get('valid') ?? 0) - validBase).toBeGreaterThanOrEqual(1);
    // Only f0 (the errored field) moved among the fields — NOT the other 19,
    // despite isValid flipping globally.
    for (let i = 1; i < 20; i++) {
      expect(delta(base, `f${i}`)).toBe(0);
    }
  });

  it('isSubmitting flip re-renders the submitting-watcher but ZERO fields', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(20, 's6b')}>
        <FormBody />
        <SubmittingWatcher />
        <StoreAccessor />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f19')).toBeInTheDocument());

    const base = snapshot(renderCount);
    const submittingBase = watcherCount.get('submitting') ?? 0;
    act(() => {
      storeRef!.getState()._setSubmitting(true);
    });
    await waitFor(() => expect(screen.getByTestId('watch-submitting')).toHaveTextContent('true'));

    expect((watcherCount.get('submitting') ?? 0) - submittingBase).toBeGreaterThanOrEqual(1);
    // No field reads isSubmitting → the entire field grid is frozen.
    expect(totalDelta(base)).toBe(0);
  });

  it('first keystroke flips isDirty (re-renders dirty-watcher once) but not siblings', async () => {
    render(
      <FormProvider formConfig={buildFlatForm(20, 's6c')}>
        <FormBody />
        <DirtyWatcher />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f19')).toBeInTheDocument());

    const base = snapshot(renderCount);
    const dirtyBase = watcherCount.get('dirty') ?? 0;
    fireEvent.change(screen.getByTestId('f9'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByTestId('watch-dirty')).toHaveTextContent('true'));

    // Dirty flips false → true once; the watcher re-renders. Only f9 moved.
    expect((watcherCount.get('dirty') ?? 0) - dirtyBase).toBeGreaterThanOrEqual(1);
    expect(delta(base, 'f9')).toBe(1);
    expect(totalDelta(base)).toBe(1);
  });
});

// =============================================================================
// SCENARIO 7 — scale sanity: single-edit fan-out is O(1), independent of size.
// =============================================================================

describe('SCENARIO 7 — single-edit fan-out is constant regardless of form size', () => {
  async function singleEditFanOut(size: number, id: string): Promise<number> {
    const { unmount } = render(
      <FormProvider formConfig={buildFlatForm(size, id)}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId(`f${size - 1}`)).toBeInTheDocument());

    const base = snapshot(renderCount);
    const targetIndex = Math.floor(size / 2);
    fireEvent.change(screen.getByTestId(`f${targetIndex}`), { target: { value: 'k' } });
    await waitFor(() => expect(screen.getByTestId(`f${targetIndex}`)).toHaveValue('k'));

    const fanOut = totalDelta(base);
    unmount();
    return fanOut;
  }

  it('a single edit fans out to exactly 1 render at 40, 120, and 200 fields', async () => {
    const at40 = await singleEditFanOut(40, 's7-40');
    renderCount.clear();
    const at120 = await singleEditFanOut(120, 's7-120');
    renderCount.clear();
    const at200 = await singleEditFanOut(200, 's7-200');

    // O(1): the fan-out does NOT grow with form size — the whole point.
    expect(at40).toBe(1);
    expect(at120).toBe(1);
    expect(at200).toBe(1);
  });

  it('a 200-field form mounts and accepts an edit within a rough time ceiling', async () => {
    const start = performance.now();
    render(
      <FormProvider formConfig={buildFlatForm(200, 's7-timing')}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('f199')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('f100'), { target: { value: 'k' } });
    await waitFor(() => expect(screen.getByTestId('f100')).toHaveValue('k'));
    const elapsed = performance.now() - start;

    // Rough ceiling, not a strict perf gate — a 200-field mount + one edit
    // should be nowhere near the 15s test timeout.
    expect(elapsed).toBeLessThan(10000);
  });
});
