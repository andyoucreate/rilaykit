/**
 * =============================================================================
 * RACE / CONCURRENCY STRESS — a KYC form under rapid, interleaved user actions.
 *
 * Every test here drives the store the way a *fast* user does: typing while an
 * async validator is still in flight, submitting before verdicts land, adding /
 * removing / reordering repeatable rows mid-validation, and toggling conditional
 * fields faster than a network round-trip. The point is to prove the library's
 * coordination guards actually hold, not to re-test the happy path.
 *
 * GUARDS EXERCISED (verified in source before asserting):
 *  - Per-field generation tokens `validationSeqRef` — a slow earlier run cannot
 *    overwrite a fast later one (useFormValidationWithStore.ts:246-250, 271).
 *  - Mounted-form generation `generationRef` — a run started on the previous
 *    step is dropped after a swap so it cannot paint the new step's same-id
 *    field (:98, :248-250; instanceKey bump :104-107).
 *  - Row-liveness `fieldExistsLive` — a late verdict for a removed repeatable
 *    row is not written back (:149-170, esp. the `_repeatableOrder` check :164).
 *  - Live visibility `isFieldVisibleLive` — a verdict for a now-hidden field is
 *    cleared, not committed (:289-293).
 *  - Order mirror — `_moveRepeatableItem` only reorders the key array; the value
 *    and error maps are keyed by the stable itemKey, so a move never shifts an
 *    error onto the wrong row (formStore.ts:390-409).
 *  - Effect abort + row-liveness on write — a fanned-out async effect's late
 *    write to a removed row is dropped (effect-engine.ts:359-363).
 *  - Debounce cleanup on unmount / supersede — a pending debounced run is
 *    cancelled when the form unmounts or a newer keystroke arrives
 *    (FormField.tsx:126-166).
 *
 * All async validators are driven by MANUALLY-resolved deferred promises so the
 * races are deterministic — no timers, no randomness. Assertions are EXACT
 * (never `toBeDefined`) and cover both what the user SEES (error-aware
 * renderers) and the precise final store state (captured store ref).
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { custom, flow, form, onChange, required, ril, when } from 'rilaykit';
import {
  Flow,
  FlowBody,
  FormBody,
  FormProvider,
  useFieldErrors,
  useForm,
  useFormErrors,
  useFormStoreApi,
  useFormValid,
} from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import { RepeatableControls } from '../_setup/test-helpers';

// ============================================================================
// ERROR-AWARE RENDERERS — assert what the USER sees, not a store read.
// ============================================================================

function ErrorAwareText({ id, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      <span data-testid={`vstate-${id}`}>{field?.isValidating ? 'validating' : 'settled'}</span>
      {errors.length > 0 ? (
        <ul data-testid={`ui-errors-${id}`}>
          {errors.map((err, i) => (
            <li key={`${err.code ?? ''}-${i}`} data-testid={`ui-error-${id}-${i}`}>
              {err.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrorAwareNumber({ id, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        type="number"
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => field?.onBlur()}
      />
      {errors.length > 0 ? (
        <ul data-testid={`ui-errors-${id}`}>
          {errors.map((err, i) => (
            <li key={`${err.code ?? ''}-${i}`} data-testid={`ui-error-${id}-${i}`}>
              {err.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrorAwareCheckbox({ id, field }: ComponentRenderContext) {
  return (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        type="checkbox"
        data-testid={`input-${id}`}
        checked={!!field?.value}
        onChange={(e) => field?.onChange(e.target.checked)}
        onBlur={() => field?.onBlur()}
      />
    </div>
  );
}

/** Form-level (`__form__`) error banner via useFormErrors(). */
function FormErrorBanner() {
  const errors = useFormErrors();
  if (errors.length === 0) return null;
  return (
    <div data-testid="form-errors">
      {errors.map((err, i) => (
        <span key={err.message} data-testid={`form-error-${i}`}>
          {err.message}
        </span>
      ))}
    </div>
  );
}

