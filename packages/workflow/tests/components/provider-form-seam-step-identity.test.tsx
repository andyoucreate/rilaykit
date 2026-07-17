import { custom, ril } from '@rilaykit/core';
import type { FormStore, FormStoreState } from '@rilaykit/forms';
import { form } from '@rilaykit/forms';
import { useFormStoreApi } from '@rilaykit/forms/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';

/**
 * THE PROVIDER↔FORM SEAM — and the enumeration of ITS class.
 *
 * The class, stated once: `WorkflowProvider` mounts a form for the current step,
 * and the form it mounts DOES NOT KNOW WHICH STEP IT IS. `FormProvider` resets
 * on STRUCTURAL identity — `buildConfigSignature` is `[formConfig.id, field
 * shapes, repeatable shapes]` — so two steps whose forms share an id and a shape
 * are, to the form layer, ONE form. Navigating between them is not a form change
 * and nothing resets. Every piece of state that form carries is then step
 * alpha's state, presented as step xray's.
 *
 * This is the same shape as the nine step-identity bugs closed in the STORE, one
 * layer out: state keyed off a step identity that the code holding it never
 * receives. The store's class died when the enumeration was DERIVED AT RUNTIME
 * from a real store instead of listed by hand. This does the same for the seam.
 *
 * Sharing a form id across steps is LEGITIMATE — see `buildSharedFormFlow`. The
 * fix is therefore in the mount path, not a ban at the door: `FormProvider` gains
 * an `instanceId`, the workflow passes the step id, and a step change becomes a
 * form swap through the reset `FormProvider` ALREADY runs for a shape change.
 *
 * WHAT THIS DOES NOT ACHIEVE — REVISED, and the revision is the point.
 *
 * This used to read: the swap is honoured by `formStore._reset`, which names the
 * members it clears BY HAND, so "no form state survives a step crossing" is
 * PROVED TODAY and a member added tomorrow without a matching `_reset` line will
 * cross. That was not a latent risk. It had ALREADY HAPPENED, in this file's
 * blind spot: `_fieldConditions` had no line in the hand-list, so a step whose
 * field declared no conditions inherited the previous step's `visible: false`
 * and rendered nothing — an unfillable step. This enumeration missed it because
 * it derives its members from what a USER AUTHORS, and conditions are written by
 * the provider, not by the user. See `provider-form-seam-engines`, which diffs a
 * MOUNTED step against a NAVIGATED one across every member and so has no such
 * blind spot.
 *
 * `_reset` has since been INVERTED: it is built from `createInitialFormData()`,
 * the one definition of a pristine form, and preserves only the two members it
 * names with a reason. Reset is now the DEFAULT and preserve is OPT-IN, so a
 * member added to `FormStoreState` tomorrow fails to compile until it is given a
 * birth value, and is then reset for free. That much is UNREPRESENTABLE rather
 * than proved-today.
 *
 * (The alternative — folding the step id into `WorkflowProvider`'s
 * `formProviderKey` so the crossing REMOUNTS — would be unrepresentable, since a
 * fresh store has nothing to leak. It was tried and rejected: `children` renders
 * inside the FormProvider, so it remounts the host's entire subtree on every
 * navigation. See the note at that key.)
 */

const catalog = ril.create().component('text', {
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur?.()}
    />
  ),
});

const ALPHA = 'step-alpha';
const XRAY = 'step-xray';

/**
 * TWO STEPS, ONE FORM ID, ONE SHAPE — and that is LEGAL INPUT.
 *
 * Nothing in this library says form ids are unique within a flow, and that is
 * not an oversight:
 *   - `flow.build()` and `validateFlowSchema` enforce STEP id uniqueness and are
 *     silent on form ids;
 *   - a form id is used for exactly two things — `buildConfigSignature` and
 *     `useFormMonitoring`'s metric labels. It is NEVER a key into workflow data,
 *     which is keyed by STEP id throughout;
 *   - `form.create(catalog)` AUTO-GENERATES a random id, so an id is a label a
 *     host opts into, not a coordinate the library allocates;
 *   - reusing one built form at two points of a flow — `const f = form.create(
 *     catalog, 'contact')`, handed to two `addStep` calls — is an obvious and
 *     supported authoring move that produces exactly this config.
 *
 * So this flow is not a mistake to be rejected; it is input the mount path owes
 * correct behaviour.
 */
