import { type ComponentRenderContext, onChange, ril, when } from '@rilaykit/core';
import type { FormStore } from '@rilaykit/forms';
import { form } from '@rilaykit/forms';
import { useFormStoreApi } from '@rilaykit/forms/react';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow } from '../../src/react';

/**
 * THE PROVIDER↔FORM SEAM, PART TWO — THE CARRIERS THAT ARE NOT THE STORE.
 *
 * The store half of this seam is swept by `provider-form-seam-step-identity`:
 * `instanceId` tells `FormProvider` WHICH step it is mounted for, and a step
 * crossing goes through the reset the provider already runs. That test derives
 * its member list from a real store, so a member added to `FormStoreState`
 * tomorrow is caught without anyone remembering to.
 *
 * But the seam carries more than a store, and that sweep had a blind spot on
 * both counts.
 *
 * It carries ENGINES — the effect engine (a live store subscription plus
 * in-flight async aborts), the validation layer (in-flight runs), a pending
 * debounce, an in-flight submit. An engine has no enumerable state to diff, so a
 * hand-written list of "engine state that belongs to a step" would be the
 * comment-with-a-test-runner this campaign keeps killing. They are proved
 * BEHAVIOURALLY instead, with the differential that found the store bugs: A STEP
 * THAT WAS MOUNTED AND A STEP THAT WAS NAVIGATED TO MUST BE INDISTINGUISHABLE.
 * Each carrier below is asserted against a flow whose FIRST step is xray (alpha
 * never existed, so that is what xray IS) and against a flow navigated
 * alpha→xray. Any divergence is, by construction, something alpha left behind.
 *
 * The invariant they all failed: ANYTHING BELOW `FormProvider` THAT HOLDS WORK
 * OUTLIVING A RENDER MUST KEY ON `configSignature`. It is the only value in the
 * provider that knows a swap happened — `formConfig` cannot stand in, because two
 * steps may be handed the same BUILT config and it is then reference-identical
 * across the crossing. That is exactly the trap `instanceId` was invented for,
 * and every carrier here fell into it independently.
 *
 * And the store half had a blind spot of its own: its enumeration derives from
 * what a USER AUTHORS, so it never saw `_fieldConditions` — written by the
 * provider, absent from `_reset`'s hand-list, and leaking a `visible: false`
 * across the seam that made a step unfillable. CARRIER 5 is that one, it needs
 * no async whatsoever, and the whole-store differential at the bottom is the
 * enumeration that has no such blind spot: it diffs a MOUNTED xray against a
 * NAVIGATED one across EVERY member, derived at runtime from a real store.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
  renderer: ({ id, field }: ComponentRenderContext) => (
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

/** A promise the test resolves by hand, so "in flight" is a state, not a race. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let every queued microtask (and the React work they schedule) drain. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// =================================================================
// HARNESS — REAL PROVIDER, REAL STORES, REAL NAVIGATION
// =================================================================

/**
 * The form store the CURRENT step's form is mounted against, captured from
 * inside the form subtree — the only place it exists. Never mocked.
 */
function FormStoreProbe({ onStore }: { onStore: (store: FormStore) => void }) {
  const store = useFormStoreApi();
  onStore(store);
  return null;
}

function Harness({ onStore }: { onStore: (store: FormStore) => void }) {
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
  /** Live state of the form store mounted for whichever step is on screen. */
  readonly formState: () => Record<string, unknown>;
  readonly goToXray: () => Promise<void>;
}

function renderSeam(workflowConfig: any): Seam {
  let store: FormStore | null = null;
  render(
    <WorkflowProvider workflowConfig={workflowConfig}>
      <Harness
        onStore={(s) => {
          store = s;
        }}
      />
    </WorkflowProvider>
  );
  return {
    formState: () => {
      if (!store) throw new Error('form store never mounted');
      return store.getState() as unknown as Record<string, unknown>;
    },
    goToXray: async () => {
      fireEvent.click(screen.getByTestId('go-next'));
      await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe(XRAY));
    },
  };
}

// =================================================================
// CARRIER 1 — IN-FLIGHT ASYNC VALIDATION
// =================================================================

/**
 * A validator that never settles on its own: the test decides when alpha's run
 * comes back — after the user has already left alpha. That is the ordinary
 * shape of a uniqueness check or any server-side rule.
 */
function gatedSchema(gate: Promise<void>): StandardSchemaV1<unknown> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async (value: unknown) => {
        await gate;
        return String(value ?? '').length >= 4
          ? { value }
          : { issues: [{ message: 'ALPHA-VERDICT' }] };
      },
    },
  };
}

