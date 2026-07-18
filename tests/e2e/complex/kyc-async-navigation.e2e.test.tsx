/**
 * =============================================================================
 * FAR-REACHING E2E — the HARDEST fintech race: ASYNC server-side KYC validation
 * (a tax-id / SSN uniqueness check) racing multi-step workflow NAVIGATION.
 *
 * The verdicts here are driven MANUALLY (a deferred promise resolved by hand),
 * so the race between "an in-flight validation" and "a step transition" is
 * deterministic and reproducible — no timers, no sleeps guarding the ordering.
 *
 * The core flow (buildRaceFlow) is 4 steps, and TWO of them declare a field of
 * the SAME id (`taxId`) — the provider↔form seam's whole point: a step change is
 * not a form change, so an async run started on step alpha must not paint its
 * verdict on step xray's same-id field once we have navigated. Field ids are not
 * unique across a flow and were never meant to be (workflow data is keyed by
 * STEP id), so this is legal input the mount path owes correct behaviour.
 *
 *   0. intro   (always)      applicantName (required, SYNC) — the gate.
 *   1. taxA    (always)      taxId — async uniqueness validator #A.
 *   2. taxB    (always)      taxId — async uniqueness validator #B (SAME id).
 *   3. review  (always,last) consent (must be checked).
 *
 * Contracts verified in source BEFORE asserting:
 *  - `validateField` claims a per-field generation token AND records the MOUNTED
 *    FORM's generation; `isStale()` (useFormValidationWithStore.ts:245) is true
 *    when EITHER a newer run superseded it OR the form was swapped
 *    (`generationRef.current !== generation`). A swap bumps `generationRef`
 *    because `instanceKey` (FormProvider's configSignature, leading with the step
 *    id) changed (…:100-103). So a stale cross-step verdict is dropped: it never
 *    reaches `_setErrors`/`_setValidationState` (…:267, 275-289).
 *  - A step swap RESETS the reused form store — `validationStates`, `errors`,
 *    `values`, `touched` all return to pristine (proved by the seam enumeration,
 *    provider-form-seam-step-identity.test.tsx), so no `validating` state and no
 *    committed error survive a transition, and a re-entered step re-validates
 *    fresh.
 *  - `goNext` is reached only through the form `submit()` (FlowNav ->
 *    WorkflowProvider.handleSubmit), so validation gates it and an async verdict
 *    is AWAITED before a forward transition; `goPrevious`
 *    (useWorkflowNavigation.ts:344) runs NO validation.
 *  - `onAfterValidation` runs inside `goNext` (…:293-317) with a `StepDataHelper`
 *    whose `setNextStepField` (…:128) writes into the raw-next step's slice.
 *  - Persistence saves data/allData/currentStepIndex (not the transient
 *    `validationStates`), so a remount cannot resurrect an in-flight `validating`.
 *
 * SUSPECTED SEAM GAP under active test (Group X): `evaluateFormLevel`
 * (useFormValidationWithStore.ts:359-404) has NO generation/stale guard — after
 * its await it writes `_setFormLevelErrors` UNCONDITIONALLY. A form-level (cross
 * field) async verdict that resolves after a step swap could therefore paint the
 * `__form__` banner onto the step we navigated to. Group X drives exactly that.
 * =============================================================================
 */
import type { ComponentRenderContext } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LocalStorageAdapter, custom, flow, form, required, ril } from 'rilaykit';
import { Flow, FlowBody, useFlow, useFlowData, useFlowSteps, useFormErrors } from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';

// ============================================================================
// A MANUALLY-RESOLVED async Standard Schema validator. Every validate() call
// parks a {value, resolve} entry so a test resolves verdicts BY HAND, in any
// order, and proves which one wins. `resolve(issues?)` -> invalid when issues
// are given, valid otherwise. Idempotent so resolveAllPending() is safe.
// ============================================================================

type PendingCall = {
  value: unknown;
  resolved: boolean;
  resolve: (issues?: { message: string }[]) => void;
};

function makeControllableAsync() {
  const calls: PendingCall[] = [];
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'kyc',
      validate: (value: unknown) =>
        new Promise<{ issues?: { message: string }[]; value?: unknown }>((res) => {
          const entry: PendingCall = {
            value,
            resolved: false,
            resolve: (issues) => {
              if (entry.resolved) return;
              entry.resolved = true;
              res(issues ? { issues } : { value });
            },
          };
          calls.push(entry);
        }),
    },
  };
  return { schema, calls };
}

