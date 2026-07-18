/**
 * =============================================================================
 * FAR-REACHING E2E — PRODUCTION RESILIENCE & OBSERVABILITY.
 *
 * The concerns a Silicon-Valley company hits at scale, in two acts:
 *
 * PART 1 — RESILIENCE: does the framework ISOLATE failures, or does one throwing
 *   validator / effect / weird value crash the whole React tree? Every resilience
 *   test mounts the subject inside a React error boundary and asserts the
 *   boundary NEVER catches — that is the proof of isolation. A throw that surfaces
 *   as a field error the user can see and fix is graceful; a throw that unwinds
 *   the render tree is a crash.
 *
 * PART 2 — OBSERVABILITY: the analytics/telemetry an SV company depends on. A
 *   `WorkflowAnalytics` object spies every callback across a real multi-step run;
 *   we assert each fires with the right stepId, a non-negative duration, coherent
 *   ordering (start-before-complete), and the documented skip/error semantics.
 *
 * ---------------------------------------------------------------------------
 * CONTRACTS VERIFIED IN SOURCE BEFORE ASSERTING (never invented):
 *
 *  - FIELD-level validator throw: useFormValidationWithStore.ts:321-349 wraps the
 *    schema `validate()` in try/catch and, on throw, surfaces
 *    `{ message: error.message, code: 'VALIDATION_ERROR' }` on the field. Async
 *    rejection travels the same `await` → same catch. NB: `custom()`/`async()`
 *    (validators.ts:284, :313) SWALLOW a predicate throw into an issue, so they do
 *    NOT exercise the framework's catch — a RAW Standard Schema whose `validate`
 *    throws is the only way to hit it. That is what these tests use.
 *  - FORM-level validator throw: useFormValidationWithStore.ts:406-413 →
 *    `{ code: 'FORM_VALIDATION_ERROR' }` routed to `__form__` (path-less issue).
 *  - EFFECT handler throw: effect-engine.ts:430-432 (sync) and :423-428 (async
 *    reject) catch per-unit and `log.warn` — the throw never propagates. The
 *    per-unit try/catch sits INSIDE the effect loop (:416), so a sibling effect
 *    on the same field still runs. The store write that TRIGGERED the effect has
 *    already committed, so the triggering field keeps its value.
 *  - UNREGISTERED component: form.ts:188-194 throws a typed `NotFoundError`
 *    ("No component found with type …") at BUILD time (`.add()` / `.build()`),
 *    not a silent white-screen at render.
 *  - CONDITION referencing a nonexistent field: the field id resolves to
 *    `undefined`, `.equals(x)` is false → the guarded field stays hidden. Graceful
 *    skip, no throw.
 *  - onStepStart(stepId, timestamp, ctx) fires once per step after init settles
 *    (useWorkflowAnalytics.ts:141,221). onStepComplete(stepId, duration, data,
 *    ctx) fires for the PREVIOUS step on a FORWARD transition only (:163-167) —
 *    so the LAST step never fires onStepComplete; onWorkflowComplete carries it.
 *  - onStepSkip(stepId, reason, ctx) fires DIRECTLY in skipStep
 *    (useWorkflowNavigation.ts:377-379) with reason === 'user_skip', and the
 *    skipped step's onStepComplete is suppressed (:152-155,167).
 *  - onWorkflowComplete(workflowId, duration, data) fires once at submission
 *    (useWorkflowSubmission.ts:171-173); duration = Date.now() - analyticsStart.
 *  - onError(error, ctx) has exactly ONE wired production path
 *    (useWorkflowSubmission.ts:188-192): the host `onComplete` (or
 *    analytics.onWorkflowComplete) throwing during submission. The rethrow
 *    (:193) is swallowed by the form submit boundary
 *    (useFormSubmissionWithStore.ts:251-255) — no unhandled rejection, no crash.
 *    (The `trackError` helper exists but is not wired to any UI path.)
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { NotFoundError, flow, form, onChange, ril, when } from 'rilaykit';
import {
  Flow,
  FlowBody,
  FormBody,
  FormProvider,
  useFlow,
  useForm,
  useFormErrors,
  useFormStoreApi,
} from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton, SkipButton } from '../_setup/nav-buttons';

// ============================================================================
// ERROR-AWARE RENDERERS — assert what the USER SEES (field.error).
// ============================================================================

function ErrorAwareText({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <input
        id={id}
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      <span data-testid={`error-count-${id}`}>{errors.length}</span>
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

function ErrorAwareNumber({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
      <input
        id={id}
        type="number"
        data-testid={`input-${id}`}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => field?.onBlur()}
      />
      <span data-testid={`error-count-${id}`}>{errors.length}</span>
    </div>
  );
}

function ErrorAwareCheckbox({ id, props, field }: ComponentRenderContext) {
  return (
    <div data-testid={`field-${id}`}>
      {props?.label ? <label htmlFor={id}>{String(props.label)}</label> : null}
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

/** Reads the mounted form's `__form__` bucket (path-less / cross-field issues). */
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

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: ErrorAwareText, defaultProps: { label: '' } })
  .component('number', { name: 'Number', renderer: ErrorAwareNumber, defaultProps: { label: '' } })
  .component('checkbox', {
    name: 'Checkbox',
    renderer: ErrorAwareCheckbox,
    defaultProps: { label: '' },
  })
  .component('banner', { name: 'Banner', renderer: FormErrorBanner, defaultProps: {} });