function buildSharedFormFlow() {
  const sharedForm = () =>
    form.create(catalog, 'shared-form').add({
      id: 'note',
      type: 'text',
      props: {},
      // Empty is VALID, a short non-empty value is not: an untouched step must
      // be submittable (that is the whole point of the submit repro below),
      // while `workTheForm` can still drive a REAL validation failure so the
      // enumeration sees `errors`/`validationStates` populated.
      validation: {
        validate: custom(
          (value: unknown) => String(value ?? '') === '' || String(value).length >= 4,
          'too short'
        ),
      },
    });

  return flow
    .create(catalog, 'wf', 'Notes')
    .addStep({ id: ALPHA, title: 'Alpha', formConfig: sharedForm() })
    .addStep({ id: XRAY, title: 'Xray', formConfig: sharedForm() })
    .build();
}

// =================================================================
// THE HARNESS — REAL PROVIDER, REAL STORES, REAL NAVIGATION
// =================================================================

/**
 * The form store the CURRENT step's form is mounted against, captured from
 * inside the form subtree — the only place it exists. Never mocked: this is the
 * real store `FormProvider` built for whichever step is on screen.
 */
function FormStoreProbe({ onStore }: { onStore: (store: FormStore) => void }) {
  const store = useFormStoreApi();
  onStore(store);
  return null;
}

function SeamHarness({ onStore }: { onStore: (store: FormStore) => void }) {
  const { goNext, currentStep } = useFlow();
  return (
    <div>
      <span data-testid="current-step">{currentStep?.id ?? 'none'}</span>
      <button type="button" data-testid="go-next" onClick={() => void goNext()}>
        next
      </button>
      <FlowBody />
      <FormStoreProbe onStore={onStore} />
    </div>
  );
}

interface Seam {
  /** State of the form store mounted for the step currently on screen. */
  readonly formState: () => FormStoreState;
  readonly goToXray: () => Promise<void>;
}

function renderSeam(onWorkflowComplete?: (data: unknown) => void): Seam {
  let store: FormStore | null = null;
  render(
    <WorkflowProvider
      workflowConfig={buildSharedFormFlow()}
      onWorkflowComplete={onWorkflowComplete}
    >
      <SeamHarness
        onStore={(s) => {
          store = s;
        }}
      />
    </WorkflowProvider>
  );
  return {
    formState: () => {
      if (!store) throw new Error('form store never mounted');
      return store.getState();
    },
    goToXray: async () => {
      fireEvent.click(screen.getByTestId('go-next'));
      await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe(XRAY));
    },
  };
}

// =================================================================
// THE REPRO — A STEP CHANGE IS NOT A FORM CHANGE
// =================================================================

describe('THE REPRO — the form mounted for a step is a form OF that step', () => {
  it('xray does not show the value the user typed into alpha', async () => {
    const seam = renderSeam();

    fireEvent.change(screen.getByTestId('note'), { target: { value: 'SECRET-alpha' } });
    expect((screen.getByTestId('note') as HTMLInputElement).value).toBe('SECRET-alpha');

    await seam.goToXray();

    // Xray is a DIFFERENT step. Its form has never been filled.
    expect((screen.getByTestId('note') as HTMLInputElement).value).toBe('');
  });

  it('submitting xray does not write alphas value into xrays slice', async () => {
    const onWorkflowComplete = vi.fn();
    const seam = renderSeam(onWorkflowComplete);

    fireEvent.change(screen.getByTestId('note'), { target: { value: 'SECRET-alpha' } });
    await seam.goToXray();

    // The user submits xray WITHOUT TOUCHING IT. `WorkflowProvider.handleSubmit`
    // writes the form's values into `currentStep.id`'s slice — so alpha's value
    // is about to be copied into xray. That is the leak with a payload attached.
    const form = document.querySelector('form');
    if (!form) throw new Error('no form mounted');
    fireEvent.submit(form);
    await waitFor(() => expect(onWorkflowComplete).toHaveBeenCalledTimes(1));

    const payload = onWorkflowComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(payload[ALPHA]).toEqual({ note: 'SECRET-alpha' });
    expect(payload[XRAY]).toEqual({});
  });
});