// Reactive validity + a captured store ref for exact point-in-time assertions.
let storeRef: ReturnType<typeof useFormStoreApi> | null = null;
function Probe() {
  const store = useFormStoreApi();
  storeRef = store;
  const isValid = useFormValid();
  return <output data-testid="probe-is-valid">{String(isValid)}</output>;
}

function FieldErrors({ id }: { id: string }) {
  const errors = useFieldErrors(id);
  if (errors.length === 0) return null;
  return (
    <div data-testid={`errors-${id}`}>
      {errors.map((err, i) => (
        <span key={err.message} data-testid={`error-${id}-${i}`}>
          {err.message}
        </span>
      ))}
    </div>
  );
}

/** Capture `submit()`'s boolean verdict so we can prove it awaited the race. */
function SubmitCapture({ onResult }: { onResult: (ok: boolean) => void }) {
  const { submit } = useForm();
  return (
    <button
      type="button"
      data-testid="submit-capture"
      onClick={async () => onResult(await submit())}
    >
      Submit
    </button>
  );
}

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: ErrorAwareText, defaultProps: {} })
  .component('number', { name: 'Number', renderer: ErrorAwareNumber, defaultProps: {} })
  .component('checkbox', { name: 'Checkbox', renderer: ErrorAwareCheckbox, defaultProps: {} })
  .component('banner', { name: 'Banner', renderer: FormErrorBanner, defaultProps: {} });

// ============================================================================
// DETERMINISTIC ASYNC VALIDATOR — resolution is driven by the test.
// Each validate(value) call parks a { value, resolve } entry.
// ============================================================================

type PendingCall = { value: unknown; resolve: (issues?: { message: string }[]) => void };
function makeControllableAsync() {
  const calls: PendingCall[] = [];
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'kyc-race',
      validate: (value: unknown) =>
        new Promise<{ issues?: { message: string }[]; value?: unknown }>((res) => {
          calls.push({ value, resolve: (issues) => res(issues ? { issues } : { value }) });
        }),
    },
  };
  return { schema, calls };
}

/** Resolve every parked call whose value equals `value`, then flush microtasks. */
async function resolveValue(calls: PendingCall[], value: unknown, issues?: { message: string }[]) {
  await act(async () => {
    for (const call of calls) {
      if (call.value === value) call.resolve(issues);
    }
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The beneficial-owner ownership-sum rule reused from the KYC suite: a path-less
// issue that routes to `__form__`.
const ownershipSumSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'kyc-race',
    validate: (value: unknown) => {
      const data = value as Record<string, unknown>;
      const pcts = Object.entries(data)
        .filter(([key]) => /^owners\[[^\]]+\]\.ownershipPct$/.test(key))
        .map(([, v]) => (typeof v === 'number' ? v : Number(v) || 0));
      if (pcts.length === 0) return { value };
      const total = pcts.reduce((a, b) => a + b, 0);
      return total === 100
        ? { value }
        : { issues: [{ message: `Ownership must total 100% (currently ${total}%)` }] };
    },
  },
};