/**
 * Two steps, each with its OWN form — different form ids, different shapes, one
 * shared field NAME. Nothing exotic: it is the most ordinary flow there is, two
 * steps that both happen to call a field `note`. Field ids are not unique across
 * a flow and were never meant to be — workflow data is keyed by STEP id, and a
 * step's fields are its own.
 */
function buildGatedFlow(gate: Promise<void>) {
  return flow
    .create(catalog, 'wf', 'Notes')
    .addStep({
      id: ALPHA,
      title: 'Alpha',
      formConfig: form
        .create(catalog, 'alpha-form')
        .add({ id: 'note', type: 'text', validation: { validate: gatedSchema(gate) } })
        .add({ id: 'alpha-only', type: 'text' }),
    })
    .addStep({
      id: XRAY,
      title: 'Xray',
      formConfig: form.create(catalog, 'xray-form').add({ id: 'note', type: 'text' }),
    })
    .build();
}

describe('CARRIER 1 — an async validation run belongs to the step that started it', () => {
  it('MOUNTED BASELINE: xrays note carries no errors and no validation state', async () => {
    const gate = deferred();
    // Start the flow ON xray: alpha never ran, so this is what xray IS.
    const seam = renderSeam(buildGatedFlow(gate.promise));
    await seam.goToXray();
    await settle();

    expect(seam.formState().errors).toEqual({});
    expect(seam.formState().validationStates).toEqual({});
    expect(seam.formState().isValid).toBe(true);
  });

  it('NAVIGATED: alphas in-flight verdict does not land on xrays field of the same id', async () => {
    const gate = deferred();
    const seam = renderSeam(buildGatedFlow(gate.promise));

    // The user types a value alpha's validator will reject and blurs — a real
    // validation run is now in flight — then leaves before it answers.
    fireEvent.change(screen.getByTestId('note'), { target: { value: 'no' } });
    fireEvent.blur(screen.getByTestId('note'));

    // GUARD ON THE REPRO: without this, `fireEvent.change` alone triggers no
    // validation at all (a field validates on change only once touched), the
    // run below is never in flight, and everything after passes vacuously.
    await waitFor(() =>
      expect((seam.formState().validationStates as Record<string, unknown>).note).toBe('validating')
    );

    await seam.goToXray();

    // xray's `note` is untouched, and xray's form declares NO validation on it.
    expect((screen.getByTestId('note') as HTMLInputElement).value).toBe('');

    // Alpha's verdict comes back. It was computed for a field that is no longer
    // mounted, from a value that is no longer anywhere. It must be dropped.
    gate.resolve();
    await settle();

    expect(seam.formState().errors).toEqual({});
    expect(seam.formState().validationStates).toEqual({});
    expect(seam.formState().isValid).toBe(true);
  });
});

// =================================================================
// CARRIER 2 — THE EFFECT ENGINE
// =================================================================

/**
 * ONE BUILT FORM, TWO STEPS — and that is typed, documented input.
 *
 * `StepDefinition.formConfig` is `FormConfiguration | form`, and
 * `resolveFormConfig` only calls `.build()` on the BUILDER arm. Hand the same
 * BUILT config to two `addStep` calls and both steps share one object — so
 * `formConfig.effectsMap` is reference-identical across the crossing, and the
 * effect engine's `useEffect`, keyed on exactly that reference, never fires.
 * The engine mounted for alpha is still running, still subscribed, and still
 * holding alpha's in-flight aborts when xray is on screen.
 */
function buildSharedConfigFlow(gate: Promise<void>) {
  const shared = form
    .create(catalog, 'shared-form')
    .add({
      id: 'note',
      type: 'text',
      effects: [
        onChange('note', async (value, { setValue }) => {
          await gate;
          setValue('derived', `derived-from:${String(value)}`);
        }),
      ],
    })
    .add({ id: 'derived', type: 'text' })
    .build();

  return flow
    .create(catalog, 'wf', 'Notes')
    .addStep({ id: ALPHA, title: 'Alpha', formConfig: shared })
    .addStep({ id: XRAY, title: 'Xray', formConfig: shared })
    .build();
}

