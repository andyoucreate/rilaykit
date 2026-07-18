/**
 * =============================================================================
 * COMPLEX E2E — Completion payload is a PURE PROJECTION of answers.
 *
 * A 4-step flow:
 *   0. account (always)          email (text)
 *   1. extras  (skippable)       note (text)          <- the skippable middle
 *   2. secret  (visible=false)   token (text)         <- never visible
 *   3. confirm (always, last)    signature (text)
 *
 * Contract under test (spec #3):
 *  - A SKIPPED step is ABSENT from the completion payload — one encoding of
 *    "no answer", same as a never-visible step. It does NOT ship seeded {}.
 *  - `onComplete(data, meta)` gains a second arg with ordered
 *    `{ visitedSteps, skippedSteps, passedSteps }` derived from the store Sets.
 *  - Skip a step, then navigate BACK onto it, fill it, and proceed (passing it):
 *    it is NO LONGER skipped — it ships in the payload and leaves
 *    `meta.skippedSteps`.
 *  - A hidden step stays absent (regression guard for the existing behaviour).
 *  - Persistence roundtrip: a skip survives save/reload — the reloaded skipped
 *    step still drops from the payload and stays in `meta.skippedSteps`.
 * =============================================================================
 */
import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';
import type { PersistedWorkflowData, WorkflowPersistenceAdapter } from '@rilaykit/workflow';
import { FlowBody, WorkflowProvider, useFlow } from '@rilaykit/workflow/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton, SkipButton } from '../_setup/nav-buttons';
import { MockTextInput } from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

const rilConfig = ril.create().component('text', {
  name: 'Text',
  renderer: MockTextInput,
  defaultProps: { label: '' },
});

function buildFlow() {
  const accountForm = form
    .create(rilConfig, 'account-form')
    .add({ id: 'email', type: 'text', props: { label: 'Email' } })
    .build();

  const extrasForm = form
    .create(rilConfig, 'extras-form')
    .add({ id: 'note', type: 'text', props: { label: 'Note' } })
    .build();

  const secretForm = form
    .create(rilConfig, 'secret-form')
    .add({ id: 'token', type: 'text', props: { label: 'Token' } })
    .build();

  const confirmForm = form
    .create(rilConfig, 'confirm-form')
    .add({ id: 'signature', type: 'text', props: { label: 'Signature' } })
    .build();

  return flow
    .create(rilConfig, 'projection-flow', 'Projection Flow', 'payload = answers only')
    .addStep({ id: 'account', title: 'Account', formConfig: accountForm })
    .addStep({ id: 'extras', title: 'Extras', formConfig: extrasForm, allowSkip: true })
    .addStep({
      id: 'secret',
      title: 'Secret',
      formConfig: secretForm,
      // Never visible: `showSecret` is never set, so this step is unreachable.
      conditions: { visible: when('showSecret').equals('yes').build() },
    })
    .addStep({ id: 'confirm', title: 'Confirm', formConfig: confirmForm })
    .build();
}

// ============================================================================
// PROBES / HELPERS
// ============================================================================

function SkippedProbe() {
  const { workflowState } = useFlow();
  const ids = workflowState.skippedSteps ? Array.from(workflowState.skippedSteps).sort() : [];
  return <span data-testid="skipped">{ids.length ? ids.join(',') : '<none>'}</span>;
}

function PersistNowButton() {
  const { persistNow } = useFlow();
  return (
    <button type="button" data-testid="persist-now" onClick={() => void persistNow?.()}>
      persist
    </button>
  );
}

type CompletionMeta = {
  visitedSteps: string[];
  skippedSteps: string[];
  passedSteps: string[];
};