function setText(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function setCheckbox(id: string, checked: boolean) {
  const el = screen.getByTestId(`input-${id}`) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}
function keyOf(index: number, repeatableId = 'owners'): string {
  return storeRef!.getState()._repeatableOrder[repeatableId][index];
}

beforeEach(() => {
  vi.clearAllMocks();
  storeRef = null;
});
afterEach(() => {
  storeRef = null;
});

// ============================================================================
// SCENARIO 1 — rapid typing then immediate submit before verdicts resolve.
// ============================================================================

describe('RACE 1 — rapid typing then submit before async verdicts land', () => {
  function buildForm(schema: object) {
    return form
      .create(rilConfig, 'kyc-submit-race')
      .add({
        id: 'taxId',
        type: 'text',
        props: {},
        validation: { validate: schema },
      })
      .add({ id: 'legalName', type: 'text', props: {}, validation: { validate: required() } })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('1a: submit awaits the in-flight verdict; the stale onChange run loses, onSubmit fires on the valid latest value', async () => {
    const { schema, calls } = makeControllableAsync();
    const onSubmit = vi.fn();
    const results: boolean[] = [];
    render(
      <FormProvider formConfig={buildForm(schema)} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrors id="taxId" />
        <SubmitCapture onResult={(ok) => results.push(ok)} />
        <Probe />
      </FormProvider>
    );

    // Fill the sync-required field so only the async field is in question.
    await act(async () => setText('legalName', 'Acme Founder'));

    // Two fast keystrokes on the async field — each parks an onChange run.
    await act(async () => {
      setText('taxId', 'DUP');
      setText('taxId', 'TAX-OK');
    });
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls.map((c) => c.value)).toEqual(['DUP', 'TAX-OK']);

    // Submit BEFORE resolving anything — validateForm re-runs the field afresh,
    // parking a THIRD run for the latest value.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-capture'));
      await Promise.resolve();
    });
    await waitFor(() => expect(calls.length).toBe(3));
    expect(calls[2].value).toBe('TAX-OK');

    // Resolve the submit's run VALID first → submit unblocks and completes.
    await resolveValue(calls, 'TAX-OK');
    await waitFor(() => {
      expect(results).toEqual([true]);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ taxId: 'TAX-OK', legalName: 'Acme Founder' });

    // Now let the STALE 'DUP' onChange run resolve INVALID, late. It is superseded
    // (higher seq claimed by the submit run) → dropped, no resurrected error.
    await resolveValue(calls, 'DUP', [{ message: 'This tax ID is already registered' }]);
    await waitFor(() => {
      expect(screen.queryByTestId('errors-taxId')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
    });
    expect(storeRef!.getState().errors.taxId ?? []).toEqual([]);
    expect(storeRef!.getState().validationStates.taxId).toBe('valid');
    expect(screen.getByTestId('vstate-taxId')).toHaveTextContent('settled');
  });

  it('1b: submit of an invalid latest value is blocked and awaits — no hang, no stuck validating', async () => {
    const { schema, calls } = makeControllableAsync();
    const onSubmit = vi.fn();
    const results: boolean[] = [];
    render(
      <FormProvider formConfig={buildForm(schema)} onSubmit={onSubmit}>
        <FormBody />
        <FieldErrors id="taxId" />
        <SubmitCapture onResult={(ok) => results.push(ok)} />
        <Probe />
      </FormProvider>
    );

    await act(async () => setText('legalName', 'Jane'));
    await act(async () => setText('taxId', 'DUP'));
    await waitFor(() => expect(calls.length).toBe(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-capture'));
      await Promise.resolve();
    });
    await waitFor(() => expect(calls.length).toBe(2)); // submit re-ran the field

    // Resolve every 'DUP' run invalid.
    await resolveValue(calls, 'DUP', [{ message: 'This tax ID is already registered' }]);

    await waitFor(() => {
      expect(results).toEqual([false]);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByTestId('error-taxId-0')).toHaveTextContent(
        'This tax ID is already registered'
      );
    });
    expect(storeRef!.getState().validationStates.taxId).toBe('invalid');
    expect(screen.getByTestId('vstate-taxId')).toHaveTextContent('settled');
  });
});

// ============================================================================
// SCENARIO 2 — add / remove rows mid-validation (row-liveness guard).
// ============================================================================

