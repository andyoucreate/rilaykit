/**
 * =============================================================================
 * COMPLEX E2E — Multi-step workflow × persistence (save/restore/remount) ×
 * repeatables × conditional steps × cross-step prefill.
 *
 * ONE 5-step flow exercised across many intersecting scenarios:
 *
 *   0. profile     (always)  name + plan select; after-handler prefills the
 *                            NEXT step's teamName from the entered name.
 *   1. team        (plan ∈ {team, enterprise})  teamName + repeatable members.
 *   2. enterprise  (plan === enterprise)         seats.
 *   3. notes       (always)  comment.
 *   4. review      (always, last)  signature.
 *
 * Under test: data survival across forward/back navigation and step re-entry;
 * full unmount/remount restore (index, data, repeatable rows, USER-REORDERED
 * order, visited/passed); reorder persistence and non-resurrection of removed
 * rows; conditional visibility + skip; completion payload excluding hidden
 * steps; completion clearing persisted data; prefill interacting with the
 * hidden-step filter.
 * =============================================================================
 */
import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { LocalStorageAdapter, flow } from '@rilaykit/workflow';
import { FlowBody, WorkflowProvider, useFlow, useFlowData } from '@rilaykit/workflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import {
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
  RepeatableControls,
} from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

const WORKFLOW_ID = 'onboarding';
const STORAGE_KEY = `rilay_workflow_${WORKFLOW_ID}`;

const rilConfig = ril
  .create()
  .component('text', { name: 'Text', renderer: MockTextInput, defaultProps: { label: '' } })
  .component('number', { name: 'Number', renderer: MockNumberInput, defaultProps: { label: '' } })
  .component('select', {
    name: 'Select',
    renderer: MockSelectInput,
    defaultProps: { label: '', options: [] },
  });

// ============================================================================
// FORM CONFIGS (freshly built per flow so no state leaks across tests)
// ============================================================================

function buildForms() {
  const profileForm = form
    .create(rilConfig, 'profile-form')
    .add({ id: 'name', type: 'text', props: { label: 'Name' } })
    .add({
      id: 'plan',
      type: 'select',
      props: {
        label: 'Plan',
        options: [
          { value: '', label: 'Select...' },
          { value: 'free', label: 'Free' },
          { value: 'team', label: 'Team' },
          { value: 'enterprise', label: 'Enterprise' },
        ],
      },
    })
    .build();

  const teamForm = form
    .create(rilConfig, 'team-form')
    .add({ id: 'teamName', type: 'text', props: { label: 'Team Name' } })
    .addRepeatable('members', (r) =>
      r
        .add({ id: 'memberName', type: 'text', props: { label: 'Member' } })
        .add({ id: 'level', type: 'number', props: { label: 'Level' } })
        .min(1)
        .defaultValue({ memberName: '', level: 1 })
    )
    .build();

  const enterpriseForm = form
    .create(rilConfig, 'enterprise-form')
    .add({ id: 'seats', type: 'number', props: { label: 'Seats' } })
    .build();

  const notesForm = form
    .create(rilConfig, 'notes-form')
    .add({ id: 'comment', type: 'text', props: { label: 'Comment' } })
    .build();

  const reviewForm = form
    .create(rilConfig, 'review-form')
    .add({ id: 'signature', type: 'text', props: { label: 'Signature' } })
    .build();

  return { profileForm, teamForm, enterpriseForm, notesForm, reviewForm };
}

