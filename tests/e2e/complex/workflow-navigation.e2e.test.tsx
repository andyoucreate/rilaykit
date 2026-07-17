/**
 * =============================================================================
 * COMPLEX E2E — Multi-step workflow NAVIGATION: next / back / skip / jump.
 *
 * ONE 4-step flow exercised across many intersecting navigation scenarios:
 *
 *   0. account  (always)      email (required) + plan select ('' | free | pro)
 *   1. billing  (plan==='pro') cardName (required)
 *   2. prefs    (always)      newsletter — skippable (static or predicate)
 *   3. confirm  (always,last) signature
 *
 * Under test: data survival across back/forward; a back-then-edit feeding the
 * downstream allData; validation gating `next`; error hygiene across
 * transitions (back must not validate, and must not leave stale errors);
 * static + predicate `allowSkip`; conditional steps changing the traversal and
 * the VISIBLE step count; boundary navigation (first-step back, last step);
 * rapid churn; and the completion payload after a back-and-forth.
 *
 * Contracts verified in source before asserting:
 *  - `goPrevious` (useWorkflowNavigation.ts:342) runs NO validation and no
 *    `onAfterValidation` — it is a bare `goToStep` to the previous VISIBLE step.
 *  - `goNext` (…:291) is only ever reached through the form's `submit()`
 *    (FlowNav.tsx:47 -> WorkflowProvider.handleSubmit:799), so validation gates it.
 *  - `findNextVisibleStep`/`findPreviousVisibleStep` (…:265/278) traverse
 *    VISIBLE steps only, evaluated against LIVE data.
 *  - A step swap remounts/resets the form store via `instanceId`
 *    (WorkflowProvider.tsx:1023 -> FormProvider.tsx:356 'swap'), so errors are
 *    per-step and cannot survive a transition.
 *  - `skipStep` (…:362) never validates, never marks the step passed.
 *  - `resolveAllowSkip` (utils/resolveAllowSkip.ts:7) accepts a boolean or a
 *    `({ allData }) => boolean` predicate.
 * =============================================================================
 */