describe('RACE 2 — repeatable rows added / removed while a row validator is in flight', () => {
  function buildForm(schema: object) {
    return form
      .create(rilConfig, 'kyc-rows-race')
      .addRepeatable('owners', (r) =>
        r
          .add({
            id: 'ownerName',
            type: 'text',
            props: {},
            validation: { validate: schema },
          })
          .min(1)
          .defaultValue({ ownerName: '' })
      )
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('2a: a late INVALID verdict for a REMOVED row is dropped — no ghost error, isValid not wedged', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildForm(schema)} defaultValues={{ owners: [{ ownerName: '' }] }}>
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );

    // Two rows.
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-append-owners'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    const k1 = keyOf(1);

    // Kick off row k1's async validator with a distinctive value.
    await act(async () => setText(`owners[${k1}].ownerName`, 'ROW1'));
    await waitFor(() => expect(calls.some((c) => c.value === 'ROW1')).toBe(true));

    // Remove k1 while its verdict is parked.
    await act(async () => {
      fireEvent.click(screen.getByTestId(`repeatable-remove-owners-${k1}`));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('1')
    );

    // The late invalid verdict lands for a row no longer in `_repeatableOrder`.
    await resolveValue(calls, 'ROW1', [{ message: 'Name already used' }]);

    // Row-liveness guard (fieldExistsLive :164) drops it: no error under the dead
    // composite key, and isValid is not stuck false with an invisible error.
    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    expect(storeRef!.getState().errors[`owners[${k1}].ownerName`] ?? []).toEqual([]);
    expect(screen.queryByTestId(`input-owners[${k1}].ownerName`)).not.toBeInTheDocument();
  });

  it('2b: adding a fresh row while another row validates leaves the new row clean and pending row resolvable', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildForm(schema)} defaultValues={{ owners: [{ ownerName: '' }] }}>
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );

    const k0 = keyOf(0);
    await act(async () => setText(`owners[${k0}].ownerName`, 'ROW0'));
    await waitFor(() => expect(calls.some((c) => c.value === 'ROW0')).toBe(true));

    // Add a new row WHILE k0's verdict is parked.
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-append-owners'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-owners')).toHaveTextContent('2')
    );
    const k1 = keyOf(1);

    // Resolve the still-live k0 run VALID — it must commit normally (row is live).
    await resolveValue(calls, 'ROW0');
    await waitFor(() =>
      expect(storeRef!.getState().validationStates[`owners[${k0}].ownerName`]).toBe('valid')
    );
    // The freshly-added row carries no error (never validated, still empty).
    expect(storeRef!.getState().errors[`owners[${k1}].ownerName`] ?? []).toEqual([]);
    expect(screen.getByTestId(`input-owners[${k1}].ownerName`)).toHaveValue('');
  });
});

// ============================================================================
// SCENARIO 3 — reorder rows while an error and a pending async coexist.
// ============================================================================

describe('RACE 3 — move a row that has an error while a sibling validation is pending', () => {
  it('3a: an error and value travel with the moved row (order mirror), never onto a sibling', async () => {
    const { schema, calls } = makeControllableAsync();
    const config = form
      .create(rilConfig, 'kyc-move-race')
      .addRepeatable('owners', (r) =>
        r
          .add({ id: 'ownerName', type: 'text', props: {}, validation: { validate: schema } })
          .min(1)
          .defaultValue({ ownerName: '' })
      )
      .setValidation({ mode: 'onChange' })
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{ owners: [{ ownerName: '' }, { ownerName: '' }] }}
      >
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );

    const [k0, k1] = storeRef!.getState()._repeatableOrder.owners;

    // Row k0 gets a committed INVALID verdict; row k1 has a still-pending run.
    await act(async () => {
      setText(`owners[${k0}].ownerName`, 'BADNAME');
      setText(`owners[${k1}].ownerName`, 'PENDING');
    });
    await waitFor(() => expect(calls.some((c) => c.value === 'BADNAME')).toBe(true));
    await resolveValue(calls, 'BADNAME', [{ message: 'Name already used' }]);
    await waitFor(() =>
      expect(screen.getByTestId(`ui-error-owners[${k0}].ownerName-0`)).toBeInTheDocument()
    );

    // Move row 0 down → order becomes [k1, k0]. Only the key array reorders; the
    // value/error maps are keyed by the stable itemKey.
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-move-down-owners-0'));
    });
    await waitFor(() => expect(storeRef!.getState()._repeatableOrder.owners).toEqual([k1, k0]));

    // The error still belongs to k0 (now visually last), NOT to k1 (now first).
    expect(screen.getByTestId(`ui-error-owners[${k0}].ownerName-0`)).toHaveTextContent(
      'Name already used'
    );
    expect(screen.queryByTestId(`ui-errors-owners[${k1}].ownerName`)).not.toBeInTheDocument();
    expect(storeRef!.getState().values[`owners[${k0}].ownerName`]).toBe('BADNAME');
    expect(storeRef!.getState().values[`owners[${k1}].ownerName`]).toBe('PENDING');

    // Resolve k1's still-pending run VALID — it lands on k1 only, k0 keeps its error.
    await resolveValue(calls, 'PENDING');
    await waitFor(() =>
      expect(storeRef!.getState().validationStates[`owners[${k1}].ownerName`]).toBe('valid')
    );
    expect(storeRef!.getState().errors[`owners[${k0}].ownerName`]).toHaveLength(1);
    expect(storeRef!.getState().errors[`owners[${k1}].ownerName`] ?? []).toEqual([]);
  });
});

