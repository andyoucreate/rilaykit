import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowStore } from '../../src';
import { flow } from '../../src/builders/flow';
import { FlowBody, WorkflowProvider, useFlow, useFlowStoreApi } from '../../src/react';

/**
 * FLOW-1 — a default that arrives WITH the recompile.
 *
 * An agent re-emits the same flow tool call with an ADDED step whose form
 * declares a `default`. The recompiled `defaultValues` reach `WorkflowProvider`
 * as a NEW prop — but the store was created ONCE, at mount, from the
 * `defaultValues` captured THEN. A live seam existed for the STEPS (`stepsRef`
 * + `_reconcileStepSet`) and none for the defaults, so the born step's field
 * rendered `""` and the completion payload carried `contact: {}` instead of
 * the declared default.
 *
 * THE ORACLE IS PARITY: a fresh mount of the same complete flow schema
 * prefills correctly, so a flow that reached the same schema by a recompile
 * must be indistinguishable from it — the same sentence the born/mounted
 * differential in `store-enforces-step-identity.test.tsx` pins for the step
 * set, extended to the defaults that travel with it.
 */

const catalog = ril.create().component('text', {
  name: 'Text',
  renderer: ({ id, field }) => (
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  ),
});

const PREFILLED = 'pre@fill.ed';
const TYPED = 'user@typed.io';

/** The recompiled defaults — the added step's form declares `email`'s default. */
const CONTACT_DEFAULTS = { contact: { email: PREFILLED } };

function buildFlow(includeContact: boolean) {
  const base = flow.create(catalog, 'wf', 'Signup').addStep({
    id: 'intro',
    title: 'Intro',
    formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
  });
  if (!includeContact) return base.build();
  return base
    .addStep({
      id: 'contact',
      title: 'Contact',
      formConfig: form
        .create(catalog, 'contact-form')
        .add({ id: 'email', type: 'text', props: {} }),
    })
    .build();
}

let capturedStore: WorkflowStore | undefined;

function Harness() {
  const { goNext, currentStep, submitWorkflow, resetWorkflow } = useFlow();
  capturedStore = useFlowStoreApi();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <button type="button" data-testid="reset" onClick={() => resetWorkflow()}>
        reset
      </button>
      <button type="button" data-testid="submit-flow" onClick={() => submitWorkflow()}>
        submit
      </button>
      <FlowBody />
    </div>
  );
}

interface TreeProps {
  readonly config: ReturnType<typeof buildFlow>;
  readonly defaults: Record<string, unknown>;
  readonly onComplete: (data: Record<string, unknown>) => void;
}

function tree({ config, defaults, onComplete }: TreeProps) {
  return (
    <WorkflowProvider
      workflowConfig={config}
      defaultValues={defaults}
      onWorkflowComplete={onComplete}
    >
      <Harness />
    </WorkflowProvider>
  );
}