describe('CARRIER 2 — an effect engine belongs to the step it was started for', () => {
  it('MOUNTED BASELINE: xrays derived field is empty when alpha never ran', async () => {
    const gate = deferred();
    const seam = renderSeam(buildSharedConfigFlow(gate.promise));
    await seam.goToXray();
    gate.resolve();
    await settle();

    expect((seam.formState().values as Record<string, unknown>).derived).toBeUndefined();
  });

  it('NAVIGATED: alphas in-flight effect does not write its result into xray', async () => {
    const gate = deferred();
    const seam = renderSeam(buildSharedConfigFlow(gate.promise));

    // Alpha's user types; the effect fires and awaits a remote lookup.
    fireEvent.change(screen.getByTestId('note'), { target: { value: 'SECRET-alpha' } });
    await seam.goToXray();

    // The lookup returns after the user has left. The engine that started it was
    // alpha's; its write must not reach xray.
    gate.resolve();
    await settle();

    expect((seam.formState().values as Record<string, unknown>).derived).toBeUndefined();
  });
});

// =================================================================
// CARRIER 3 — AN IN-FLIGHT SUBMIT
// =================================================================

/**
 * Alpha validates against a gate; xray's `note` is REQUIRED and starts empty, so
 * xray must never pass a submit of its own while untouched. If the flow
 * completes here, it completed without xray's validation ever running.
 */
function buildSubmitFlow(gate: Promise<void>) {
  return flow
    .create(catalog, 'wf', 'Notes')
    .addStep({
      id: ALPHA,
      title: 'Alpha',
      formConfig: form
        .create(catalog, 'alpha-form')
        .add({ id: 'note', type: 'text', validation: { validate: gatedSchema(gate) } }),
    })
    .addStep({
      id: XRAY,
      title: 'Xray',
      formConfig: form.create(catalog, 'xray-form').add({
        id: 'note',
        type: 'text',
        validation: {
          validate: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: (value: unknown) =>
                String(value ?? '').length > 0 ? { value } : { issues: [{ message: 'required' }] },
            },
          } satisfies StandardSchemaV1<unknown>,
        },
      }),
    })
    .build();
}

function renderSubmitSeam(gate: Promise<void>, onWorkflowComplete: (data: unknown) => void) {
  render(
    <WorkflowProvider
      workflowConfig={buildSubmitFlow(gate)}
      onWorkflowComplete={onWorkflowComplete}
    >
      <Probe />
    </WorkflowProvider>
  );
}

function Probe() {
  const { goNext, currentStep } = useFlow();
  return (
    <div>
      <span data-testid="current-step">{currentStep?.id ?? 'none'}</span>
      <button type="button" data-testid="go-next" onClick={() => void goNext()}>
        next
      </button>
      <FlowBody />
    </div>
  );
}

describe('CARRIER 3 — a submit belongs to the step it was started on', () => {
  it('MOUNTED BASELINE: an untouched xray cannot complete the flow — its note is required', async () => {
    const gate = deferred();
    const onWorkflowComplete = vi.fn();
    renderSubmitSeam(gate.promise, onWorkflowComplete);
    gate.resolve();

    fireEvent.click(screen.getByTestId('go-next'));
    await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe(XRAY));

    // Submitting xray while empty must fail its own validation.
    const formEl = document.querySelector('form');
    if (!formEl) throw new Error('no form mounted');
    fireEvent.submit(formEl);
    await settle();

    expect(onWorkflowComplete).not.toHaveBeenCalled();
  });

  it('NAVIGATED: a submit started on alpha does not complete the flow from xray', async () => {
    const gate = deferred();
    const onWorkflowComplete = vi.fn();
    renderSubmitSeam(gate.promise, onWorkflowComplete);

    // The user submits alpha. Its validator is a slow remote check, so the
    // submit parks mid-flight, holding a `validateForm` promise.
    fireEvent.change(screen.getByTestId('note'), { target: { value: 'SECRET-alpha' } });
    const formEl = document.querySelector('form');
    if (!formEl) throw new Error('no form mounted');
    fireEvent.submit(formEl);
    await act(async () => {
      await Promise.resolve();
    });

    // GUARD ON THE REPRO: the submit must really be parked, or everything below
    // passes for the wrong reason.
    expect(onWorkflowComplete).not.toHaveBeenCalled();

    // Impatient, the user clicks Next instead of waiting.
    fireEvent.click(screen.getByTestId('go-next'));
    await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe(XRAY));

    // Alpha's check finally answers. `useFormSubmissionWithStore` resumes,
    // reads the store — now xray's — and calls `onSubmitRef.current`, which is
    // whatever handler is CURRENT: xray's. `WorkflowProvider.handleSubmit` then
    // sees `isLastStep` and ships the whole flow to the host's backend.
    //
    // Nobody submitted xray. Xray's `note` is required and empty, and its
    // validation never ran — the run that "passed" was alpha's.
    gate.resolve();
    await settle();

    expect(onWorkflowComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('current-step').textContent).toBe(XRAY);
  });
});