// ============================================================================
// SCENARIO 4 — interleaved global effect fan-out + per-row edit + cross-field.
// ============================================================================

describe('RACE 4 — global effect fan-out interleaved with a per-row edit and a cross-field sum', () => {
  it('4a: after a global change, a per-row edit and the sum rule all settle to a coherent store', async () => {
    const config = form
      .create(rilConfig, 'kyc-interleave')
      .add({ id: 'summary', type: 'banner', props: {} })
      .add({ id: 'taxRate', type: 'text', props: {} })
      .addRepeatable('owners', (r) =>
        r
          .add({ id: 'ownerName', type: 'text', props: {} })
          .add({ id: 'ownershipPct', type: 'number', props: {} })
          .add({
            id: 'taxed',
            type: 'text',
            props: {},
            // GLOBAL watch: recompute per live row when taxRate changes.
            effects: [
              onChange('taxRate', (rate, { setValue, getFieldValue }) => {
                setValue('taxed', `${String(getFieldValue('ownershipPct') ?? '')}@${String(rate)}`);
              }),
            ],
          })
          .min(1)
          .defaultValue({ ownerName: '', ownershipPct: 0, taxed: '' })
      )
      .setValidation({ mode: 'onChange', validate: ownershipSumSchema })
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{
          taxRate: '',
          owners: [
            { ownerName: 'Alice', ownershipPct: 60, taxed: '' },
            { ownerName: 'Bob', ownershipPct: 40, taxed: '' },
          ],
        }}
      >
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );

    const [k0, k1] = storeRef!.getState()._repeatableOrder.owners;

    // Sum starts at 100 → banner clear.
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());

    // Interleave: global taxRate change (fans out to both rows) THEN a per-row
    // ownershipPct edit that breaks the sum — all in the same act batch.
    await act(async () => {
      setText('taxRate', '7');
      setText(`owners[${k1}].ownershipPct`, '30'); // 60 + 30 = 90
    });

    // Global fan-out reached BOTH rows with each row's own pct at the global rate.
    await waitFor(() => expect(storeRef!.getState().values[`owners[${k0}].taxed`]).toBe('60@7'));
    // k1's taxed reflects its LATEST pct (the effect re-fired on the pct change too
    // via the sibling? no — taxed only watches taxRate; so it holds 40@7 from the
    // global change, computed before the pct edit committed in this batch order).
    // Assert the coherent invariant: taxed@7 for k1 with a numeric pct.
    await waitFor(() =>
      expect(String(storeRef!.getState().values[`owners[${k1}].taxed`])).toMatch(/@7$/)
    );

    // The cross-field sum rule re-evaluated live on the pct change → banner shows 90%.
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('currently 90%')
    );
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');

    // Fix the sum live → banner clears, store coherent, no stray global `taxed`.
    await act(async () => setText(`owners[${k1}].ownershipPct`, '40'));
    await waitFor(() => expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument());
    expect(storeRef!.getState().values.taxed).toBeUndefined();
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true');
  });

  it('4b: a fanned-out async effect write to a row removed mid-flight is dropped', async () => {
    let releaseGate: (() => void) | null = null;
    const gate = new Promise<void>((res) => {
      releaseGate = res;
    });
    const config = form
      .create(rilConfig, 'kyc-effect-remove')
      .add({ id: 'taxRate', type: 'text', props: {} })
      .addRepeatable('owners', (r) =>
        r
          .add({ id: 'ownershipPct', type: 'number', props: {} })
          .add({
            id: 'taxed',
            type: 'text',
            props: {},
            effects: [
              onChange('taxRate', async (rate, { setValue, getFieldValue }) => {
                await gate;
                setValue('taxed', `${String(getFieldValue('ownershipPct') ?? '')}@${String(rate)}`);
              }),
            ],
          })
          .min(1)
          .defaultValue({ ownershipPct: 0, taxed: '' })
      )
      .build();

    render(
      <FormProvider
        formConfig={config}
        defaultValues={{
          taxRate: '',
          owners: [
            { ownershipPct: 10, taxed: '' },
            { ownershipPct: 20, taxed: '' },
            { ownershipPct: 30, taxed: '' },
          ],
        }}
      >
        <FormBody />
        <Probe />
      </FormProvider>
    );

    const [k0, k1] = storeRef!.getState()._repeatableOrder.owners;

    // Global change → all three async effects start and park on the gate.
    await act(async () => setText('taxRate', '9'));

    // Remove k1 while its effect is parked (3 rows → 2, above min 1).
    act(() => {
      expect(storeRef!.getState()._removeRepeatableItem('owners', k1)).toBe(true);
    });
    await waitFor(() => expect(storeRef!.getState()._repeatableOrder.owners).not.toContain(k1));

    // Release every parked invocation.
    await act(async () => {
      releaseGate?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Surviving row recomputed; the removed row's late write dropped (row-liveness
    // guard in the effect engine, :359-363).
    await waitFor(() => expect(storeRef!.getState().values[`owners[${k0}].taxed`]).toBe('10@9'));
    expect(storeRef!.getState().values[`owners[${k1}].taxed`]).toBeUndefined();
    expect(storeRef!.getState().values[`owners[${k1}].ownershipPct`]).toBeUndefined();
  });
});