function resolveAllPending(calls: PendingCall[], issues?: { message: string }[]) {
  for (const call of calls) call.resolve(issues);
}

// ============================================================================
// ERROR + VALIDATING aware renderers — assert what the USER SEES.
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
      <span data-testid={`touched-${id}`}>{field?.touched ? 'touched' : 'pristine'}</span>
      <span data-testid={`validating-${id}`}>{field?.isValidating ? 'validating' : 'idle'}</span>
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

function ErrorAwareCheckbox({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
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

/** A form-level `__form__` banner, mounted as a field of the step form so
 *  useFormErrors() reads the CURRENTLY mounted step's cross-field bucket. */
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
  .component('checkbox', {
    name: 'Checkbox',
    renderer: ErrorAwareCheckbox,
    defaultProps: { label: '' },
  })
  .component('banner', { name: 'Banner', renderer: FormErrorBanner, defaultProps: {} });

// ============================================================================
// FLOW BUILDERS
// ============================================================================

const RACE_ID = 'kyc-async-nav';
const RACE_STORAGE_KEY = `rilay_workflow_${RACE_ID}`;

type AsyncQueue = ReturnType<typeof makeControllableAsync>;

/**
 * The core race flow. taxA and taxB BOTH declare a field `taxId` (the seam):
 * a verdict computed for taxA's `taxId` must never land on taxB's `taxId`.
 */
function buildRaceFlow({
  taxA,
  taxB,
  persist,
}: {
  taxA: AsyncQueue;
  taxB: AsyncQueue;
  persist?: LocalStorageAdapter;
}) {
  const introForm = form
    .create(rilConfig, 'intro-form')
    .add({
      id: 'applicantName',
      type: 'text',
      props: { label: 'Applicant name' },
      validation: { validate: required('Applicant name is required') },
    })
    .build();

  const taxAForm = form
    .create(rilConfig, 'taxA-form')
    .add({
      id: 'taxId',
      type: 'text',
      props: { label: 'Tax ID (A)' },
      validation: { validate: taxA.schema },
    })
    .build();

  const taxBForm = form
    .create(rilConfig, 'taxB-form')
    .add({
      id: 'taxId',
      type: 'text',
      props: { label: 'Tax ID (B)' },
      validation: { validate: taxB.schema },
    })
    .build();

  const reviewForm = form
    .create(rilConfig, 'review-form')
    .add({
      id: 'consent',
      type: 'checkbox',
      props: { label: 'I certify this is accurate' },
      validation: { validate: custom<boolean>((v) => v === true, 'You must certify to continue') },
    })
    .build();

  const builder = flow
    .create(rilConfig, RACE_ID, 'KYC Async Nav', 'async validation racing navigation')
    .addStep({ id: 'intro', title: 'Intro', formConfig: introForm })
    .addStep({ id: 'taxA', title: 'Tax A', formConfig: taxAForm })
    .addStep({ id: 'taxB', title: 'Tax B', formConfig: taxBForm })
    .addStep({ id: 'review', title: 'Review', formConfig: reviewForm });

  if (persist) {
    return builder
      .configure({
        persistence: { adapter: persist, options: { autoPersist: true, debounceMs: 0 } },
      })
      .build();
  }
  return builder.build();
}

/**
 * A cross-field (form-level) async flow. `pinStep` runs a MANUALLY-resolved
 * form-level rule that "server-confirms" pin === confirmPin. `entry` and
 * `landing` render the same `__form__` banner, so a form-level verdict leaking
 * onto the wrong step is VISIBLE.
 */
function buildXFieldFlow(formLevel: AsyncQueue) {
  const entryForm = form
    .create(rilConfig, 'xf-entry-form')
    .add({ id: 'banner', type: 'banner', props: {} })
    .add({
      id: 'applicantName',
      type: 'text',
      props: { label: 'Applicant name' },
      validation: { validate: required('Applicant name is required') },
    })
    .build();

  const pinForm = form
    .create(rilConfig, 'xf-pin-form')
    .add({ id: 'banner', type: 'banner', props: {} })
    .add({ id: 'pin', type: 'text', props: { label: 'PIN' } })
    .add({ id: 'confirmPin', type: 'text', props: { label: 'Confirm PIN' } })
    // onChange so the cross-field rule re-runs live as the user types.
    .setValidation({ mode: 'onChange', validate: formLevel.schema })
    .build();

  const landingForm = form
    .create(rilConfig, 'xf-landing-form')
    .add({ id: 'banner', type: 'banner', props: {} })
    .add({ id: 'note', type: 'text', props: { label: 'Note' } })
    .build();

  return flow
    .create(rilConfig, 'kyc-xfield-async', 'KYC XField', 'form-level async racing nav')
    .addStep({ id: 'entry', title: 'Entry', formConfig: entryForm })
    .addStep({ id: 'pinStep', title: 'PIN', formConfig: pinForm })
    .addStep({ id: 'landing', title: 'Landing', formConfig: landingForm })
    .build();
}

/**
 * A prefill flow: step `source`'s `onAfterValidation` seeds the next step's
 * `refId` field via `helper.setNextStepField`.
 */
function buildPrefillFlow(afterSpy?: (...args: unknown[]) => void) {
  const sourceForm = form
    .create(rilConfig, 'src-form')
    .add({
      id: 'company',
      type: 'text',
      props: { label: 'Company' },
      validation: { validate: required('Company is required') },
    })
    .build();

  const destForm = form
    .create(rilConfig, 'dst-form')
    .add({ id: 'refId', type: 'text', props: { label: 'Reference' } })
    .add({
      id: 'notes',
      type: 'text',
      props: { label: 'Notes' },
      validation: { validate: required('Notes is required') },
    })
    .build();

  return flow
    .create(rilConfig, 'kyc-prefill', 'KYC Prefill', 'onAfterValidation prefill')
    .addStep({
      id: 'source',
      title: 'Source',
      formConfig: sourceForm,
      onAfterValidation: (stepData, helper, ctx) => {
        afterSpy?.(stepData, helper, ctx);
        // Prefill the next step's reference from the company name.
        helper.setNextStepField('refId', `REF-${String(stepData.company ?? '')}`);
      },
    })
    .addStep({ id: 'dest', title: 'Dest', formConfig: destForm })
    .build();
}

// ============================================================================
// PROBES / HELPERS
// ============================================================================

function NavProbe() {
  const { workflowState, currentStep } = useFlow();
  const { steps, currentIndex } = useFlowSteps();
  const allData = useFlowData();
  return (
    <div>
      <span data-testid="cur-id">{currentStep?.id}</span>
      <span data-testid="cur-idx">{workflowState.currentStepIndex}</span>
      <span data-testid="transitioning">{workflowState.isTransitioning ? 'true' : 'false'}</span>
      <span data-testid="visible-count">{steps.length}</span>
      <span data-testid="visible-idx">{currentIndex}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

function renderFlow(
  workflowConfig: ReturnType<typeof buildRaceFlow>,
  onComplete?: (data: Record<string, unknown>) => void
) {
  return render(
    <Flow of={workflowConfig} onComplete={onComplete}>
      <FlowBody />
      <NextButton />
      <PrevButton />
      <NavProbe />
    </Flow>
  );
}

async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('next-btn'));
  });
}
async function clickPrev() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('prev-btn'));
  });
}
function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function blurField(id: string) {
  fireEvent.blur(screen.getByTestId(`input-${id}`));
}
function setCheckbox(id: string, checked: boolean) {
  const el = screen.getByTestId(`input-${id}`) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}