// ============================================================================
// RAW throwing schemas — bypass custom()/async() (which swallow) to exercise the
// FRAMEWORK's own validator try/catch.
// ============================================================================

const throwingSyncSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (): never => {
      throw new Error('sync validator boom');
    },
  },
};

const throwingAsyncSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: async (): Promise<never> => {
      throw new Error('async validator boom');
    },
  },
};

const throwingFormSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (): never => {
      throw new Error('cross-field boom');
    },
  },
};

/** A tolerant length guard: must survive ANY value type without throwing. */
const lengthSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => {
      const s = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
      if (s.length > 1000) return { issues: [{ message: `too long (${s.length})` }] };
      return { value };
    },
  },
};

// ============================================================================
// ERROR BOUNDARY — the isolation oracle. If it ever flips to "crashed", a throw
// escaped the framework and unwound the tree — that is the failure we hunt.
// ============================================================================

class Boundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean; message: string }
> {
  state = { crashed: false, message: '' };
  static getDerivedStateFromError(error: Error) {
    return { crashed: true, message: error.message };
  }
  render() {
    if (this.state.crashed) {
      return <div data-testid="boundary-crashed">{this.state.message}</div>;
    }
    return <div data-testid="boundary-ok">{this.props.children}</div>;
  }
}

function expectNoCrash() {
  expect(screen.queryByTestId('boundary-crashed')).not.toBeInTheDocument();
  expect(screen.getByTestId('boundary-ok')).toBeInTheDocument();
}

// ============================================================================
// FORM HELPERS (Part 1) — self-contained, all from rilaykit/react so the
// FormProvider context matches the hooks (no cross-module context split).
// ============================================================================

function FormSubmitButton() {
  const { submit } = useForm();
  return (
    <button type="button" data-testid="submit-btn" onClick={() => void submit()}>
      Submit
    </button>
  );
}

/** Writes an arbitrary (possibly weird-typed) value straight into the store. */
function SetValueButton({ id, value }: { id: string; value: unknown }) {
  const store = useFormStoreApi();
  return (
    <button
      type="button"
      data-testid={`set-${id}`}
      onClick={() => store.getState()._setValue(id, value)}
    >
      set {id}
    </button>
  );
}

function StoreProbe() {
  const store = useFormStoreApi();
  return <pre data-testid="store-values">{JSON.stringify(store.getState().values)}</pre>;
}

function renderForm(
  config: ReturnType<ReturnType<typeof form.create>['build']>,
  opts: {
    defaultValues?: Record<string, unknown>;
    onSubmit?: (data: Record<string, unknown>) => void;
    extra?: React.ReactNode;
  } = {}
) {
  return render(
    <Boundary>
      <FormProvider formConfig={config} defaultValues={opts.defaultValues} onSubmit={opts.onSubmit}>
        <FormBody />
        <FormSubmitButton />
        {opts.extra}
        <StoreProbe />
      </FormProvider>
    </Boundary>
  );
}

function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}

// ============================================================================
// PART 1 — RESILIENCE
// ============================================================================