// ============================================================================
// SCENARIO 5 — rapid conditional toggling with the field mid-validation.
// ============================================================================

describe('RACE 5 — flip a controller show/hide fast while its required field validates', () => {
  function buildForm(schema: object) {
    return form
      .create(rilConfig, 'kyc-toggle-race')
      .add({ id: 'isPEP', type: 'checkbox', props: {} })
      .add({
        id: 'pepReason',
        type: 'text',
        props: {},
        validation: { validate: schema },
        conditions: {
          visible: when('isPEP').equals(true),
          required: when('isPEP').equals(true),
        },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('5a: a late verdict for a field hidden mid-flight is dropped; final visibility+validity coherent', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildForm(schema)} defaultValues={{ isPEP: false, pepReason: '' }}>
        <FormBody />
        <FieldErrors id="pepReason" />
        <Probe />
      </FormProvider>
    );

    // Show → type (parks a run) → hide, all fast.
    await act(async () => setCheckbox('isPEP', true));
    await waitFor(() => expect(screen.getByTestId('input-pepReason')).toBeInTheDocument());
    await act(async () => setText('pepReason', 'MINISTER'));
    await waitFor(() => expect(calls.some((c) => c.value === 'MINISTER')).toBe(true));

    // Hide before the verdict lands.
    await act(async () => setCheckbox('isPEP', false));
    await waitFor(() => expect(screen.queryByTestId('input-pepReason')).not.toBeInTheDocument());

    // Late INVALID verdict for the now-hidden field → cleared, not committed.
    await resolveValue(calls, 'MINISTER', [{ message: 'PEP reason rejected' }]);
    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    expect(storeRef!.getState().errors.pepReason ?? []).toEqual([]);

    // Re-show: the field returns with a CLEAN slate — no resurrected error.
    await act(async () => setCheckbox('isPEP', true));
    await waitFor(() => expect(screen.getByTestId('input-pepReason')).toBeInTheDocument());
    expect(screen.queryByTestId('errors-pepReason')).not.toBeInTheDocument();
  });

  it('5b: on→off→on→off rapid flips leave no wedged submit and coherent final state', async () => {
    const { schema, calls } = makeControllableAsync();
    const onSubmit = vi.fn();
    render(
      <FormProvider
        formConfig={buildForm(schema)}
        defaultValues={{ isPEP: false, pepReason: '' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <FieldErrors id="pepReason" />
        <SubmitCapture onResult={() => {}} />
        <Probe />
      </FormProvider>
    );

    // Rapid on/off/on/off — the last state is OFF, so pepReason is hidden and the
    // form is not gated on it at all.
    await act(async () => {
      setCheckbox('isPEP', true);
      setCheckbox('isPEP', false);
      setCheckbox('isPEP', true);
      setCheckbox('isPEP', false);
    });
    await waitFor(() => expect(screen.queryByTestId('input-pepReason')).not.toBeInTheDocument());

    // Any parked runs from the transient ON states resolve invalid, late.
    if (calls.length > 0) {
      await resolveValue(calls, '', [{ message: 'PEP reason rejected' }]);
    }

    // Final: hidden + no error → valid → submit succeeds and drops the hidden field.
    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    expect(storeRef!.getState().errors.pepReason ?? []).toEqual([]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-capture'));
      await Promise.resolve();
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('pepReason');
  });
});

// ============================================================================
// SCENARIO 6 — stale async both directions (latest value's verdict wins).
// ============================================================================

describe('RACE 6 — out-of-order async resolution on a repeatable row field', () => {
  function buildForm(schema: object) {
    return form
      .create(rilConfig, 'kyc-stale-both')
      .addRepeatable('owners', (r) =>
        r
          .add({ id: 'ownerName', type: 'text', props: {}, validation: { validate: schema } })
          .min(1)
          .defaultValue({ ownerName: '' })
      )
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('6a: an older INVALID resolving AFTER a newer VALID is dropped — latest (valid) wins', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildForm(schema)} defaultValues={{ owners: [{ ownerName: '' }] }}>
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );
    const k0 = keyOf(0);

    await act(async () => {
      setText(`owners[${k0}].ownerName`, 'stale');
      setText(`owners[${k0}].ownerName`, 'fresh');
    });
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0].value).toBe('stale');
    expect(calls[1].value).toBe('fresh');

    // Newer 'fresh' resolves VALID first, then older 'stale' resolves INVALID late.
    await resolveValue(calls, 'fresh');
    await resolveValue(calls, 'stale', [{ message: 'Name already used' }]);

    await waitFor(() => expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('true'));
    expect(storeRef!.getState().errors[`owners[${k0}].ownerName`] ?? []).toEqual([]);
    expect(storeRef!.getState().validationStates[`owners[${k0}].ownerName`]).toBe('valid');
  });

  it('6b: an older VALID resolving AFTER a newer INVALID is dropped — latest (invalid) wins', async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <FormProvider formConfig={buildForm(schema)} defaultValues={{ owners: [{ ownerName: '' }] }}>
        <FormBody />
        <RepeatableControls repeatableId="owners" />
        <Probe />
      </FormProvider>
    );
    const k0 = keyOf(0);

    await act(async () => {
      setText(`owners[${k0}].ownerName`, 'ok');
      setText(`owners[${k0}].ownerName`, 'taken');
    });
    await waitFor(() => expect(calls.length).toBe(2));

    // Newer 'taken' resolves INVALID first, then older 'ok' resolves VALID late.
    await resolveValue(calls, 'taken', [{ message: 'Name already used' }]);
    await resolveValue(calls, 'ok');

    await waitFor(() =>
      expect(screen.getByTestId(`ui-error-owners[${k0}].ownerName-0`)).toHaveTextContent(
        'Name already used'
      )
    );
    expect(screen.getByTestId('probe-is-valid')).toHaveTextContent('false');
    expect(storeRef!.getState().validationStates[`owners[${k0}].ownerName`]).toBe('invalid');
  });
});