async function expectStep(id: string) {
  await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent(id));
}
function hasUiError(id: string) {
  return screen.queryByTestId(`ui-errors-${id}`) !== null;
}
function isValidating(id: string) {
  return screen.getByTestId(`validating-${id}`).textContent === 'validating';
}
function allData(): Record<string, any> {
  return JSON.parse(screen.getByTestId('all-data').textContent || '{}');
}

/** Fill the intro gate and advance to taxA (intro validation is SYNC). */
async function enterTaxA(name = 'Acme LLC') {
  await waitFor(() => expect(screen.getByTestId('input-applicantName')).toBeInTheDocument());
  await act(async () => setField('applicantName', name));
  await clickNext();
  await expectStep('taxA');
}

/**
 * Click Next and resolve the async run the submit parks, then await the outcome.
 * `verdict` undefined -> valid (advances); issues -> invalid (stays).
 */
async function nextResolving(queue: AsyncQueue, issues?: { message: string }[]) {
  const before = queue.calls.length;
  await act(async () => {
    fireEvent.click(screen.getByTestId('next-btn'));
  });
  await waitFor(() => expect(queue.calls.length).toBeGreaterThan(before));
  await act(async () => {
    resolveAllPending(queue.calls, issues);
    await Promise.resolve();
  });
}