describe('a step born by a recompile arrives WITH its declared defaults', () => {
  it('prefills the born step and carries the default into the completion payload', async () => {
    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(false), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    // The re-emit: the same flow, recompiled with the added step AND the
    // defaults its form declares. No action runs — this is the whole event.
    rerender(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('contact'));

    // The field renders the declared default — as a fresh mount would.
    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe(PREFILLED);

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.contact).toEqual({ email: PREFILLED });
  });

  it('matches the fresh-mount parity oracle exactly', async () => {
    // The oracle arm: the SAME complete schema, mounted rather than recompiled
    // into. Whatever it answers is what the born arm above must answer.
    const onComplete = vi.fn();
    render(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('contact'));
    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe(PREFILLED);

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect((onComplete.mock.calls[0][0] as Record<string, unknown>).contact).toEqual({
      email: PREFILLED,
    });
  });

  it('a late default never overwrites a value the user already typed', async () => {
    // Both steps live from the start, no default declared yet. The user types
    // into the field FIRST; the default for it arrives on a later re-emit.
    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(true), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('contact'));
    fireEvent.change(screen.getByTestId('email'), { target: { value: TYPED } });

    rerender(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));

    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe(TYPED);

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect((onComplete.mock.calls[0][0] as Record<string, unknown>).contact).toEqual({
      email: TYPED,
    });
  });

  it('re-emitting the same defaults after the user typed changes nothing', async () => {
    // The agent re-emits the SAME tool call once more, after the user replaced
    // the prefilled value. The default is already in the baseline, so the
    // re-emit is a no-op — not a re-seed.
    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(false), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));
    rerender(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));

    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('contact'));
    await waitFor(() =>
      expect((screen.getByTestId('email') as HTMLInputElement).value).toBe(PREFILLED)
    );
    fireEvent.change(screen.getByTestId('email'), { target: { value: TYPED } });

    rerender(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));

    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe(TYPED);
  });

  it('the workflow-echo path stays blocked: a held field admits no late default', async () => {
    // A host that echoes captured values back through `defaultValues` — or
    // declares a default for a field the user already wrote — is naming a key
    // the step's slice already HOLDS. Nothing is admitted: the input keeps the
    // user's value, and the baseline does not absorb the key while the value
    // is held, so the user's own work can never masquerade as the flow's
    // defaults.
    const onComplete = vi.fn();
    const { rerender } = render(
      tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete })
    );
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    fireEvent.change(screen.getByTestId('who'), { target: { value: 'Ada' } });

    // The echo, in its strongest form: a CONFLICTING value for the held key.
    rerender(
      tree({
        config: buildFlow(true),
        defaults: { ...CONTACT_DEFAULTS, intro: { who: 'Bob' } },
        onComplete,
      })
    );

    expect((screen.getByTestId('who') as HTMLInputElement).value).toBe('Ada');
    const store = capturedStore as WorkflowStore;
    expect(store.getState()._defaultValues).toEqual(CONTACT_DEFAULTS);
    expect(store.getState().allData.intro).toEqual({ who: 'Ada' });
  });

  it('reset() under a live defaults prop restores what a fresh mount of that prop would', async () => {
    // The parity oracle decides the reset-after-echo edge too: once the slate
    // is cleared, the store cannot (and must not pretend to) distinguish a
    // host's declared default from an echoed one — a fresh mount handed the
    // same prop would seed `who: 'Bob'`, so a reset under it does the same.
    // What it must NOT do is resurrect the user's own 'Ada'.
    const onComplete = vi.fn();
    const { rerender } = render(
      tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete })
    );
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));
    fireEvent.change(screen.getByTestId('who'), { target: { value: 'Ada' } });
    rerender(
      tree({
        config: buildFlow(true),
        defaults: { ...CONTACT_DEFAULTS, intro: { who: 'Bob' } },
        onComplete,
      })
    );

    fireEvent.click(screen.getByTestId('reset'));

    await waitFor(() => expect((screen.getByTestId('who') as HTMLInputElement).value).toBe('Bob'));
    const store = capturedStore as WorkflowStore;
    expect(store.getState().allData.intro).toEqual({ who: 'Bob' });
  });

  it('reset() after the recompile re-seeds the born step from its late default', async () => {
    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(false), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));
    rerender(tree({ config: buildFlow(true), defaults: CONTACT_DEFAULTS, onComplete }));

    fireEvent.click(screen.getByTestId('reset'));

    const store = capturedStore as WorkflowStore;
    await waitFor(() => expect(store.getState().allData.contact).toEqual({ email: PREFILLED }));
  });

  it('a born repeatable default is seeded in the store internal flat shape', async () => {
    // The flat-shape invariant does not bend for the late-default path: an
    // authored array admitted by the reconciliation must land as flat
    // composite keys, or the user could never delete the rows it planted.
    const withRepeatable = flow
      .create(catalog, 'wf', 'Signup')
      .addStep({
        id: 'intro',
        title: 'Intro',
        formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
      })
      .addStep({
        id: 'items',
        title: 'Items',
        formConfig: form
          .create(catalog, 'items-form')
          .addRepeatable('lines', (rb) => rb.add({ id: 'label', type: 'text', props: {} })),
      })
      .build();

    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(false), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    rerender(
      tree({
        config: withRepeatable,
        defaults: { items: { lines: [{ label: 'alpha' }, { label: 'beta' }] } },
        onComplete,
      })
    );

    const store = capturedStore as WorkflowStore;
    expect(store.getState().allData.items).toEqual({
      'lines[k0].label': 'alpha',
      'lines[k1].label': 'beta',
    });
  });

  it('a genuine cross-step recompile leaks no values between steps', async () => {
    // The mutation-check scenario: a FILLED step, a navigation, then the step
    // set moves. The admitted defaults land in THEIR OWN step's slice and
    // nowhere else; the filled slices are untouched.
    const threeSteps = flow
      .create(catalog, 'wf', 'Signup')
      .addStep({
        id: 'intro',
        title: 'Intro',
        formConfig: form.create(catalog, 'intro-form').add({ id: 'who', type: 'text', props: {} }),
      })
      .addStep({
        id: 'contact',
        title: 'Contact',
        formConfig: form
          .create(catalog, 'contact-form')
          .add({ id: 'email', type: 'text', props: {} }),
      })
      .addStep({
        id: 'extra',
        title: 'Extra',
        formConfig: form.create(catalog, 'extra-form').add({ id: 'note', type: 'text', props: {} }),
      })
      .build();

    const onComplete = vi.fn();
    const { rerender } = render(tree({ config: buildFlow(true), defaults: {}, onComplete }));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('intro'));

    fireEvent.change(screen.getByTestId('who'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByTestId('next'));
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('contact'));
    fireEvent.change(screen.getByTestId('email'), { target: { value: TYPED } });

    rerender(
      tree({ config: threeSteps, defaults: { extra: { note: 'from-default' } }, onComplete })
    );

    fireEvent.click(screen.getByTestId('submit-flow'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const payload = onComplete.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({
      intro: { who: 'Ada' },
      contact: { email: TYPED },
      extra: { note: 'from-default' },
    });
  });
});