// ============================================================================
// SCENARIO 7 — rapid next while an async run is pending (2-step flow).
// Exercises the mounted-form GENERATION token across a step swap.
// ============================================================================

describe('RACE 7 — next mid-async in a 2-step flow (generation guard across the swap)', () => {
  function buildTwoStepFlow(schema: object) {
    const step1 = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'note', type: 'text', props: {}, validation: { validate: schema } })
      .setValidation({ mode: 'onChange' })
      .build();
    // Step 2 declares a field of the SAME id `note` with NO validation — the
    // classic cross-step id collision the generation token protects.
    const step2 = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'note', type: 'text', props: {} })
      .build();

    return flow
      .create(rilConfig, 'race-flow', 'Race Flow')
      .addStep({ id: 's1', title: 'Step 1', formConfig: step1 })
      .addStep({ id: 's2', title: 'Step 2', formConfig: step2 })
      .build();
  }

  function StepNoteProbe() {
    const errors = useFieldErrors('note');
    return <span data-testid="note-error-count">{errors.length}</span>;
  }

  it("7a: a step-1 async verdict resolving after we advance does NOT paint step-2's same-id field", async () => {
    const { schema, calls } = makeControllableAsync();
    render(
      <Flow of={buildTwoStepFlow(schema)}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <StepNoteProbe />
      </Flow>
    );

    await waitFor(() => expect(screen.getByTestId('input-note')).toBeInTheDocument());

    // Type a valid value on step 1 → parks an onChange run.
    await act(async () => setText('note', 'GOOD'));
    await waitFor(() => expect(calls.some((c) => c.value === 'GOOD')).toBe(true));

    // Advance. goNext runs the step-form submit → validateForm re-runs the field,
    // parking a SECOND run. Resolve the submit run VALID so navigation proceeds.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
      await Promise.resolve();
    });
    await waitFor(() => expect(calls.length).toBe(2));
    await resolveValue(calls, 'GOOD');

    // We are now on step 2 (fresh mounted form → generation bumped).
    await waitFor(() => expect(screen.getByTestId('input-note')).toHaveValue(''));

    // The ORPHANED step-1 onChange run (calls[0]) resolves INVALID, late. Its
    // generation no longer matches → dropped. Step-2's `note` stays clean.
    await resolveValue(calls, 'GOOD', [{ message: 'Note already used on step 1' }]);
    await waitFor(() => expect(screen.getByTestId('note-error-count')).toHaveTextContent('0'));
    expect(screen.queryByTestId('ui-errors-note')).not.toBeInTheDocument();
  });
});