function renderFlow(
  workflowConfig: ReturnType<typeof buildFlow>,
  onComplete: (data: Record<string, unknown>, meta: CompletionMeta) => void
) {
  return render(
    <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onComplete}>
      <FlowBody />
      <NextButton />
      <PrevButton />
      <SkipButton />
      <PersistNowButton />
      <SkippedProbe />
    </WorkflowProvider>
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
async function clickSkip() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('skip-btn'));
  });
}
function setField(id: string, value: string) {
  fireEvent.change(screen.getByTestId(`input-${id}`), { target: { value } });
}
async function expectStep(id: string) {
  await waitFor(() => expect(screen.getByTestId(`input-${id}`)).toBeInTheDocument());
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — completion payload projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it('P1: a skipped step is ABSENT from the payload; meta carries the lifecycle sets', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await expectStep('email');
    await act(async () => setField('email', 'a@b.com'));
    await clickNext();

    await expectStep('note');
    // Skip the extras step entirely — never touch `note`.
    await clickSkip();

    // `secret` is hidden, so skip lands directly on `confirm`.
    await expectStep('signature');
    await act(async () => setField('signature', 'Ada'));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [data, meta] = onComplete.mock.calls[0] as [Record<string, unknown>, CompletionMeta];

    // The answered steps ARE present with the real answers.
    expect(data.account).toEqual({ email: 'a@b.com' });
    expect(data.confirm).toEqual({ signature: 'Ada' });
    // The skipped step is ABSENT — not a seeded {}.
    expect(data.extras).toBeUndefined();
    // The never-visible step is ABSENT too.
    expect(data.secret).toBeUndefined();

    // meta: ordered lifecycle sets from the store. The initial step is never
    // marked visited (nothing navigates INTO index 0) — the store's existing
    // semantics; `visitedSteps` tracks the steps navigation lands on.
    expect(meta.skippedSteps).toEqual(['extras']);
    expect(meta.visitedSteps).toEqual(['extras', 'confirm']);
    expect(meta.passedSteps).toEqual(['account']);
  });

  it('P2: skip -> back -> fill -> next un-skips the step; it ships and leaves meta.skippedSteps', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), onComplete);

    await expectStep('email');
    await act(async () => setField('email', 'a@b.com'));
    await clickNext();

    await expectStep('note');
    await clickSkip();
    await expectStep('signature');

    // The live skipped set reflects the skip.
    await waitFor(() => expect(screen.getByTestId('skipped')).toHaveTextContent('extras'));

    // Navigate BACK onto the skipped step and fill it.
    await clickPrev();
    await expectStep('note');
    await act(async () => setField('note', 'hello'));
    await clickNext();

    // Passing the step clears it from the skipped set.
    await expectStep('signature');
    await waitFor(() => expect(screen.getByTestId('skipped')).toHaveTextContent('<none>'));

    await act(async () => setField('signature', 'Ada'));
    await clickNext();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const [data, meta] = onComplete.mock.calls[0] as [Record<string, unknown>, CompletionMeta];

    // The (now answered) step ships its answer.
    expect(data.extras).toEqual({ note: 'hello' });
    expect(meta.skippedSteps).toEqual([]);
    expect(meta.passedSteps).toEqual(['account', 'extras']);
  });

  it('P3: persistence roundtrip — a skip survives save/reload and still drops from the payload', async () => {
    // A single in-memory record shared by the save (session 1) and the load
    // (session 2 remount), so the roundtrip goes through the real serializer.
    let record: PersistedWorkflowData | null = null;
    const adapter: WorkflowPersistenceAdapter = {
      save: vi.fn(async (_key, data) => {
        record = data;
      }),
      load: vi.fn(async () => record),
      remove: vi.fn(async () => {
        record = null;
      }),
      exists: vi.fn(async () => record !== null),
    };

    const persistedConfig = { ...buildFlow(), persistence: { adapter } };

    // -- Session 1: skip `extras`, then persist. --
    const onComplete1 = vi.fn();
    const first = renderFlow(persistedConfig, onComplete1);

    await expectStep('email');
    await act(async () => setField('email', 'a@b.com'));
    await clickNext();
    await expectStep('note');
    await clickSkip();
    await expectStep('signature');

    await act(async () => {
      fireEvent.click(screen.getByTestId('persist-now'));
    });
    await waitFor(() => expect(adapter.save).toHaveBeenCalled());
    expect(record).not.toBeNull();
    // The snapshot carries the skipped set.
    expect((record as PersistedWorkflowData).skippedSteps).toEqual(['extras']);

    first.unmount();

    // -- Session 2: remount, load restores the skip, then complete. --
    const onComplete2 = vi.fn();
    renderFlow(persistedConfig, onComplete2);

    // Restored onto the confirm step with the skip intact.
    await expectStep('signature');
    await waitFor(() => expect(screen.getByTestId('skipped')).toHaveTextContent('extras'));

    await act(async () => setField('signature', 'Ada'));
    await clickNext();

    await waitFor(() => expect(onComplete2).toHaveBeenCalledTimes(1));
    const [data, meta] = onComplete2.mock.calls[0] as [Record<string, unknown>, CompletionMeta];

    // The reloaded skipped step still drops from the payload.
    expect(data.extras).toBeUndefined();
    expect(meta.skippedSteps).toEqual(['extras']);
  });
});