/** From taxA, type a valid taxId and advance to taxB (resolving A's verdict). */
async function enterTaxB(taxA: AsyncQueue, value = 'A-UNIQUE') {
  await waitFor(() => expect(screen.getByTestId('input-taxId')).toBeInTheDocument());
  await act(async () => setField('taxId', value));
  await nextResolving(taxA);
  await expectStep('taxB');
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — KYC async validation racing workflow navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // GROUP S — STALE verdict across a step transition (the seam contract)
  // --------------------------------------------------------------------------

  it('S1: a stale INVALID verdict resolving AFTER a back transition never paints the destination same-id field', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();
    await enterTaxB(taxA);

    // On taxB: type + blur -> an async run for taxB.taxId is IN FLIGHT.
    await act(async () => setField('taxId', 'B-PENDING'));
    await act(async () => blurField('taxId'));
    await waitFor(() => expect(taxB.calls.length).toBeGreaterThan(0));
    const pending = taxB.calls[taxB.calls.length - 1];
    expect(pending.resolved).toBe(false);

    // Navigate BACK to taxA — goPrevious runs NO validation, transition is immediate.
    await clickPrev();
    await expectStep('taxA');

    // The OLD taxB verdict lands INVALID, late — it belongs to a form that was
    // swapped out. It must NOT paint taxA's same-id `taxId`.
    await act(async () => {
      pending.resolve([{ message: 'This tax ID is already registered' }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('taxA'));
    expect(hasUiError('taxId')).toBe(false);
    expect(isValidating('taxId')).toBe(false);
    // taxA restored its own value; the stale verdict left taxA usable.
    expect(screen.getByTestId('input-taxId')).toHaveValue('A-UNIQUE');
    // Navigation is not wedged: forward still works.
    await nextResolving(taxA);
    await expectStep('taxB');
  });

  it('S2: a stale VALID verdict resolving after a back transition is simply dropped', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();
    await enterTaxB(taxA);

    await act(async () => setField('taxId', 'B-PENDING'));
    await act(async () => blurField('taxId'));
    await waitFor(() => expect(taxB.calls.length).toBeGreaterThan(0));
    const pending = taxB.calls[taxB.calls.length - 1];

    await clickPrev();
    await expectStep('taxA');

    // Late VALID verdict for the swapped-out form: dropped, no crash, no spurious
    // state on taxA.
    await act(async () => {
      pending.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('transitioning')).toHaveTextContent('false'));
    expect(screen.getByTestId('cur-id')).toHaveTextContent('taxA');
    expect(isValidating('taxId')).toBe(false);
    expect(hasUiError('taxId')).toBe(false);
  });

  it('S3: going BACK while a validation is in flight does not error the step being LEFT; re-entry is fresh', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();
    await enterTaxB(taxA);

    // taxB async in flight.
    await act(async () => setField('taxId', 'B-PENDING'));
    await act(async () => blurField('taxId'));
    await waitFor(() => expect(taxB.calls.length).toBeGreaterThan(0));
    const pending = taxB.calls[taxB.calls.length - 1];

    // Leave taxB mid-flight; resolve INVALID after we are gone.
    await clickPrev();
    await expectStep('taxA');
    await act(async () => {
      pending.resolve([{ message: 'This tax ID is already registered' }]);
      await Promise.resolve();
    });

    // Return to taxB: it re-mounts fresh — the dropped verdict left no error and
    // no stuck `validating` on the step we had left.
    await nextResolving(taxA);
    await expectStep('taxB');
    expect(screen.getByTestId('input-taxId')).toHaveValue('B-PENDING');
    expect(hasUiError('taxId')).toBe(false);
    expect(isValidating('taxId')).toBe(false);
  });

  it('S4: a COMMITTED async error is gone after leaving and re-entering the step (fresh re-validate)', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();

    // On taxA: type a "taken" id, blur -> commit an INVALID verdict, visible.
    await act(async () => setField('taxId', 'TAKEN'));
    await act(async () => blurField('taxId'));
    await waitFor(() => expect(taxA.calls.length).toBeGreaterThan(0));
    await act(async () => {
      resolveAllPending(taxA.calls, [{ message: 'This tax ID is already registered' }]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('ui-errors-taxId')).toBeInTheDocument());

    // Leave to intro (Back, no validation), then come forward again.
    await clickPrev();
    await expectStep('intro');
    await clickNext();
    await expectStep('taxA');

    // The prior visit's committed error is not resurrected; the field is fresh.
    expect(hasUiError('taxId')).toBe(false);
    expect(isValidating('taxId')).toBe(false);
    expect(screen.getByTestId('input-taxId')).toHaveValue('TAKEN');
  });

  // --------------------------------------------------------------------------
  // GROUP G — async validator GATES Next (awaited before a forward transition)
  // --------------------------------------------------------------------------

  it('G1: an INVALID async verdict blocks Next, keeps us on the step, error visible', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();

    await act(async () => setField('taxId', 'TAKEN'));
    // Next parks the submit's run; resolve it INVALID.
    await nextResolving(taxA, [{ message: 'This tax ID is already registered' }]);

    await waitFor(() => expect(screen.getByTestId('ui-errors-taxId')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('taxA');
    expect(isValidating('taxId')).toBe(false);
  });

  it('G2: a VALID async verdict lets Next through; the invalid attempt did not wedge the gate', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();

    // First attempt invalid -> blocked.
    await act(async () => setField('taxId', 'TAKEN'));
    await nextResolving(taxA, [{ message: 'This tax ID is already registered' }]);
    await waitFor(() => expect(screen.getByTestId('ui-errors-taxId')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('taxA');

    // Fix -> a fresh VALID verdict lets Next through.
    await act(async () => setField('taxId', 'A-UNIQUE'));
    await nextResolving(taxA);
    await expectStep('taxB');
    expect(hasUiError('taxId')).toBe(false);
  });

  it('G3: an async gate resolved VALID completes the whole flow with the projected payload', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    const onComplete = vi.fn();
    renderFlow(buildRaceFlow({ taxA, taxB }), onComplete);

    await enterTaxA();
    await enterTaxB(taxA);

    await act(async () => setField('taxId', 'B-UNIQUE'));
    await nextResolving(taxB);
    await expectStep('review');

    await act(async () => setCheckbox('consent', true));
    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const data = onComplete.mock.calls[0][0] as Record<string, any>;
    expect(data.intro).toEqual({ applicantName: 'Acme LLC' });
    expect(data.taxA).toEqual({ taxId: 'A-UNIQUE' });
    expect(data.taxB).toEqual({ taxId: 'B-UNIQUE' });
    expect(data.review).toEqual({ consent: true });
  });

  // --------------------------------------------------------------------------
  // GROUP C — rapid Next/Back churn while an async verdict is pending
  // --------------------------------------------------------------------------

  it('C1: Next (async pending) then Back then Next reaches a coherent, non-stuck final state', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA, taxB }));

    await enterTaxA();
    await act(async () => setField('taxId', 'A-UNIQUE'));

    // Click Next (submit parks an async run, awaiting) then immediately Back and
    // Next again — churn while the first verdict is still pending.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => expect(taxA.calls.length).toBeGreaterThan(0));
    await clickPrev(); // -> intro (bumps the form generation)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn')); // intro -> taxA (sync gate)
    });

    // Now drain every pending async verdict as VALID.
    await act(async () => {
      resolveAllPending(taxA.calls);
      await Promise.resolve();
    });

    // Settled: not transitioning, on a real step, no stuck validating, data intact.
    await waitFor(() => expect(screen.getByTestId('transitioning')).toHaveTextContent('false'));
    await waitFor(() => {
      const cur = screen.getByTestId('cur-id').textContent;
      expect(['intro', 'taxA', 'taxB']).toContain(cur);
    });
    // Whichever step we settled on, its taxId field (if any) is not stuck validating.
    const validatingEl = screen.queryByTestId('validating-taxId');
    if (validatingEl) expect(validatingEl).toHaveTextContent('idle');
    expect(allData().intro.applicantName).toBe('Acme LLC');
    // Drain any residual to avoid dangling promises.
    await act(async () => {
      resolveAllPending(taxA.calls);
      resolveAllPending(taxB.calls);
      await Promise.resolve();
    });
  });

  // --------------------------------------------------------------------------
  // GROUP X — form-level (cross-field) async verdict racing a transition.
  // Drives the suspected `evaluateFormLevel` seam gap (no stale guard).
  // --------------------------------------------------------------------------

  /**
   * ===========================================================================
   * FAILING — LIBRARY BUG (not a test defect). The form-level seam gap.
   *
   * `validateField` was hardened against exactly this race: it records the
   * MOUNTED FORM's generation (useFormValidationWithStore.ts:244) and its
   * `isStale()` (…:245) drops any verdict whose form was swapped
   * (`generationRef.current !== generation`), so a per-field async run started on
   * the previous step never writes onto the new step's same-id field.
   *
   * `evaluateFormLevel` (…:359-404) — the CROSS-FIELD path — was NOT given the
   * same guard. It captures no generation, and after its await it writes
   * UNCONDITIONALLY:
   *     store.getState()._setFormLevelErrors(routeFormIssuesToKeys(...))   (:402)
   * The form store is REUSED across a step change (reset-not-remount — see the
   * provider-form-seam tests), so `store` still points at the live store, now
   * mounted for the step we navigated TO. A cross-field verdict that resolves
   * after the transition therefore paints the `__form__` banner onto the WRONG
   * step. Here: a "PIN and confirmation do not match" message computed for
   * `pinStep` appears on `entry`, a step that has no PIN fields and no
   * form-level rule of its own to clear it.
   *
   * This is the same class as the field-level stale-verdict bug the generation
   * token closed, one path over. X2 is the control: the identical verdict
   * resolved WITHOUT a transition shows correctly, so the failure is purely the
   * unguarded cross-step write. The fix is to give `evaluateFormLevel` the same
   * generation capture + stale check `validateField` already has (drop the
   * write when `generationRef.current !== generation`). No library source was
   * edited — tests only.
   * ===========================================================================
   */
  it('X1: a form-level async verdict resolving after a back transition must not paint the destination banner', async () => {
    const formLevel = makeControllableAsync();
    render(
      <Flow of={buildXFieldFlow(formLevel)}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <NavProbe />
      </Flow>
    );

    // entry -> pinStep (entry gate is sync).
    await waitFor(() => expect(screen.getByTestId('input-applicantName')).toBeInTheDocument());
    await act(async () => setField('applicantName', 'Acme LLC'));
    await clickNext();
    await expectStep('pinStep');

    // Type a MISMATCH -> the form-level (server) rule runs and is IN FLIGHT.
    await act(async () => setField('pin', '1234'));
    await act(async () => setField('confirmPin', '9999'));
    await waitFor(() => expect(formLevel.calls.length).toBeGreaterThan(0));
    const pending = formLevel.calls[formLevel.calls.length - 1];
    expect(pending.resolved).toBe(false);

    // Navigate BACK to entry before the verdict lands.
    await clickPrev();
    await expectStep('entry');

    // The stale form-level verdict resolves INVALID, late. It was computed for a
    // form that has been swapped out — it must NOT show on entry's banner.
    await act(async () => {
      pending.resolve([{ message: 'PIN and confirmation do not match' }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('transitioning')).toHaveTextContent('false'));
    expect(screen.getByTestId('cur-id')).toHaveTextContent('entry');
    // The contract: no cross-field banner leaked onto the step we navigated to.
    expect(screen.queryByTestId('form-errors')).not.toBeInTheDocument();
  });

  it('X2: a form-level async verdict resolving after we RETURN to the step shows correctly (control)', async () => {
    const formLevel = makeControllableAsync();
    render(
      <Flow of={buildXFieldFlow(formLevel)}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <NavProbe />
      </Flow>
    );

    await waitFor(() => expect(screen.getByTestId('input-applicantName')).toBeInTheDocument());
    await act(async () => setField('applicantName', 'Acme LLC'));
    await clickNext();
    await expectStep('pinStep');

    // A live MISMATCH verdict resolved WHILE STILL ON pinStep paints the banner —
    // this is the intended positive behaviour the leak test is contrasted against.
    await act(async () => setField('pin', '1234'));
    await act(async () => setField('confirmPin', '9999'));
    await waitFor(() => expect(formLevel.calls.length).toBeGreaterThan(0));
    await act(async () => {
      resolveAllPending(formLevel.calls, [{ message: 'PIN and confirmation do not match' }]);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId('form-error-0')).toHaveTextContent(
        'PIN and confirmation do not match'
      )
    );
    expect(screen.getByTestId('cur-id')).toHaveTextContent('pinStep');
  });

  // --------------------------------------------------------------------------
  // GROUP P — onAfterValidation prefill (setNextStepField)
  // --------------------------------------------------------------------------

  it('P1: a step onAfterValidation prefills the next step field, and it lands in the input', async () => {
    render(
      <Flow of={buildPrefillFlow()}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <NavProbe />
      </Flow>
    );

    await waitFor(() => expect(screen.getByTestId('input-company')).toBeInTheDocument());
    await act(async () => setField('company', 'Globex'));
    await clickNext();
    await expectStep('dest');

    // The prefill landed on the next step's input.
    await waitFor(() => expect(screen.getByTestId('input-refId')).toHaveValue('REF-Globex'));
    expect(allData().dest.refId).toBe('REF-Globex');
  });

  it('P2: the prefill survives a back -> next round trip (onAfterValidation re-runs with live data)', async () => {
    const afterSpy = vi.fn();
    render(
      <Flow of={buildPrefillFlow(afterSpy)}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <NavProbe />
      </Flow>
    );

    await waitFor(() => expect(screen.getByTestId('input-company')).toBeInTheDocument());
    await act(async () => setField('company', 'Globex'));
    await clickNext();
    await expectStep('dest');
    await waitFor(() => expect(screen.getByTestId('input-refId')).toHaveValue('REF-Globex'));
    expect(afterSpy).toHaveBeenCalledTimes(1);

    // Back to source, edit the company, forward again — the prefill reflects the
    // LIVE edit (onAfterValidation ran again with the new value).
    await clickPrev();
    await expectStep('source');
    await act(async () => setField('company', 'Initech'));
    await clickNext();
    await expectStep('dest');
    await waitFor(() => expect(screen.getByTestId('input-refId')).toHaveValue('REF-Initech'));
    expect(afterSpy).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // GROUP R — persistence during an in-flight async validation
  // --------------------------------------------------------------------------

  it('R1: unmount mid-validation then remount resumes with no stuck validating and data intact', async () => {
    const taxA = makeControllableAsync();
    const taxB = makeControllableAsync();
    const { unmount } = renderFlow(
      buildRaceFlow({ taxA, taxB, persist: new LocalStorageAdapter() })
    );

    await enterTaxA();

    // Kick off an async validation on taxA.taxId and leave it PENDING.
    await act(async () => setField('taxId', 'A-PENDING'));
    await act(async () => blurField('taxId'));
    await waitFor(() => expect(taxA.calls.length).toBeGreaterThan(0));
    expect(taxA.calls[taxA.calls.length - 1].resolved).toBe(false);
    // The typed value is captured by persistence (autoPersist, debounceMs 0).
    await waitFor(() => {
      const raw = localStorage.getItem(RACE_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).data?.allData?.taxA?.taxId).toBe('A-PENDING');
    });

    // Unmount WHILE the validation is still in flight (never resolved).
    unmount();

    // Remount from persistence with a fresh set of (never-touched) validators.
    const taxA2 = makeControllableAsync();
    const taxB2 = makeControllableAsync();
    renderFlow(buildRaceFlow({ taxA: taxA2, taxB: taxB2, persist: new LocalStorageAdapter() }));

    // Resumed onto taxA with the value intact and NO stuck `validating` state
    // (validationStates are transient — never persisted, so a fresh mount is idle).
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('taxA'));
    await waitFor(() => expect(screen.getByTestId('input-taxId')).toHaveValue('A-PENDING'));
    expect(isValidating('taxId')).toBe(false);
    expect(hasUiError('taxId')).toBe(false);
    // The remounted form validates freshly on demand: a fresh verdict works.
    await act(async () => setField('taxId', 'A-UNIQUE'));
    await nextResolving(taxA2);
    await expectStep('taxB');
  });
});