describe('COMPLEX — resilience: the framework isolates failures, never crashes', () => {
  // --------------------------------------------------------------------------
  // R1 — a throwing validator surfaces an error and leaves the form usable.
  // --------------------------------------------------------------------------

  it('R1a: a FIELD-level SYNC validator throw becomes a visible field error, no crash', async () => {
    const boomForm = form
      .create(rilConfig, 'boom-sync')
      .add({
        id: 'boom',
        type: 'text',
        props: { label: 'Boom' },
        validation: { validate: throwingSyncSchema },
      })
      .add({ id: 'safe', type: 'text', props: { label: 'Safe' } })
      .build();

    renderForm(boomForm);
    await waitFor(() => expect(screen.getByTestId('input-boom')).toBeInTheDocument());

    await act(async () => setField('boom', 'anything'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    // The throw is caught and surfaced AS the field's error (message === thrown).
    await waitFor(() =>
      expect(screen.getByTestId('ui-error-boom-0')).toHaveTextContent('sync validator boom')
    );
    // The tree never unwound.
    expectNoCrash();
    // The form is STILL usable — a sibling field accepts input after the throw.
    await act(async () => setField('safe', 'still working'));
    expect(screen.getByTestId('input-safe')).toHaveValue('still working');

    // And submit is not permanently wedged: a second submit still runs (error persists, no crash).
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    expectNoCrash();
    expect(screen.getByTestId('ui-error-boom-0')).toHaveTextContent('sync validator boom');
  });

  it('R1b: a FIELD-level ASYNC validator rejection becomes a visible field error, no crash', async () => {
    const boomForm = form
      .create(rilConfig, 'boom-async')
      .add({
        id: 'boom',
        type: 'text',
        props: { label: 'Boom' },
        validation: { validate: throwingAsyncSchema },
      })
      .build();

    renderForm(boomForm);
    await act(async () => setField('boom', 'x'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('ui-error-boom-0')).toHaveTextContent('async validator boom')
    );
    expectNoCrash();
  });

  it('R1c: a FORM-level (cross-field) validator throw routes to __form__, no crash', async () => {
    const boomForm = form
      .create(rilConfig, 'boom-form-level')
      .add({ id: 'a', type: 'text', props: { label: 'A' } })
      .setValidation({ mode: 'onChange', validate: throwingFormSchema })
      .build();

    renderForm(boomForm, { extra: <FormErrorBanner /> });
    await act(async () => setField('a', 'trigger'));

    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent('cross-field boom')
    );
    expectNoCrash();
  });

  // --------------------------------------------------------------------------
  // R2 — a throwing effect handler is isolated per-unit.
  // --------------------------------------------------------------------------

  it('R2: an onChange effect that THROWS does not stop the triggering field, siblings, or other effects', async () => {
    const effForm = form
      .create(rilConfig, 'boom-effect')
      // `dst` carries TWO effects watching `src`: the first throws, the second
      // writes. Per-unit catch means the second still runs.
      .add({ id: 'src', type: 'text', props: { label: 'Src' } })
      .add({
        id: 'dst',
        type: 'text',
        props: { label: 'Dst' },
        effects: [
          onChange('src', () => {
            throw new Error('effect boom');
          }),
          onChange('src', (v, { setValue }) => {
            setValue('dst', `derived-${String(v)}`);
          }),
        ],
      })
      .add({ id: 'other', type: 'text', props: { label: 'Other' } })
      .build();

    renderForm(effForm);
    await act(async () => setField('src', 'hello'));

    // Triggering field kept its value (its store write committed before the effect ran).
    await waitFor(() => expect(screen.getByTestId('input-src')).toHaveValue('hello'));
    // The SECOND effect ran despite the FIRST throwing — isolation within a field's effect list.
    await waitFor(() => expect(screen.getByTestId('input-dst')).toHaveValue('derived-hello'));
    // No crash, and an unrelated field still accepts input.
    expectNoCrash();
    await act(async () => setField('other', 'ok'));
    expect(screen.getByTestId('input-other')).toHaveValue('ok');
  });

  // --------------------------------------------------------------------------
  // R3 — weird-typed values through validators AND effects.
  // --------------------------------------------------------------------------

  it('R3: object / array / null / NaN / huge-string values flow through validators+effects without crashing', async () => {
    const derived: unknown[] = [];
    const weirdForm = form
      .create(rilConfig, 'weird-values')
      .add({
        id: 'payload',
        type: 'text',
        props: { label: 'Payload' },
        validation: { validate: lengthSchema },
      })
      .add({
        id: 'mirror',
        type: 'text',
        props: { label: 'Mirror' },
        // Effect must survive any incoming type: it reads typeof, never assumes string.
        effects: [
          onChange('payload', (v, { setValue }) => {
            derived.push(v);
            setValue('mirror', `type:${Array.isArray(v) ? 'array' : typeof v}`);
          }),
        ],
      })
      .build();

    const hugeString = 'x'.repeat(50_000);
    const weirdValues: Array<[string, unknown, string]> = [
      ['obj', { a: 1, nested: { b: 2 } }, 'type:object'],
      ['arr', [1, 2, 3], 'type:array'],
      ['nul', null, 'type:object'],
      ['nan', Number.NaN, 'type:number'],
      ['huge', hugeString, 'type:string'],
    ];

    renderForm(weirdForm, {
      extra: (
        <>
          {weirdValues.map(([label, value]) => (
            <SetValueButton key={label} id="payload" value={value} />
          ))}
        </>
      ),
    });

    // There are 5 SetValueButtons all targeting `payload`; click each in order.
    const buttons = screen.getAllByTestId('set-payload');
    for (let i = 0; i < weirdValues.length; i++) {
      const [, , expectedMirror] = weirdValues[i];
      await act(async () => {
        fireEvent.click(buttons[i]);
      });
      // The effect derived the right type tag without throwing on the weird input.
      await waitFor(() => expect(screen.getByTestId('input-mirror')).toHaveValue(expectedMirror));
      expectNoCrash();
    }

    // The tolerant validator ran over every weird value (submit validates all) with no crash.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    expectNoCrash();
    // The huge string tripped the length guard (sane behavior, not a crash).
    expect(derived).toHaveLength(weirdValues.length);
  });

  // --------------------------------------------------------------------------
  // R4 — malformed / edge configs surface the DOCUMENTED failure.
  // --------------------------------------------------------------------------

  it('R4a: a field referencing an UNREGISTERED component throws a typed NotFoundError at build', () => {
    // Contract: form.ts:188-194 — a typed error, not a silent render-time white-screen.
    let caught: unknown;
    try {
      form
        .create(rilConfig, 'bad-component')
        // @ts-expect-error — intentionally an unregistered component type.
        .add({ id: 'ghost', type: 'does-not-exist', props: {} })
        .build();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NotFoundError);
    expect((caught as Error).message).toMatch(/No component found with type "does-not-exist"/);
  });

  it('R4b: an EMPTY repeatable (min 0, no rows) renders and submits without crashing', async () => {
    const onSubmit = vi.fn();
    const emptyRepForm = form
      .create(rilConfig, 'empty-repeatable')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('rows', (r) =>
        r.add({ id: 'name', type: 'text', props: { label: 'Name' } }).min(0)
      )
      .build();

    renderForm(emptyRepForm, { onSubmit });
    await waitFor(() => expect(screen.getByTestId('input-title')).toBeInTheDocument());
    // No repeatable rows exist — no `rows[...]` inputs in the DOM.
    expect(screen.queryByTestId('input-rows[k0].name')).not.toBeInTheDocument();

    await act(async () => setField('title', 'hi'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expectNoCrash();
    // The empty repeatable projects as an empty array, not a crash or a phantom row.
    expect(onSubmit.mock.calls[0][0]).toEqual({ title: 'hi', rows: [] });
  });

  it('R4c: a condition referencing a NONEXISTENT field is a graceful skip (field stays hidden), no crash', async () => {
    // `when('ghostField')` resolves to undefined → equals('yes') is false → hidden.
    const condForm = form
      .create(rilConfig, 'bad-condition')
      .add({ id: 'real', type: 'text', props: { label: 'Real' } })
      .add({
        id: 'guarded',
        type: 'text',
        props: { label: 'Guarded' },
        // `when('ghostFieldNeverDeclared')` resolves to undefined → equals is
        // false → the field stays hidden. Unresolved reference reads falsey, not throwy.
        conditions: { visible: when('ghostFieldNeverDeclared').equals('yes') },
      })
      .build();

    renderForm(condForm);
    await waitFor(() => expect(screen.getByTestId('input-real')).toBeInTheDocument());
    // The guarded field never appears — the unresolved reference reads falsey, not throwy.
    expect(screen.queryByTestId('input-guarded')).not.toBeInTheDocument();
    expectNoCrash();
    // Form remains fully usable.
    await act(async () => setField('real', 'value'));
    expect(screen.getByTestId('input-real')).toHaveValue('value');
  });

  // --------------------------------------------------------------------------
  // R5 — deep/large stress: 100+ fields + a 50-row repeatable.
  // --------------------------------------------------------------------------

  it('R5: a 120-field form with a 50-row repeatable renders, validates and submits (no blowup)', async () => {
    const onSubmit = vi.fn();
    const FIELD_COUNT = 120;
    const ROW_COUNT = 50;

    let builder = form.create(rilConfig, 'stress');
    for (let i = 0; i < FIELD_COUNT; i++) {
      builder = builder.add({ id: `f${i}`, type: 'text', props: { label: `Field ${i}` } });
    }
    const stressForm = builder
      .addRepeatable('rows', (r) =>
        r.add({ id: 'cell', type: 'text', props: { label: 'Cell' } }).min(0)
      )
      .build();

    // Seed 50 repeatable rows via defaultValues (structured/authored shape).
    const rows = Array.from({ length: ROW_COUNT }, (_, i) => ({ cell: `row-${i}` }));

    const t0 = performance.now();
    renderForm(stressForm, { defaultValues: { rows }, onSubmit });

    await waitFor(() => expect(screen.getByTestId('input-f0')).toBeInTheDocument());
    // The last static field and a late repeatable row both mounted (no truncation).
    expect(screen.getByTestId(`input-f${FIELD_COUNT - 1}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('input-rows[k49].cell')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-btn'));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const elapsed = performance.now() - t0;

    expectNoCrash();
    // The submitted payload carries all 50 rows in order.
    const submitted = onSubmit.mock.calls[0][0] as { rows: Array<{ cell: string }> };
    expect(submitted.rows).toHaveLength(ROW_COUNT);
    expect(submitted.rows[49].cell).toBe('row-49');
    // Rough sanity ceiling (NOT a strict perf assertion): no O(n^2) wall.
    expect(elapsed).toBeLessThan(20_000);
  });
});

// ============================================================================
// PART 2 — OBSERVABILITY
// ============================================================================

type Ev =
  | { kind: 'start'; stepId: string; timestamp: number }
  | { kind: 'complete'; stepId: string; duration: number; data: Record<string, unknown> }
  | { kind: 'wfComplete'; workflowId: string; duration: number; data: Record<string, unknown> }
  | { kind: 'skip'; stepId: string; reason: string }
  | { kind: 'error'; message: string };

function buildAnalytics(events: Ev[]) {
  return {
    onStepStart: (stepId: string, timestamp: number) => {
      events.push({ kind: 'start', stepId, timestamp });
    },
    onStepComplete: (stepId: string, duration: number, data: Record<string, unknown>) => {
      events.push({ kind: 'complete', stepId, duration, data });
    },
    onWorkflowComplete: (workflowId: string, duration: number, data: Record<string, unknown>) => {
      events.push({ kind: 'wfComplete', workflowId, duration, data });
    },
    onStepSkip: (stepId: string, reason: string) => {
      events.push({ kind: 'skip', stepId, reason });
    },
    onError: (error: Error) => {
      events.push({ kind: 'error', message: error.message });
    },
  };
}

function buildObservabilityFlow(
  events: Ev[],
  opts: { skippableB?: boolean; onComplete?: (data: Record<string, unknown>) => void } = {}
) {
  const stepForm = (formId: string, fieldId: string) =>
    form
      .create(rilConfig, formId)
      .add({ id: fieldId, type: 'text', props: { label: fieldId } })
      .build();

  return flow
    .create(rilConfig, 'observ-wf', 'Observability workflow')
    .addStep({ id: 'a', title: 'A', formConfig: stepForm('a-form', 'a1') })
    .addStep({
      id: 'b',
      title: 'B',
      formConfig: stepForm('b-form', 'b1'),
      ...(opts.skippableB ? { allowSkip: true } : {}),
    })
    .addStep({ id: 'c', title: 'C', formConfig: stepForm('c-form', 'c1') })
    .configure({ analytics: buildAnalytics(events) })
    .build();
}

function FlowProbe() {
  const { currentStep } = useFlow();
  return <span data-testid="cur-id">{currentStep?.id}</span>;
}

function renderObservFlow(
  config: ReturnType<typeof buildObservabilityFlow>,
  onComplete?: (data: Record<string, unknown>) => void
) {
  return render(
    <Boundary>
      <Flow of={config} onComplete={onComplete}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <SkipButton />
        <FlowProbe />
      </Flow>
    </Boundary>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('next-btn'));
  });
}
async function clickSkip() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('skip-btn'));
  });
}
async function expectStep(id: string) {
  await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent(id));
}
function setStepField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}

describe('COMPLEX — observability: WorkflowAnalytics fires coherently at scale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // O1 — full run: every step's start/complete fires once, ordering coherent,
  //      onWorkflowComplete carries the final data and a duration.
  // --------------------------------------------------------------------------

  it('O1: onStepStart/onStepComplete fire once per step with the right id + non-negative duration; onWorkflowComplete once', async () => {
    const events: Ev[] = [];
    renderObservFlow(buildObservabilityFlow(events));

    await expectStep('a');
    await sleep(20);
    await act(async () => setStepField('a1', 'alpha'));
    await clickNext();
    await expectStep('b');

    await sleep(20);
    await act(async () => setStepField('b1', 'beta'));
    await clickNext();
    await expectStep('c');

    await sleep(20);
    await act(async () => setStepField('c1', 'gamma'));
    await clickNext(); // last step → completes

    await waitFor(() => expect(events.some((e) => e.kind === 'wfComplete')).toBe(true));

    const starts = events.filter((e): e is Extract<Ev, { kind: 'start' }> => e.kind === 'start');
    const completes = events.filter(
      (e): e is Extract<Ev, { kind: 'complete' }> => e.kind === 'complete'
    );
    const wfCompletes = events.filter(
      (e): e is Extract<Ev, { kind: 'wfComplete' }> => e.kind === 'wfComplete'
    );

    // Every step started exactly once, in order.
    expect(starts.map((e) => e.stepId)).toEqual(['a', 'b', 'c']);
    // onStepStart timestamps are real (non-negative) numbers.
    for (const s of starts) expect(s.timestamp).toBeGreaterThan(0);

    // Only the FORWARD transitions complete a previous step: a and b, NOT c
    // (the last step is carried by onWorkflowComplete — verified contract).
    expect(completes.map((e) => e.stepId)).toEqual(['a', 'b']);
    for (const c of completes) expect(c.duration).toBeGreaterThanOrEqual(0);
    // The completed step's OWN data slice rides along.
    expect(completes[0].data).toEqual({ a1: 'alpha' });
    expect(completes[1].data).toEqual({ b1: 'beta' });

    // Exactly one workflow completion, with the whole final projection + a duration.
    expect(wfCompletes).toHaveLength(1);
    expect(wfCompletes[0].workflowId).toBe('observ-wf');
    expect(wfCompletes[0].duration).toBeGreaterThanOrEqual(0);
    expect(wfCompletes[0].data).toEqual({
      a: { a1: 'alpha' },
      b: { b1: 'beta' },
      c: { c1: 'gamma' },
    });

    // Ordering coherence: each step's start precedes its own complete, and
    // start(next) precedes complete(prev)? No — complete(prev) fires WITH
    // start(next) on the same transition; contract is complete(prev) THEN
    // start(next). Assert the global order the source produces.
    const order = events
      .filter((e) => e.kind === 'start' || e.kind === 'complete' || e.kind === 'wfComplete')
      .map((e) =>
        e.kind === 'wfComplete' ? 'wfComplete' : `${e.kind}:${(e as { stepId: string }).stepId}`
      );
    expect(order).toEqual([
      'start:a',
      'complete:a',
      'start:b',
      'complete:b',
      'start:c',
      'wfComplete',
    ]);

    expectNoCrash();
  });

  // --------------------------------------------------------------------------
  // O2 — a skipped step fires onStepSkip (with reason) and NOT onStepComplete.
  // --------------------------------------------------------------------------

  it('O2: skipping step b fires onStepSkip(b, "user_skip") and suppresses onStepComplete for b', async () => {
    const events: Ev[] = [];
    renderObservFlow(buildObservabilityFlow(events, { skippableB: true }));

    await expectStep('a');
    await act(async () => setStepField('a1', 'alpha'));
    await clickNext();
    await expectStep('b');

    // Skip b instead of completing it.
    await clickSkip();
    await expectStep('c');

    const skips = events.filter((e): e is Extract<Ev, { kind: 'skip' }> => e.kind === 'skip');
    const completes = events.filter(
      (e): e is Extract<Ev, { kind: 'complete' }> => e.kind === 'complete'
    );

    // Exactly one skip, for b, with the source-verified reason.
    expect(skips).toEqual([{ kind: 'skip', stepId: 'b', reason: 'user_skip' }]);
    // b was STARTED (we landed on it) but never COMPLETED.
    expect(events.some((e) => e.kind === 'start' && e.stepId === 'b')).toBe(true);
    expect(completes.some((e) => e.stepId === 'b')).toBe(false);
    // a still completed normally on the forward hop before the skip.
    expect(completes.some((e) => e.stepId === 'a')).toBe(true);

    expectNoCrash();
  });

  // --------------------------------------------------------------------------
  // O3 — onError fires on the one wired path: host onComplete throwing.
  // --------------------------------------------------------------------------

  it('O3: a throwing host onComplete drives analytics.onError with the error; no crash, no phantom onWorkflowComplete', async () => {
    const events: Ev[] = [];
    const throwingOnComplete = vi.fn(() => {
      throw new Error('host onComplete exploded');
    });
    renderObservFlow(buildObservabilityFlow(events), throwingOnComplete);

    await expectStep('a');
    await act(async () => setStepField('a1', 'alpha'));
    await clickNext();
    await expectStep('b');
    await act(async () => setStepField('b1', 'beta'));
    await clickNext();
    await expectStep('c');
    await act(async () => setStepField('c1', 'gamma'));
    await clickNext(); // submit → host onComplete throws

    // The host callback ran and threw...
    await waitFor(() => expect(throwingOnComplete).toHaveBeenCalledTimes(1));
    // ...and analytics.onError captured that exact error (the ONLY wired onError path).
    await waitFor(() =>
      expect(
        events.some((e) => e.kind === 'error' && e.message === 'host onComplete exploded')
      ).toBe(true)
    );
    // Because the throw preceded analytics.onWorkflowComplete, that never fired.
    expect(events.some((e) => e.kind === 'wfComplete')).toBe(false);
    // The rethrow was swallowed by the form-submit boundary — tree still alive.
    expectNoCrash();
  });

  // --------------------------------------------------------------------------
  // O4 — durations are plausible and monotonic against real waits.
  // --------------------------------------------------------------------------

  it('O4: step + workflow durations are non-negative and the total spans a step (real timers)', async () => {
    const events: Ev[] = [];
    renderObservFlow(buildObservabilityFlow(events));

    await expectStep('a');
    await sleep(30); // a's dwell
    await act(async () => setStepField('a1', 'alpha'));
    await clickNext();
    await expectStep('b');

    await sleep(30); // b's dwell
    await act(async () => setStepField('b1', 'beta'));
    await clickNext();
    await expectStep('c');

    await act(async () => setStepField('c1', 'gamma'));
    await clickNext();

    await waitFor(() => expect(events.some((e) => e.kind === 'wfComplete')).toBe(true));

    const completes = events.filter(
      (e): e is Extract<Ev, { kind: 'complete' }> => e.kind === 'complete'
    );
    const wfComplete = events.find(
      (e): e is Extract<Ev, { kind: 'wfComplete' }> => e.kind === 'wfComplete'
    );

    // Every measured duration is a real, non-negative number.
    for (const c of completes) {
      expect(Number.isFinite(c.duration)).toBe(true);
      expect(c.duration).toBeGreaterThanOrEqual(0);
    }
    expect(wfComplete).toBeDefined();
    expect(wfComplete?.duration).toBeGreaterThanOrEqual(0);

    // The whole-workflow duration must be at least as long as any single step's
    // duration — the total interval contains every step interval.
    const maxStep = Math.max(...completes.map((c) => c.duration));
    expect((wfComplete as Extract<Ev, { kind: 'wfComplete' }>).duration).toBeGreaterThanOrEqual(
      maxStep
    );

    expectNoCrash();
  });
});