import { required, ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';
import {
  FlowBody,
  WorkflowProvider,
  useFlow,
  useFlowData,
  useFlowSteps,
} from '@rilaykit/workflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton, SkipButton } from '../_setup/nav-buttons';
import { FieldErrorDisplay, MockSelectInput, MockTextInput } from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
  .component('select', {
    name: 'Select',
    renderer: MockSelectInput,
    defaultProps: { label: '', options: [] },
  });

type SkipMode = 'none' | 'static' | 'predicate';

function buildForms() {
  const accountForm = form
    .create(rilConfig, 'account-form')
    .add({
      id: 'email',
      type: 'text',
      props: { label: 'Email' },
      validation: { validate: required('Email is required') },
    })
    .add({
      id: 'plan',
      type: 'select',
      props: {
        label: 'Plan',
        options: [
          { value: '', label: 'Select...' },
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
        ],
      },
    })
    .build();

  const billingForm = form
    .create(rilConfig, 'billing-form')
    .add({
      id: 'cardName',
      type: 'text',
      props: { label: 'Card name' },
      validation: { validate: required('Card name is required') },
    })
    .build();

  const prefsForm = form
    .create(rilConfig, 'prefs-form')
    .add({ id: 'newsletter', type: 'text', props: { label: 'Newsletter' } })
    .build();

  const confirmForm = form
    .create(rilConfig, 'confirm-form')
    .add({ id: 'signature', type: 'text', props: { label: 'Signature' } })
    .build();

  return { accountForm, billingForm, prefsForm, confirmForm };
}

/**
 * `prefs.allowSkip` in predicate mode is only true for the pro plan — so the
 * SAME step is skippable or not depending on data written on step 0.
 */
function prefsAllowSkip(mode: SkipMode) {
  if (mode === 'static') return true;
  if (mode === 'predicate') {
    return ({ allData }: { allData: Record<string, unknown> }) =>
      (allData.account as Record<string, unknown> | undefined)?.plan === 'pro';
  }
  return undefined;
}

function buildFlow({
  skipMode = 'none',
  onAccountAfter,
  skipConfirm = false,
}: {
  skipMode?: SkipMode;
  /** Spy planted on step 0's `onAfterValidation` — must fire on next, never on back. */
  onAccountAfter?: (...args: any[]) => void;
  /** Make the LAST step skippable, to exercise the skip-completes fall-through. */
  skipConfirm?: boolean;
} = {}) {
  const { accountForm, billingForm, prefsForm, confirmForm } = buildForms();

  return flow
    .create(rilConfig, 'nav-flow', 'Navigation Flow', 'next/back/skip/jump')
    .addStep({
      id: 'account',
      title: 'Account',
      formConfig: accountForm,
      onAfterValidation: onAccountAfter,
    })
    .addStep({
      id: 'billing',
      title: 'Billing',
      formConfig: billingForm,
      conditions: { visible: when('plan').equals('pro').build() },
    })
    .addStep({
      id: 'prefs',
      title: 'Preferences',
      formConfig: prefsForm,
      allowSkip: prefsAllowSkip(skipMode),
    })
    .addStep({
      id: 'confirm',
      title: 'Confirm',
      formConfig: confirmForm,
      allowSkip: skipConfirm ? true : undefined,
    })
    .build();
}

// ============================================================================
// PROBES
// ============================================================================

function NavProbe() {
  const { workflowState, currentStep, context } = useFlow();
  const { steps, currentIndex } = useFlowSteps();
  const allData = useFlowData();
  return (
    <div>
      <span data-testid="cur-idx">{workflowState.currentStepIndex}</span>
      <span data-testid="cur-id">{currentStep?.id}</span>
      <span data-testid="transitioning">{workflowState.isTransitioning ? 'true' : 'false'}</span>
      <span data-testid="visible-count">{steps.length}</span>
      <span data-testid="visible-idx">{currentIndex}</span>
      <span data-testid="visible-ids">{steps.map((s) => s.id).join(',')}</span>
      <span data-testid="is-last">{context.isLastStep ? 'true' : 'false'}</span>
      <span data-testid="is-first">{context.isFirstStep ? 'true' : 'false'}</span>
      <span data-testid="passed">{Array.from(workflowState.passedSteps).sort().join(',')}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

/** Every field id of the whole flow — only the mounted step's form has errors. */
function AllErrorsProbe() {
  return (
    <>
      <FieldErrorDisplay id="email" />
      <FieldErrorDisplay id="cardName" />
      <FieldErrorDisplay id="newsletter" />
      <FieldErrorDisplay id="signature" />
    </>
  );
}

function GoToButtons() {
  const { goToStep } = useFlow();
  return (
    <div>
      {[0, 1, 2, 3].map((i) => (
        <button key={i} type="button" data-testid={`goto-${i}`} onClick={() => void goToStep(i)}>
          {i}
        </button>
      ))}
    </div>
  );
}

function renderFlow(
  workflowConfig: ReturnType<typeof buildFlow>,
  extra?: { onComplete?: (data: Record<string, unknown>) => void }
) {
  return render(
    <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={extra?.onComplete}>
      <FlowBody />
      <NextButton />
      <PrevButton />
      <SkipButton />
      <GoToButtons />
      <AllErrorsProbe />
      <NavProbe />
    </WorkflowProvider>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

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
async function clickSkip() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('skip-btn'));
  });
}
function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
function allData(): Record<string, any> {
  return JSON.parse(screen.getByTestId('all-data').textContent || '{}');
}
async function expectStep(id: string) {
  await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent(id));
}
/** No field of any step is currently displaying an error. */
function expectNoErrors() {
  for (const id of ['email', 'cardName', 'newsletter', 'signature']) {
    expect(screen.queryByTestId(`errors-${id}`)).not.toBeInTheDocument();
  }
}