// =================================================================
// CARRIER 4 — A PENDING DEBOUNCED VALIDATION
// =================================================================

describe('CARRIER 4 — a pending debounced run belongs to the form that scheduled it', () => {
  it('NAVIGATED: alphas pending debounced run does not judge alphas text on xray', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gate = deferred();
      const seam = renderSeam(buildDifferentialFlow(gate.promise, true));

      const input = screen.getByTestId('note');
      fireEvent.change(input, { target: { value: 'SECRET-alpha' } });
      fireEvent.blur(input);
      // Touched now, so this change schedules a debounced run 500ms out.
      fireEvent.change(input, { target: { value: 'SECRET-alpha-2' } });

      // GUARD ON THE REPRO: the run must still be PENDING when we leave, or the
      // test proves nothing.
      expect((seam.formState().values as Record<string, unknown>).note).toBe('SECRET-alpha-2');

      await seam.goToXray();
      gate.resolve();
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await settle();

      // The timer, if it survives, calls `validateField('note', 'SECRET-alpha-2')`
      // — passing ALPHA's text EXPLICITLY. That is not a stale run any
      // generation check can recognise: it is a brand-new run, started on xray,
      // under xray's current generation, carrying a value from a form that no
      // longer exists. Xray's validator duly rejects it and the error lands on a
      // field the user is looking at empty.
      expect((seam.formState().values as Record<string, unknown>).note).toBeUndefined();
      expect(seam.formState().errors).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});

// =================================================================
// CARRIER 5 — STORED FIELD CONDITIONS
// =================================================================

/**
 * The one that needs no async at all, and the one that says the `_reset`
 * hand-list was never merely a latent risk.
 *
 * `_fieldConditions` is a `FormStoreState` member with no line in `_reset`, so it
 * survived every reset and therefore every form swap. It is re-synced from the
 * mounted config on each render — but ONLY for fields that DECLARE conditions
 * (`useFormConditions` indexes `field.conditions`, skipping fields without any).
 * A field that declares none is never written, so it keeps whatever the previous
 * step's field of the same id stored.
 */
function buildConditionFlow() {
  return flow
    .create(catalog, 'wf', 'Notes')
    .addStep({
      id: ALPHA,
      title: 'Alpha',
      formConfig: form
        .create(catalog, 'alpha-form')
        .add({ id: 'toggle', type: 'text' })
        // Hidden until `toggle` is 'yes' — so it starts hidden, and `visible:
        // false` is what lands in the store.
        .add({ id: 'note', type: 'text', conditions: { visible: when('toggle').equals('yes') } }),
    })
    .addStep({
      id: XRAY,
      title: 'Xray',
      // Xray's `note` declares NO conditions: it is unconditionally visible.
      formConfig: form.create(catalog, 'xray-form').add({ id: 'note', type: 'text' }),
    })
    .build();
}

describe('CARRIER 5 — a stored field condition belongs to the step that declared it', () => {
  it('NAVIGATED: xrays unconditional field is visible, not hidden by alphas condition', async () => {
    const seam = renderSeam(buildConditionFlow());

    // GUARD ON THE REPRO: alpha's `note` must really be hidden, or there is no
    // `visible: false` in the store to leak and this proves nothing.
    expect(screen.queryByTestId('note')).toBeNull();

    await seam.goToXray();
    await settle();

    // Xray's `note` declares no conditions whatsoever. It must render. Without
    // this, the user lands on a step whose only field simply is not there, and
    // the flow cannot be completed.
    expect(screen.queryByTestId('note')).not.toBeNull();
    expect((seam.formState()._fieldConditions as Record<string, unknown>).note).toBeUndefined();
  });
});

// =================================================================
// THE TRIPWIRE — MOUNTED vs NAVIGATED, OVER EVERY STORE MEMBER
// =================================================================

/**
 * THE ENUMERATION THE ENGINES CAN ACTUALLY HAVE.
 *
 * The three carriers above are hand-picked properties, and hand-picked
 * properties are what this campaign keeps burying: they cover the leak someone
 * already thought of. An engine has no state to enumerate — but it has nowhere
 * to leak TO except the form store. Every observable thing the effect engine,
 * the validation layer, a pending debounce or an in-flight submit can do ends up
 * as a WRITE INTO A STORE MEMBER. So the members are enumerated at runtime from
 * a real store, and mounted-xray is diffed against navigated-xray across all of
 * them at once.
 *
 * That is the differential stated as a total function of the store rather than
 * as a list of properties: a carrier added tomorrow, leaking through a door
 * nobody has thought of yet, is caught as long as it writes ANY member.
 *
 * What this still does not derive is the DOORS — `workAlphaThroughEveryDoor`
 * below is a hand-list, and a future door that starts in-flight work joins it
 * only if someone remembers. That is the honest ceiling here, and it is named at
 * the door itself.
 */
function buildDifferentialFlow(gate: Promise<void>, includeAlpha: boolean) {
  const xrayStep = {
    id: XRAY,
    title: 'Xray',
    formConfig: form.create(catalog, 'xray-form').add({
      id: 'note',
      type: 'text',
      // Rejects exactly what alpha's user types, so any run that crosses the
      // seam carrying alpha's text lands a REAL error on xray's empty field.
      validation: {
        validate: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: unknown) =>
              String(value ?? '').includes('SECRET')
                ? { issues: [{ message: 'ALPHA-TEXT-JUDGED-BY-XRAY' }] }
                : { value },
          },
        } satisfies StandardSchemaV1<unknown>,
      },
    }),
  };

  const builder = flow.create(catalog, 'wf', 'Notes');
  if (!includeAlpha) return builder.addStep(xrayStep).build();

  return builder
    .addStep({
      id: ALPHA,
      title: 'Alpha',
      formConfig: form.create(catalog, 'alpha-form').add({
        id: 'note',
        type: 'text',
        validation: {
          validate: gatedSchema(gate),
          // Alpha's user leaves a DEBOUNCED run pending as well as an in-flight
          // one: the two leak by different routes and only one of them is stale.
          debounceMs: 500,
        },
      }),
    })
    .addStep(xrayStep)
    .build();
}