// =================================================================
// THE ENUMERATION — EVERY PIECE OF FORM STATE THAT CROSSES THE SEAM
// =================================================================

/** Data members of a real form store's state — actions are not state. */
function dataMembers(state: FormStoreState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function')
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as object).sort();
  const bKeys = Object.keys(b as object).sort();
  if (aKeys.length !== bKeys.length) return false;
  if (aKeys.some((key, index) => key !== bKeys[index])) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

/**
 * DERIVED FROM A REAL STORE, NOT LISTED BY HAND.
 *
 * A hand-written list of "the form state that belongs to a step" is a comment
 * with a test runner attached: it goes stale the moment someone adds the next
 * member, which is precisely the event this enumeration exists to catch. So the
 * list is computed at runtime by DIFFING a real form store against itself —
 * pristine at mount, versus after a user has worked the form on step alpha.
 *
 * Every member that differs is, by construction, state THIS STEP'S USER
 * AUTHORED. A member added tomorrow that interaction touches joins the list
 * automatically and is asserted on without anyone remembering to.
 */
function stepAuthoredMembers(
  pristine: Record<string, unknown>,
  worked: Record<string, unknown>
): string[] {
  return Object.keys(worked)
    .filter((key) => !deepEqual(pristine[key], worked[key]))
    .sort();
}

/**
 * Work the form the way a user does — every door that writes form-side state:
 * typing (values, isDirty), blurring (touched), and failing validation (errors,
 * validationStates, isValid). Real events through the real renderer; no store
 * pokes.
 */
async function workTheForm(): Promise<void> {
  const input = screen.getByTestId('note');
  fireEvent.change(input, { target: { value: 'no' } });
  fireEvent.blur(input);
  // `no` is shorter than 4 — a real validation failure, through the real path.
  await waitFor(() => expect(screen.getByTestId('note')).toBeTruthy());
}

describe('THE ENUMERATION — no form state authored on alpha survives the crossing', () => {
  it('the derivation finds the members it is meant to guard', async () => {
    const seam = renderSeam();
    const pristine = dataMembers(seam.formState());
    await workTheForm();
    const worked = dataMembers(seam.formState());

    const authored = stepAuthoredMembers(pristine, worked);

    // A guard on the guard: if working the form stopped dirtying anything, the
    // enumeration below would pass vacuously forever. It must find real state.
    expect(authored.length).toBeGreaterThan(0);
    // What alpha's user authored, exactly — recorded so a change to the set is
    // a decision someone makes, not a silent drift.
    expect(authored).toEqual([
      'errors',
      'isDirty',
      'isValid',
      'touched',
      'validationStates',
      'values',
    ]);
  });

  it('every member alphas user authored is back to pristine on xray', async () => {
    const seam = renderSeam();
    const pristine = dataMembers(seam.formState());

    await workTheForm();
    const worked = dataMembers(seam.formState());
    const authored = stepAuthoredMembers(pristine, worked);

    await seam.goToXray();
    const onXray = dataMembers(seam.formState());

    // Both steps' forms are shape-identical and default-free, so alpha's
    // pristine state IS what a fresh mount of xray's form holds. Every member
    // alpha's user authored must read as that fresh mount — not as alpha's.
    //
    // Named first as a SET, so one run reports every member that crossed rather
    // than only the first the loop trips on.
    const leaked = authored.filter((member) => !deepEqual(onXray[member], pristine[member]));
    expect(leaked).toEqual([]);

    for (const member of authored) {
      expect({ member, value: onXray[member] }).toEqual({ member, value: pristine[member] });
    }
  });
});