/** Fill step 0 with a valid account and land on `billing` (pro) or `prefs` (free). */
async function fillAccount(email: string, plan: 'free' | 'pro') {
  await waitFor(() => expect(screen.getByTestId('input-email')).toBeInTheDocument());
  await act(async () => {
    setField('email', email);
    setField('plan', plan);
  });
  await waitFor(() => {
    expect(screen.getByTestId('input-email')).toHaveValue(email);
    expect(screen.getByTestId('input-plan')).toHaveValue(plan);
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — workflow navigation: back / next / skip / jump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // GROUP A — data survival across back/forward
  // --------------------------------------------------------------------------

  it('A1: back restores step-1 values IN THE INPUTS; forward restores step-2 values', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');

    await act(async () => setField('cardName', 'Ada L'));
    await waitFor(() => expect(screen.getByTestId('input-cardName')).toHaveValue('Ada L'));

    // Back to account — values are re-seeded into the real inputs, not just the store.
    await clickPrev();
    await expectStep('account');
    await waitFor(() => {
      expect(screen.getByTestId('input-email')).toHaveValue('a@b.com');
      expect(screen.getByTestId('input-plan')).toHaveValue('pro');
    });

    // Forward again — step 2's value survived the round trip.
    await clickNext();
    await expectStep('billing');
    await waitFor(() => expect(screen.getByTestId('input-cardName')).toHaveValue('Ada L'));
  });

  it('A2: back -> edit -> next: the downstream step sees the UPDATED allData, not the stale one', async () => {
    renderFlow(buildFlow());

    await fillAccount('old@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    expect(allData().account.email).toBe('old@b.com');

    await clickPrev();
    await expectStep('account');

    // Edit the step-1 value AFTER coming back.
    await act(async () => setField('email', 'new@b.com'));
    await waitFor(() => expect(screen.getByTestId('input-email')).toHaveValue('new@b.com'));

    await clickNext();
    await expectStep('billing');
    // The forward transition carries the edit, not the pre-back snapshot.
    expect(allData().account.email).toBe('new@b.com');
  });

  it('A3: an edit on a LATER step survives going back to it a second time', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    await act(async () => setField('cardName', 'First'));

    await clickNext();
    await expectStep('prefs');
    await act(async () => setField('newsletter', 'weekly'));

    await clickPrev();
    await expectStep('billing');
    await waitFor(() => expect(screen.getByTestId('input-cardName')).toHaveValue('First'));
    await act(async () => setField('cardName', 'Second'));

    await clickNext();
    await expectStep('prefs');
    await waitFor(() => expect(screen.getByTestId('input-newsletter')).toHaveValue('weekly'));
    expect(allData().billing.cardName).toBe('Second');
  });

  // --------------------------------------------------------------------------
  // GROUP B — validation gating & error hygiene
  // --------------------------------------------------------------------------

  it('B1: next is gated by validation — an empty required field keeps us on the step', async () => {
    renderFlow(buildFlow());

    await expectStep('account');
    await act(async () => setField('plan', 'pro'));

    // email empty -> next blocked, error shown, still on step 0.
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('errors-email')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('account');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');

    // Fix it -> next goes through.
    await act(async () => setField('email', 'a@b.com'));
    await clickNext();
    await expectStep('billing');
  });

  it('B2: going BACK does not validate the step being left (half-filled step 2 raises nothing)', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');

    // Leave billing.cardName EMPTY (it is required) and go back.
    expectNoErrors();
    await clickPrev();
    await expectStep('account');

    // Neither the step we left nor the one we landed on sprays errors.
    expectNoErrors();
  });

  it('B3: an error raised by a failed next does not survive the subsequent navigation', async () => {
    renderFlow(buildFlow());

    await expectStep('account');
    await act(async () => setField('plan', 'pro'));

    // Raise the error on step 0.
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('errors-email')).toBeInTheDocument());

    // Fix and advance.
    await act(async () => setField('email', 'a@b.com'));
    await clickNext();
    await expectStep('billing');
    expectNoErrors();

    // Back to the step that once held the error -> it is NOT redisplayed.
    await clickPrev();
    await expectStep('account');
    expectNoErrors();
    expect(screen.getByTestId('input-email')).toHaveValue('a@b.com');
  });

  it('B4: an error raised on step 2 is gone when we come back to step 2', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');

    // Fail forward on billing -> error.
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('errors-cardName')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('billing');

    // Back, then forward again: the stale error must not be resurrected.
    await clickPrev();
    await expectStep('account');
    expectNoErrors();
    await clickNext();
    await expectStep('billing');
    expectNoErrors();
  });

  it('B5: back never runs the step-0 onAfterValidation; a forward re-entry runs it again', async () => {
    const onAccountAfter = vi.fn();
    renderFlow(buildFlow({ onAccountAfter }));

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    // Forward through step 0 ran its after-handler exactly once.
    expect(onAccountAfter).toHaveBeenCalledTimes(1);

    // Going BACK onto step 0 must not run it (goPrevious is a bare goToStep).
    await clickPrev();
    await expectStep('account');
    expect(onAccountAfter).toHaveBeenCalledTimes(1);

    // Leaving step 0 forward again does run it — with the LIVE values.
    await act(async () => setField('email', 'z@b.com'));
    await clickNext();
    await expectStep('billing');
    expect(onAccountAfter).toHaveBeenCalledTimes(2);
    expect(onAccountAfter.mock.calls[1][0]).toEqual({ email: 'z@b.com', plan: 'pro' });
  });

  it('B6: a failed next does not mark the step passed; a successful one does', async () => {
    renderFlow(buildFlow());

    await expectStep('account');
    await act(async () => setField('plan', 'pro'));

    await clickNext(); // blocked on the required email
    await waitFor(() => expect(screen.getByTestId('errors-email')).toBeInTheDocument());
    expect(screen.getByTestId('passed').textContent).not.toContain('account');

    await act(async () => setField('email', 'a@b.com'));
    await clickNext();
    await expectStep('billing');
    expect(screen.getByTestId('passed').textContent).toContain('account');
  });

  // --------------------------------------------------------------------------
  // GROUP C — skip (static + predicate)
  // --------------------------------------------------------------------------

  it('C1: a static allowSkip step can be skipped; its data stays empty and it is not marked passed', async () => {
    renderFlow(buildFlow({ skipMode: 'static' }));

    await fillAccount('a@b.com', 'free'); // billing hidden
    await clickNext();
    await expectStep('prefs');

    // Skip button is offered on prefs.
    expect(screen.getByTestId('skip-btn')).not.toBeDisabled();
    await clickSkip();
    await expectStep('confirm');

    // A skipped step's data slice holds nothing the user typed…
    expect(allData().prefs).toEqual({});
    // …and a skip is not a completion.
    expect(screen.getByTestId('passed').textContent).not.toContain('prefs');
  });

  it('C2: back onto a skipped step, filling it, and going next works', async () => {
    renderFlow(buildFlow({ skipMode: 'static' }));

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');
    await clickSkip();
    await expectStep('confirm');

    await clickPrev();
    await expectStep('prefs');
    expect(screen.getByTestId('input-newsletter')).toHaveValue('');

    await act(async () => setField('newsletter', 'daily'));
    await clickNext();
    await expectStep('confirm');
    expect(allData().prefs.newsletter).toBe('daily');
  });

  it('C3: a non-skippable step offers no skip affordance', async () => {
    renderFlow(buildFlow({ skipMode: 'none' }));

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');

    // FlowSkip renders null when the step forbids skipping (FlowNav.tsx:57).
    expect(screen.queryByTestId('skip-btn')).not.toBeInTheDocument();
  });

  it('C4: allowSkip PREDICATE is honored — allowed for pro', async () => {
    renderFlow(buildFlow({ skipMode: 'predicate' }));

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    await act(async () => setField('cardName', 'Ada L'));
    await clickNext();
    await expectStep('prefs');

    // predicate: allData.account.plan === 'pro' -> skippable
    expect(screen.getByTestId('skip-btn')).not.toBeDisabled();
    await clickSkip();
    await expectStep('confirm');
  });

  it('C5: allowSkip PREDICATE is honored — NOT allowed for free', async () => {
    renderFlow(buildFlow({ skipMode: 'predicate' }));

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');

    // predicate false -> no skip affordance at all.
    expect(screen.queryByTestId('skip-btn')).not.toBeInTheDocument();
    // Forward still works the normal way.
    await clickNext();
    await expectStep('confirm');
  });

  it('C6: skipping the LAST visible step completes the workflow without its data', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow({ skipConfirm: true }), { onComplete });

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');
    await act(async () => setField('newsletter', 'weekly'));
    await clickNext();
    await expectStep('confirm');

    // Documented fall-through (WorkflowProvider.tsx:843): a skip on the last
    // visible step has nowhere to go, so it completes instead of dead-ending.
    await clickSkip();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];
    expect(payload.prefs).toEqual({ newsletter: 'weekly' });
    // The skipped last step is PRESENT (it was visited, so its slice was
    // materialised) but EMPTY — no invented answer for the question skipped.
    expect(payload.confirm).toEqual({});
    // billing was never visible on the free plan -> absent entirely.
    expect(payload.billing).toBeUndefined();
    expect(screen.getByTestId('passed').textContent).not.toContain('confirm');
  });

  /**
   * ===========================================================================
   * FAILING — LIBRARY BUG (not a test defect).
   *
   * `useWorkflowNavigation.ts:83` declares `skipInFlightRef` as a re-entrancy
   * guard for two SYNCHRONOUS `skipStep()` calls on the same step, and its
   * comment states the latch lifts "until the step id actually changes (a real
   * transition), which re-enables a legitimate skip".
   *
   * The implementation never observes that transition. `skipStep` sets
   * `skipInFlightRef.current = currentStep.id` (:373) and clears it ONLY on the
   * two FAILURE paths — no next visible step (:385) and `goToStep` returned
   * false (:398). On the SUCCESS path (:395-400) the ref keeps the skipped
   * step's id forever.
   *
   * So when the user navigates BACK onto a step they previously skipped, the
   * guard at :370 sees `skipInFlightRef.current === currentStep.id` and returns
   * false: the Skip button is rendered ENABLED (FlowNav reads
   * `canSkipCurrentStep()`, which knows nothing about the latch), the click is
   * accepted, and nothing happens — no navigation, no `onStepSkip`. The step is
   * skippable exactly once per mount.
   *
   * Verified by patching `skipInFlightRef.current = null` after the awaited
   * `goToStep` (:395): this test passes and all 25 others stay green. The await
   * has not resolved when a same-tick re-entrant call arrives, so the original
   * re-entrancy guarantee is preserved. (Patch reverted — tests only.)
   * ===========================================================================
   */
  it('C8: a step skipped once can be skipped AGAIN after navigating back onto it', async () => {
    renderFlow(buildFlow({ skipMode: 'static' }));

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');

    // First skip: prefs -> confirm.
    await clickSkip();
    await expectStep('confirm');

    // Walk back onto the same step.
    await clickPrev();
    await expectStep('prefs');
    // The step still declares itself skippable…
    expect(screen.getByTestId('skip-btn')).not.toBeDisabled();

    // …so skipping it a second time must move us forward again.
    await clickSkip();
    await expectStep('confirm');
  });

  it('C7: a skip does not bypass validation of the step it lands on', async () => {
    renderFlow(buildFlow({ skipMode: 'static' }));

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');

    // billing is NOT skippable — only prefs is.
    expect(screen.queryByTestId('skip-btn')).not.toBeInTheDocument();
    // Its required field still gates the forward move.
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('errors-cardName')).toBeInTheDocument());
    expect(screen.getByTestId('cur-id')).toHaveTextContent('billing');
  });

  // --------------------------------------------------------------------------
  // GROUP D — conditional steps change the traversal & the visible count
  // --------------------------------------------------------------------------

  it('D1: a hidden middle step is skipped by next AND by back; the visible count reflects it', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'free'); // billing hidden
    await waitFor(() => {
      expect(screen.getByTestId('visible-count')).toHaveTextContent('3');
      expect(screen.getByTestId('visible-ids')).toHaveTextContent('account,prefs,confirm');
    });

    // next jumps over billing (raw index 1 -> 2).
    await clickNext();
    await expectStep('prefs');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('2');
    expect(screen.getByTestId('visible-idx')).toHaveTextContent('1');

    // back jumps over it too — we never land on the hidden step.
    await clickPrev();
    await expectStep('account');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
  });

  it('D2: flipping the controller back makes the middle step reappear in the right position', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'free');
    await waitFor(() => expect(screen.getByTestId('visible-count')).toHaveTextContent('3'));

    // Flip to pro -> billing reappears between account and prefs.
    await act(async () => setField('plan', 'pro'));
    await waitFor(() => {
      expect(screen.getByTestId('visible-count')).toHaveTextContent('4');
      expect(screen.getByTestId('visible-ids')).toHaveTextContent('account,billing,prefs,confirm');
    });

    await clickNext();
    await expectStep('billing');
    expect(screen.getByTestId('visible-idx')).toHaveTextContent('1');

    // And flipping back to free from a LATER step re-hides it.
    await clickPrev();
    await expectStep('account');
    await act(async () => setField('plan', 'free'));
    await waitFor(() => expect(screen.getByTestId('visible-count')).toHaveTextContent('3'));
    await clickNext();
    await expectStep('prefs');
  });

  it('D3: goToStep refuses to jump onto a hidden step, but allows a visible one', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'free'); // billing (index 1) hidden

    // Jump onto the hidden billing -> refused, we stay put.
    await act(async () => fireEvent.click(screen.getByTestId('goto-1')));
    await expectStep('account');

    // Jump onto a visible later step -> allowed.
    await act(async () => fireEvent.click(screen.getByTestId('goto-3')));
    await expectStep('confirm');
    expect(screen.getByTestId('is-last')).toHaveTextContent('true');
  });

  // --------------------------------------------------------------------------
  // GROUP E — boundaries
  // --------------------------------------------------------------------------

  it('E1: back on the FIRST step is a no-op (disabled, no index underflow)', async () => {
    renderFlow(buildFlow());

    await expectStep('account');
    expect(screen.getByTestId('is-first')).toHaveTextContent('true');
    expect(screen.getByTestId('prev-btn')).toBeDisabled();

    // Even forcing the click changes nothing and does not crash.
    await clickPrev();
    await expectStep('account');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
  });

  it('E2: back from the LAST step lands on the previous visible step and can return', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');
    await act(async () => setField('newsletter', 'weekly'));
    await clickNext();
    await expectStep('confirm');
    expect(screen.getByTestId('is-last')).toHaveTextContent('true');

    await clickPrev();
    await expectStep('prefs');
    expect(screen.getByTestId('is-last')).toHaveTextContent('false');
    await waitFor(() => expect(screen.getByTestId('input-newsletter')).toHaveValue('weekly'));

    await clickNext();
    await expectStep('confirm');
  });

  it('E3: next on the LAST step completes rather than overflowing the index', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await fillAccount('a@b.com', 'free');
    await clickNext();
    await expectStep('prefs');
    await clickNext();
    await expectStep('confirm');
    await act(async () => setField('signature', 'A'));

    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Still on the last step — no index overflow.
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('3');
    expect(screen.getByTestId('cur-id')).toHaveTextContent('confirm');
  });

  // --------------------------------------------------------------------------
  // GROUP F — churn & completion after a back-and-forth
  // --------------------------------------------------------------------------

  it('F1: rapid next/back churn leaves a coherent state and no stuck isTransitioning', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    await act(async () => setField('cardName', 'Ada L'));

    // next -> back -> next -> back in quick succession.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
      fireEvent.click(screen.getByTestId('prev-btn'));
      fireEvent.click(screen.getByTestId('next-btn'));
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    await waitFor(() => expect(screen.getByTestId('transitioning')).toHaveTextContent('false'));

    // Every click read the same render's closures (currentStepIndex === 1), so
    // the four moves are goToStep(2), goToStep(0), goToStep(2), goToStep(0):
    // the last one wins and we land back on `account`, deterministically.
    expect(screen.getByTestId('cur-id')).toHaveTextContent('account');
    expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
    expect(screen.getByTestId('visible-idx')).toHaveTextContent('0');
    expectNoErrors();
    expect(allData().account.email).toBe('a@b.com');
    expect(allData().billing.cardName).toBe('Ada L');
  });

  it('F2: a full back-and-forth still completes with the FULL, freshly-edited allData', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await fillAccount('stale@b.com', 'pro');
    await clickNext();
    await expectStep('billing');
    await act(async () => setField('cardName', 'Ada L'));
    await clickNext();
    await expectStep('prefs');
    await act(async () => setField('newsletter', 'weekly'));

    // Wander back to step 0 and edit it.
    await clickPrev();
    await expectStep('billing');
    await clickPrev();
    await expectStep('account');
    await act(async () => setField('email', 'fresh@b.com'));
    await waitFor(() => expect(screen.getByTestId('input-email')).toHaveValue('fresh@b.com'));

    // …and walk forward to the end.
    await clickNext();
    await expectStep('billing');
    await clickNext();
    await expectStep('prefs');
    await clickNext();
    await expectStep('confirm');
    await act(async () => setField('signature', 'Ada'));

    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];
    expect(payload).toEqual({
      account: { email: 'fresh@b.com', plan: 'pro' },
      billing: { cardName: 'Ada L' },
      prefs: { newsletter: 'weekly' },
      confirm: { signature: 'Ada' },
    });
  });

  it('F3: a step whose visibility is revoked while we stand on it evacuates us to a visible step', async () => {
    renderFlow(buildFlow());

    await fillAccount('a@b.com', 'pro');
    await clickNext();
    await expectStep('billing');

    // Jump back to account and flip plan to free — billing (where we came from)
    // becomes hidden. Then jump forward: we must never land on it.
    await clickPrev();
    await expectStep('account');
    await act(async () => setField('plan', 'free'));
    await waitFor(() => expect(screen.getByTestId('visible-count')).toHaveTextContent('3'));

    await act(async () => fireEvent.click(screen.getByTestId('goto-1')));
    await expectStep('account');
    expect(screen.getByTestId('visible-idx')).toHaveTextContent('0');
  });
});