/**
 * Every door on alpha that starts work capable of outliving alpha. HAND-LISTED —
 * see the note above; this is the part of the tripwire that can go stale.
 */
async function workAlphaThroughEveryDoor(): Promise<void> {
  const input = screen.getByTestId('note');
  // Type + blur: values, isDirty, touched — and a validation run in flight,
  // parked on the gate.
  fireEvent.change(input, { target: { value: 'SECRET-alpha' } });
  fireEvent.blur(input);
  // Type again, now touched: schedules a DEBOUNCED run that has not fired yet.
  fireEvent.change(input, { target: { value: 'SECRET-alpha-2' } });
  // Submit: parks on the same gate, holding a `validateForm` promise.
  const formEl = document.querySelector('form');
  if (!formEl) throw new Error('no form mounted');
  fireEvent.submit(formEl);
  await act(async () => {
    await Promise.resolve();
  });
}

/** Data members of a real form store's state — actions are not state. */
function dataMembers(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function')
  );
}

describe('THE TRIPWIRE — a mounted xray and a navigated xray are indistinguishable', () => {
  it('every member of xrays store reads the same whether or not alpha ever ran', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // MOUNTED: a flow whose FIRST step is xray. Alpha never existed, so this
      // is what xray IS, by definition.
      const mountedGate = deferred();
      const mounted = renderSeam(buildDifferentialFlow(mountedGate.promise, false));
      mountedGate.resolve();
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await settle();
      const mountedState = dataMembers(mounted.formState());
      cleanup();

      // NAVIGATED: the same xray, reached across a worked alpha.
      const navGate = deferred();
      const navigated = renderSeam(buildDifferentialFlow(navGate.promise, true));
      await workAlphaThroughEveryDoor();

      // GUARD ON THE REPRO: alpha must really be holding live work, or the
      // comparison below proves nothing at all.
      expect(dataMembers(navigated.formState()).values).toEqual({ note: 'SECRET-alpha-2' });

      await navigated.goToXray();

      // Everything alpha left in flight now lands: the debounce timer fires and
      // the gated runs answer — all of it while xray is on screen.
      navGate.resolve();
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await settle();
      const navigatedState = dataMembers(navigated.formState());

      // Named as a SET first, so one run reports EVERY member that crossed
      // rather than only the first the comparison trips on.
      const memberNames = Array.from(
        new Set([...Object.keys(mountedState), ...Object.keys(navigatedState)])
      ).sort();
      // A guard on the guard: a store that reported no members would make this
      // vacuous forever.
      expect(memberNames.length).toBeGreaterThan(0);

      const leaked = memberNames.filter(
        (member) => JSON.stringify(navigatedState[member]) !== JSON.stringify(mountedState[member])
      );
      expect(leaked).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