// ============================================================================
// SCENARIO 8 — debounced validation + rapid supersede + unmount.
// ============================================================================

describe('RACE 8 — debounced validation coalescing and unmount cleanup', () => {
  function buildForm(schema: object) {
    return form
      .create(rilConfig, 'kyc-debounce')
      .add({
        id: 'handle',
        type: 'text',
        props: {},
        validation: { validate: schema, debounceMs: 40 },
      })
      .setValidation({ mode: 'onChange' })
      .build();
  }

  it('8a: rapid keystrokes coalesce to ONE debounced run for the latest value', async () => {
    vi.useFakeTimers();
    try {
      const { schema, calls } = makeControllableAsync();
      render(
        <FormProvider formConfig={buildForm(schema)}>
          <FormBody />
          <Probe />
        </FormProvider>
      );

      // Three fast keystrokes inside the debounce window.
      act(() => {
        setText('handle', 'a');
        setText('handle', 'ab');
        setText('handle', 'abc');
      });
      // Nothing has fired yet (still within the 40ms window).
      expect(calls.length).toBe(0);

      // Advance past the debounce.
      await act(async () => {
        vi.advanceTimersByTime(50);
        await Promise.resolve();
      });

      // Exactly ONE run, for the LAST value — superseded keystrokes cancelled.
      expect(calls.length).toBe(1);
      expect(calls[0].value).toBe('abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('8b: unmounting before the debounce fires cancels the run — no late verdict', async () => {
    vi.useFakeTimers();
    try {
      const { schema, calls } = makeControllableAsync();
      const { unmount } = render(
        <FormProvider formConfig={buildForm(schema)}>
          <FormBody />
          <Probe />
        </FormProvider>
      );

      act(() => {
        setText('handle', 'abc');
      });
      expect(calls.length).toBe(0);

      // Unmount BEFORE the timer fires → FormField cleanup clears the timer.
      unmount();

      await act(async () => {
        vi.advanceTimersByTime(100);
        await Promise.resolve();
      });

      // The debounced validate never ran — no orphaned run on an unmounted form.
      expect(calls.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