function buildFlow({ persist }: { persist?: LocalStorageAdapter } = {}) {
  const { profileForm, teamForm, enterpriseForm, notesForm, reviewForm } = buildForms();

  const builder = flow
    .create(rilConfig, WORKFLOW_ID, 'Onboarding')
    .addStep({
      id: 'profile',
      title: 'Profile',
      formConfig: profileForm,
      // Prefill the NEXT config step (team) from this step's data. `team` may be
      // hidden (plan === free), so this deliberately writes into a possibly
      // hidden slice — exercising the prefill × hidden-step-filter interaction.
      onAfterValidation: (values, helper) => {
        helper.setNextStepFields({ teamName: `Team of ${values.name}` });
      },
    })
    .addStep({
      id: 'team',
      title: 'Team',
      formConfig: teamForm,
      conditions: { visible: when('plan').in(['team', 'enterprise']).build() },
    })
    .addStep({
      id: 'enterprise',
      title: 'Enterprise',
      formConfig: enterpriseForm,
      conditions: { visible: when('plan').equals('enterprise').build() },
    })
    .addStep({ id: 'notes', title: 'Notes', formConfig: notesForm })
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

// ============================================================================
// PROBES / HELPERS
// ============================================================================

function StateProbe() {
  const { workflowState, currentStep } = useFlow();
  const allData = useFlowData();
  return (
    <div>
      <span data-testid="cur-idx">{workflowState.currentStepIndex}</span>
      <span data-testid="cur-id">{currentStep?.id}</span>
      <span data-testid="visited">{Array.from(workflowState.visitedSteps).sort().join(',')}</span>
      <span data-testid="passed">{Array.from(workflowState.passedSteps).sort().join(',')}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

function StepVisibilityProbe({ stepCount }: { stepCount: number }) {
  const { conditionsHelpers } = useFlow();
  return (
    <div>
      {Array.from({ length: stepCount }, (_, i) => (
        <span key={i} data-testid={`visible-${i}`}>
          {conditionsHelpers.isStepVisible(i) ? 'true' : 'false'}
        </span>
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
      <RepeatableControls repeatableId="members" />
      <StateProbe />
      <StepVisibilityProbe stepCount={5} />
    </WorkflowProvider>
  );
}

function readPersisted(): Record<string, any> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).data : null;
}

function allData(): Record<string, any> {
  return JSON.parse(screen.getByTestId('all-data').textContent || '{}');
}

/** Member `memberName` input values, in DOM (row) order. */
function memberNamesInOrder(): string[] {
  return Array.from(document.querySelectorAll('input'))
    .filter((el) =>
      /^input-members\[[^\]]+\]\.memberName$/.test(el.getAttribute('data-testid') || '')
    )
    .map((el) => (el as HTMLInputElement).value);
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
async function addMember() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('repeatable-append-members'));
  });
}
function setField(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

async function selectPlanAndName(name: string, plan: string) {
  await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());
  setField('input-name', name);
  setField('input-plan', plan);
  await waitFor(() => {
    expect(screen.getByTestId('input-name')).toHaveValue(name);
    expect(screen.getByTestId('input-plan')).toHaveValue(plan);
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('COMPLEX — workflow persistence × repeatables × conditional × prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // GROUP A — navigation / step re-entry (no persistence, no remount)
  // --------------------------------------------------------------------------

  it('A1: preserves step-1 + repeatable rows (values + order) across forward/back re-entry', async () => {
    renderFlow(buildFlow());

    await selectPlanAndName('Alice', 'team');
    await clickNext(); // profile -> team

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    // Prefill from profile.after-handler landed on team.teamName
    await waitFor(() => expect(screen.getByTestId('input-teamName')).toHaveValue('Team of Alice'));

    // min=1 -> one default member row
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('1')
    );
    setField('input-members[k0].memberName', 'Ann');
    setField('input-members[k0].level', '2');

    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');
    setField('input-members[k1].level', '3');

    await waitFor(() => {
      expect(screen.getByTestId('input-members[k0].memberName')).toHaveValue('Ann');
      expect(screen.getByTestId('input-members[k1].memberName')).toHaveValue('Bob');
    });

    // team -> notes (enterprise hidden for plan=team)
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));

    // notes -> team (back; skips hidden enterprise)
    await clickPrev();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    // Everything survives re-entry: values, count, order
    await waitFor(() => {
      expect(screen.getByTestId('input-teamName')).toHaveValue('Team of Alice');
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2');
      expect(screen.getByTestId('input-members[k0].memberName')).toHaveValue('Ann');
      expect(screen.getByTestId('input-members[k0].level')).toHaveValue(2);
      expect(screen.getByTestId('input-members[k1].memberName')).toHaveValue('Bob');
      expect(screen.getByTestId('input-members[k1].level')).toHaveValue(3);
    });
    expect(memberNamesInOrder()).toEqual(['Ann', 'Bob']);
  });

  it('A2: a user reorder of repeatable rows survives step re-entry', async () => {
    renderFlow(buildFlow());

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    setField('input-members[k0].memberName', 'Ann');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('3')
    );
    setField('input-members[k2].memberName', 'Carol');

    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Bob', 'Carol']));

    // Move Carol (index 2) up -> Ann, Carol, Bob
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-move-up-members-2'));
    });
    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Carol', 'Bob']));

    // Leave and return
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    await clickPrev();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    // Reordered order survives re-entry (not insertion order)
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('3')
    );
    expect(memberNamesInOrder()).toEqual(['Ann', 'Carol', 'Bob']);
  });

  it('A3: a removed repeatable row does not resurrect on step re-entry', async () => {
    renderFlow(buildFlow());

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    setField('input-members[k0].memberName', 'Ann');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');

    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Bob']));

    // Remove Ann (k0)
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-remove-members-k0'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('1')
    );
    expect(memberNamesInOrder()).toEqual(['Bob']);

    // Re-enter
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    await clickPrev();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('1')
    );
    expect(memberNamesInOrder()).toEqual(['Bob']);
    // The removed row's composite key is gone from the store slice
    const team = allData().team ?? {};
    expect(team['members[k0].memberName']).toBeUndefined();
    expect(team['members[k1].memberName']).toBe('Bob');
  });

  // --------------------------------------------------------------------------
  // GROUP B — persistence: unmount / remount (simulate reload)
  // --------------------------------------------------------------------------

  it('B1: unmount/remount restores current step index, all step data and visited/passed', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await selectPlanAndName('Zed', 'enterprise');
    await clickNext(); // -> team
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    setField('input-members[k0].memberName', 'Ann');
    setField('input-members[k0].level', '4');

    await clickNext(); // -> enterprise (visible for enterprise)
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('enterprise'));
    setField('input-seats', '50');
    await waitFor(() => expect(screen.getByTestId('input-seats')).toHaveValue(50));

    await clickNext(); // -> notes
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    setField('input-comment', 'hello');

    // Wait for autosave to flush the final state (index 3, notes filled)
    await waitFor(() => {
      const p = readPersisted();
      expect(p?.currentStepIndex).toBe(3);
      expect(p?.allData?.notes?.comment).toBe('hello');
    });

    // Snapshot what was actually persisted so we can assert the remount restores
    // it faithfully. NOTE: the library never records the INITIAL step (index 0,
    // `profile`) as visited — only forward-nav targets are marked — so the saved
    // visited set is {team, enterprise, notes}. That is consistent behavior, not
    // a persistence defect; the round trip must reproduce it exactly.
    const persistedBefore = readPersisted()!;
    const savedVisited = [...persistedBefore.visitedSteps].sort();
    const savedPassed = [...persistedBefore.passedSteps].sort();
    expect(savedVisited).toContain('team');
    expect(savedVisited).toContain('enterprise');
    expect(savedVisited).toContain('notes');

    unmount();

    // Remount with a fresh config (same storage key) — simulate reload
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('3');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('notes');
    });

    // Restored form value
    await waitFor(() => expect(screen.getByTestId('input-comment')).toHaveValue('hello'));

    // Restored cross-step data
    const data = allData();
    expect(data.profile).toEqual(expect.objectContaining({ name: 'Zed', plan: 'enterprise' }));
    expect(data.team?.teamName).toBe('Team of Zed');
    expect(data.team?.['members[k0].memberName']).toBe('Ann');
    expect(data.enterprise?.seats).toBe(50);
    expect(data.notes?.comment).toBe('hello');

    // Visited + passed restored EXACTLY as persisted (round-trip fidelity)
    expect(
      (screen.getByTestId('visited').textContent || '').split(',').filter(Boolean).sort()
    ).toEqual(savedVisited);
    expect(
      (screen.getByTestId('passed').textContent || '').split(',').filter(Boolean).sort()
    ).toEqual(savedPassed);
    // The steps the user passed through forward are all present
    expect(savedPassed).toContain('team');
    expect(savedPassed).toContain('enterprise');
  });

  it('B2: a user reorder of repeatable rows survives unmount/remount (not insertion order)', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    setField('input-members[k0].memberName', 'Ann');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('3')
    );
    setField('input-members[k2].memberName', 'Carol');

    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Bob', 'Carol']));
    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-move-up-members-2'));
    });
    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Carol', 'Bob']));

    // The reordered key order is captured in persisted repeatableOrders
    await waitFor(() => {
      const p = readPersisted();
      expect(p?.repeatableOrders?.team?.members).toEqual(['k0', 'k2', 'k1']);
    });

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    // Remount lands back on the team step and rehydrates the reordered rows
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('3')
    );
    expect(memberNamesInOrder()).toEqual(['Ann', 'Carol', 'Bob']);
  });

  it('B3: a removed repeatable row does not resurrect after unmount/remount', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));

    setField('input-members[k0].memberName', 'Ann');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');
    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Ann', 'Bob']));

    await act(async () => {
      fireEvent.click(screen.getByTestId('repeatable-remove-members-k0'));
    });
    await waitFor(() => expect(memberNamesInOrder()).toEqual(['Bob']));

    // Persisted slice no longer carries the removed row
    await waitFor(() => {
      const p = readPersisted();
      expect(p?.allData?.team?.['members[k0].memberName']).toBeUndefined();
      expect(p?.allData?.team?.['members[k1].memberName']).toBe('Bob');
    });

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('1')
    );
    expect(memberNamesInOrder()).toEqual(['Bob']);
  });

  // --------------------------------------------------------------------------
  // GROUP C — conditional visibility, skip, completion payload
  // --------------------------------------------------------------------------

  it('C1: free plan hides team + enterprise; next skips straight to notes', async () => {
    renderFlow(buildFlow());

    await selectPlanAndName('Free User', 'free');

    await waitFor(() => {
      expect(screen.getByTestId('visible-1')).toHaveTextContent('false'); // team
      expect(screen.getByTestId('visible-2')).toHaveTextContent('false'); // enterprise
    });

    await clickNext(); // profile -> notes (skips 1 and 2)
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
  });

  it('C2: free-plan completion payload excludes hidden (team + enterprise) step data', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await selectPlanAndName('Free User', 'free');
    await clickNext(); // -> notes
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    setField('input-comment', 'no team needed');

    await clickNext(); // -> review
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Freddy');
    await waitFor(() => expect(screen.getByTestId('input-signature')).toHaveValue('Freddy'));

    await clickNext(); // complete
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];
    expect(payload.profile).toEqual(expect.objectContaining({ name: 'Free User', plan: 'free' }));
    expect(payload.notes).toEqual(expect.objectContaining({ comment: 'no team needed' }));
    expect(payload.review).toEqual(expect.objectContaining({ signature: 'Freddy' }));
    // Hidden steps must NOT appear — including the prefilled team.teamName
    expect(payload.team).toBeUndefined();
    expect(payload.enterprise).toBeUndefined();
  });

  it('C3: team-plan completion includes team (members array) but excludes enterprise', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    setField('input-members[k0].memberName', 'Ann');
    setField('input-members[k0].level', '2');
    await addMember();
    await waitFor(() =>
      expect(screen.getByTestId('repeatable-count-members')).toHaveTextContent('2')
    );
    setField('input-members[k1].memberName', 'Bob');
    setField('input-members[k1].level', '3');

    await clickNext(); // -> notes (enterprise hidden)
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    setField('input-comment', 'go team');

    await clickNext(); // -> review
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Al');

    await clickNext(); // complete
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];
    expect(payload.enterprise).toBeUndefined();
    expect(payload.team?.teamName).toBe('Team of Alice');
    expect(Array.isArray(payload.team?.members)).toBe(true);
    expect(payload.team.members).toEqual([
      { memberName: 'Ann', level: 2 },
      { memberName: 'Bob', level: 3 },
    ]);
    // No flat composite keys leaked
    expect(Object.keys(payload.team).filter((k) => k.includes('['))).toHaveLength(0);
  });

  it('C4: enterprise-plan completion includes every visible step', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await selectPlanAndName('Zed', 'enterprise');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    setField('input-members[k0].memberName', 'Ann');
    setField('input-members[k0].level', '1');

    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('enterprise'));
    setField('input-seats', '99');

    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    setField('input-comment', 'big co');

    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Z');

    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0];
    expect(payload.profile?.plan).toBe('enterprise');
    expect(payload.team?.members).toEqual([{ memberName: 'Ann', level: 1 }]);
    expect(payload.enterprise?.seats).toBe(99);
    expect(payload.notes?.comment).toBe('big co');
    expect(payload.review?.signature).toBe('Z');
  });

  // --------------------------------------------------------------------------
  // GROUP D — completion clears persisted data
  // --------------------------------------------------------------------------

  it('D1: completing the workflow clears persisted data; a fresh mount starts empty', async () => {
    const onComplete = vi.fn();
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }), {
      onComplete,
    });

    await selectPlanAndName('Alice', 'team');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    setField('input-members[k0].memberName', 'Ann');

    // Something got persisted mid-flow
    await waitFor(() => expect(readPersisted()).not.toBeNull());

    await clickNext(); // -> notes
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));
    setField('input-comment', 'x');
    await clickNext(); // -> review
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 'Al');
    await clickNext(); // complete
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Persisted data cleared on genuine completion, and stays cleared
    await waitFor(() => expect(readPersisted()).toBeNull());

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    // Fresh mount: no resurrection of the finished workflow
    await waitFor(() => {
      expect(screen.getByTestId('cur-idx')).toHaveTextContent('0');
      expect(screen.getByTestId('cur-id')).toHaveTextContent('profile');
    });
    expect(screen.getByTestId('input-name')).toHaveValue('');
    expect(readPersisted()).toBeNull();
  });

  // --------------------------------------------------------------------------
  // GROUP E — cross-step prefill × hidden-step filter
  // --------------------------------------------------------------------------

  it('E1: prefill writes into a hidden step slice yet is excluded from completion', async () => {
    const onComplete = vi.fn();
    renderFlow(buildFlow(), { onComplete });

    await selectPlanAndName('Ghost', 'free');
    await clickNext(); // profile -> notes; after-handler wrote team.teamName (hidden)
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('notes'));

    // The prefill DID land in the internal store slice for the hidden team step
    expect(allData().team?.teamName).toBe('Team of Ghost');

    // ...but completing excludes it
    setField('input-comment', 'c');
    await clickNext();
    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('review'));
    setField('input-signature', 's');
    await clickNext();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    expect(onComplete.mock.calls[0][0].team).toBeUndefined();
  });

  it('E2: a prefilled visible field survives unmount/remount', async () => {
    const { unmount } = renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await selectPlanAndName('Alice', 'team');
    await clickNext(); // -> team, teamName prefilled
    await waitFor(() => expect(screen.getByTestId('input-teamName')).toHaveValue('Team of Alice'));

    await waitFor(() => expect(readPersisted()?.allData?.team?.teamName).toBe('Team of Alice'));

    unmount();
    renderFlow(buildFlow({ persist: new LocalStorageAdapter() }));

    await waitFor(() => expect(screen.getByTestId('cur-id')).toHaveTextContent('team'));
    await waitFor(() => expect(screen.getByTestId('input-teamName')).toHaveValue('Team of Alice'));
  });
});
