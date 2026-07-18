/**
 * =============================================================================
 * COMPLEX E2E — LIFECYCLE / RESOURCE-LEAK HUNT.
 *
 * The failure mode a long-lived SPA hits after navigating in and out of forms
 * and flows hundreds of times: a resource allocated for a mounted component
 * (a `setTimeout`, an `AbortController`, a `store.subscribe`) that is never
 * released when the component unmounts, so it fires/writes/accumulates against
 * a torn-down tree.
 *
 * The contract under test everywhere here: AFTER UNMOUNT, nothing fires,
 * nothing writes, nothing warns, nothing accumulates.
 *
 * Every asserted cleanup contract is traced to source BEFORE it is asserted:
 *
 *   - FormField debounce timer .................. FormField.tsx:126-134
 *       cleanup-only useEffect clears `debounceTimerRef` on unmount.  → CLEAN
 *   - Effect-engine abort controllers ........... effect-engine.ts:222-233 (stop)
 *       FormProvider.tsx:1099-1102 calls engine.stop() in the effect cleanup;
 *       setValue guards on `aborted || stopped` (effect-engine.ts:352).  → CLEAN
 *   - In-flight field validation ................ useFormValidationWithStore.ts
 *       no mounted-guard, but writes only to the (now unsubscribed) store.  → HARMLESS
 *   - FormProvider store subscriptions .......... FormProvider.tsx:1129/1166/1184
 *       every subscribe returns its unsubscribe as the effect cleanup.  → CLEAN
 *   - usePersistence debounced save timer ....... usePersistence.ts:185-195, 302-331
 *       debounce `setTimeout` is cancelled ONLY in clearPersistedData
 *       (usePersistence.ts:272). There is NO unmount cleanup, so a pending
 *       auto-save fires AFTER unmount → adapter.save() on a dead hook.  → LEAK
 *
 * The one LEAK is pinned by a single, clearly-marked failing `it` at the end of
 * the persistence block; everything else asserts the cleanup that DOES exist.
 * =============================================================================
 */
import { onChange } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { FormBody, FormProvider, useFormStoreApi } from '@rilaykit/forms/react';
import type { WorkflowPersistenceAdapter } from '@rilaykit/workflow';
import { flow } from '@rilaykit/workflow';
import { FlowBody, WorkflowProvider } from '@rilaykit/workflow/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextButton, PrevButton } from '../_setup/nav-buttons';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// SHARED SETUP
// ============================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

// A React lifecycle warning (state update on an unmounted component, or an
// update not wrapped in act) is exactly what a leak makes React emit. We fail
// on those regardless of any library-level logging.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

function reactLifecycleWarnings(): string[] {
  const all = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls];
  return all
    .map((args) => args.map(String).join(' '))
    .filter(
      (msg) =>
        msg.includes('unmounted component') ||
        msg.includes('not wrapped in act') ||
        msg.includes("can't perform a React state update") ||
        msg.includes('memory leak')
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createTestRilConfig();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A deferred whose resolution the test drives — deterministic async ordering. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Captures the live form store so we can inspect it AFTER the tree unmounts. */
let capturedStore: ReturnType<typeof useFormStoreApi> | null = null;
function StoreProbe() {
  capturedStore = useFormStoreApi();
  return null;
}

/** A Standard Schema validator whose `validate` is a spy the test can inspect. */
function makeSpyValidator(impl: (v: unknown) => unknown = (v) => ({ value: v })) {
  const validate = vi.fn(async (value: unknown) => impl(value));
  const schema = { '~standard': { version: 1 as const, vendor: 'test', validate } };
  return { schema, validate };
}

/** A Standard Schema validator whose resolution the test drives manually. */
function makeControllableValidator() {
  const calls: { value: unknown; resolve: (issues?: { message: string }[]) => void }[] = [];
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: (value: unknown) =>
        new Promise<{ issues?: { message: string }[]; value?: unknown }>((res) => {
          calls.push({ value, resolve: (issues) => res(issues ? { issues } : { value }) });
        }),
    },
  };
  return { schema, calls };
}

/** In-memory persistence adapter with spied methods (fresh store, no data). */
function makeSpyAdapter(): WorkflowPersistenceAdapter & { save: ReturnType<typeof vi.fn> } {
  const backing = new Map<string, unknown>();
  return {
    save: vi.fn(async (key: string, data: unknown) => {
      backing.set(key, data);
    }),
    load: vi.fn(async (key: string) => (backing.get(key) ?? null) as never),
    remove: vi.fn(async (key: string) => {
      backing.delete(key);
    }),
    exists: vi.fn(async (key: string) => backing.has(key)),
  };
}

// ============================================================================
// 1. FormField debounced validation timer cleared on unmount
//    Source: FormField.tsx:105 (debounceTimerRef) + 126-134 (cleanup effect).
// ============================================================================

describe('LEAK — FormField debounced validation timer on unmount', () => {
  function buildDebouncedForm(validateSchema: unknown, debounceMs: number) {
    return form
      .create(rilConfig, 'debounce-form')
      .setValidation({ mode: 'onChange' })
      .add({
        id: 'q',
        type: 'text',
        props: { label: 'Q' },
        validation: { validate: validateSchema as never, debounceMs },
      })
      .build();
  }

  it('1a: unmount before the debounce fires — validator never runs, no late write, no warning', async () => {
    const { schema, validate } = makeSpyValidator();

    const { unmount } = render(
      <FormProvider formConfig={buildDebouncedForm(schema, 120)}>
        <FormBody />
      </FormProvider>
    );

    // Type — this schedules the debounced validation (120ms) but does NOT run it.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-q'), { target: { value: 'abc' } });
    });
    expect(validate).not.toHaveBeenCalled();

    // Unmount BEFORE the timer fires. FormField's cleanup effect must clear it.
    unmount();

    // Give the (now-cleared) timer well past its deadline to prove it never runs.
    await wait(220);

    expect(validate).not.toHaveBeenCalled();
    expect(reactLifecycleWarnings()).toEqual([]);
  });

  it('1b: the pending debounce timer id is passed to clearTimeout on unmount', async () => {
    const { schema } = makeSpyValidator();

    // Track the id the debounce schedules (delay 90) and every clearTimeout id.
    const scheduled: number[] = [];
    const cleared: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const setSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: never, delay?: number, ...rest: never[]) => {
        const id = (realSetTimeout as never as typeof setTimeout)(fn, delay, ...rest);
        if (delay === 90) scheduled.push(id as unknown as number);
        return id as never;
      });
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id?: never) => {
      if (id !== undefined) cleared.push(id as unknown as number);
      return (realClearTimeout as never as typeof clearTimeout)(id);
    });

    try {
      const { unmount } = render(
        <FormProvider formConfig={buildDebouncedForm(schema, 90)}>
          <FormBody />
        </FormProvider>
      );

      await act(async () => {
        fireEvent.change(screen.getByTestId('input-q'), { target: { value: 'x' } });
      });
      expect(scheduled).toHaveLength(1);
      const debounceId = scheduled[0];

      unmount();

      // The exact pending debounce timer must have been cleared by the cleanup.
      expect(cleared).toContain(debounceId);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
    expect(reactLifecycleWarnings()).toEqual([]);
  });
});

// ============================================================================
// 2. In-flight async validation resolving AFTER unmount
//    Source: useFormValidationWithStore.ts — no mounted guard; writes go only
//    to the store, whose subscribers are gone after unmount.
// ============================================================================

describe('LEAK — in-flight async field validation resolving after unmount', () => {
  function buildAsyncForm(validateSchema: unknown) {
    return form
      .create(rilConfig, 'async-val-form')
      .setValidation({ mode: 'onChange' })
      .add({
        id: 'email',
        type: 'text',
        props: { label: 'Email' },
        validation: { validate: validateSchema as never },
      })
      .build();
  }

  it('2a: resolving a pending validator after unmount does not crash and emits no React warning', async () => {
    const { schema, calls } = makeControllableValidator();
    capturedStore = null;

    const { unmount } = render(
      <FormProvider formConfig={buildAsyncForm(schema)}>
        <FormBody />
        <StoreProbe />
      </FormProvider>
    );

    // Type — an async validation is now in flight (parked in `calls`).
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'bad' } });
    });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    const storeRef = capturedStore!;
    unmount();

    // Resolve the validator AFTER unmount, as an invalid verdict.
    await act(async () => {
      for (const c of calls) c.resolve([{ message: 'invalid' }]);
      await wait(0);
    });

    // No crash, no React lifecycle warning. Any store write landed on a store
    // nobody is subscribed to (harmless): reading it must not throw.
    expect(() => storeRef.getState()).not.toThrow();
    expect(reactLifecycleWarnings()).toEqual([]);
  });
});

// ============================================================================
// 3. Effect-engine abort controllers on unmount
//    Source: FormProvider.tsx:1099-1102 (engine.stop() on cleanup);
//    effect-engine.ts:222-233 (stop aborts + clears); :352 (setValue guard).
// ============================================================================

describe('LEAK — effect-engine async effect in flight on unmount', () => {
  it('3a: unmount aborts the in-flight effect; its late resolution never writes to the store', async () => {
    const gate = deferred<void>();
    const targetWriteAttempted = vi.fn();
    capturedStore = null;

    const config = form
      .create(rilConfig, 'effect-abort-form')
      .add({ id: 'trigger', type: 'text' })
      .add({
        id: 'target',
        type: 'text',
        effects: [
          onChange('trigger', async (value, { setValue }) => {
            await gate.promise; // parks the effect in flight
            targetWriteAttempted();
            setValue('target', `derived:${String(value)}`);
          }),
        ],
      })
      .build();

    const { unmount } = render(
      <FormProvider formConfig={config} defaultValues={{ trigger: '', target: '' }}>
        <FormBody />
        <StoreProbe />
      </FormProvider>
    );

    const storeRef = capturedStore!;

    // Fire the async effect; it now awaits the gate.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-trigger'), { target: { value: 'go' } });
    });

    // Unmount while the effect is parked → engine.stop() aborts the controller.
    unmount();

    // Release the effect AFTER unmount. Its setValue must be a guarded no-op.
    await act(async () => {
      gate.resolve();
      await wait(0);
    });

    // The handler resumed (it awaited the resolved gate) — note it may resume
    // more than once, because trigger's seeded '' value also fires this effect
    // via runInitialEffects at mount, so both the initial run and the change run
    // park on the gate. The load-bearing proof is that EVERY resumed setValue was
    // suppressed by the `aborted || stopped` guard, so `target` was never written.
    expect(targetWriteAttempted).toHaveBeenCalled();
    expect(storeRef.getState().values.target).toBe('');
    expect(reactLifecycleWarnings()).toEqual([]);
  });
});

// ============================================================================
// 4. Mount/unmount CHURN — the SPA-navigation stress
// ============================================================================

describe('LEAK — mount/unmount churn accumulates nothing', () => {
  it('4a: 50× mount+type+unmount of a debounced form leaves no net pending timers', async () => {
    const { schema } = makeSpyValidator();
    const config = form
      .create(rilConfig, 'churn-form')
      .setValidation({ mode: 'onChange' })
      .add({
        id: 'q',
        type: 'text',
        validation: { validate: schema as never, debounceMs: 500 },
      })
      .build();

    // Track outstanding (created-but-not-cleared) timer ids across the loop.
    const live = new Set<number>();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const setSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: never, delay?: number, ...rest: never[]) => {
        const id = (realSetTimeout as never as typeof setTimeout)(fn, delay, ...rest);
        live.add(id as unknown as number);
        return id as never;
      });
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id?: never) => {
      if (id !== undefined) live.delete(id as unknown as number);
      return (realClearTimeout as never as typeof clearTimeout)(id);
    });

    try {
      const liveBefore = live.size;
      for (let i = 0; i < 50; i++) {
        const { unmount } = render(
          <FormProvider formConfig={config}>
            <FormBody />
          </FormProvider>
        );
        await act(async () => {
          fireEvent.change(screen.getByTestId('input-q'), { target: { value: `v${i}` } });
        });
        // A 500ms debounce timer is now pending; unmount must clear it.
        unmount();
      }
      // No per-iteration accumulation: the 50 debounce timers were all cleared.
      // (Small slack for any unrelated jsdom/RTL scheduling.)
      expect(live.size - liveBefore).toBeLessThan(5);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
    expect(reactLifecycleWarnings()).toEqual([]);
  });

  it('4b: 50× mount/unmount of a flow (no persistence) is warning-free and fast', async () => {
    const stepForm = form
      .create(rilConfig, 'flow-churn-step')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();
    const workflowConfig = flow
      .create(rilConfig, 'flow-churn', 'Churn')
      .addStep({ id: 's1', title: 'S1', formConfig: stepForm })
      .addStep({ id: 's2', title: 'S2', formConfig: stepForm })
      .build();

    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      const { unmount } = render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <FlowBody />
          <NextButton />
          <PrevButton />
        </WorkflowProvider>
      );
      await act(async () => {
        fireEvent.change(screen.getByTestId('input-name'), { target: { value: `n${i}` } });
      });
      unmount();
    }
    const elapsed = Date.now() - start;

    expect(reactLifecycleWarnings()).toEqual([]);
    // A leak-driven slowdown would blow well past this; generous for CI.
    expect(elapsed).toBeLessThan(15000);
  });
});

// ============================================================================
// 5. Store subscription cleanup / per-provider isolation
//    Source: FormProvider store is created in useState (FormProvider.tsx:542);
//    every subscribe returns unsubscribe as the effect cleanup.
// ============================================================================

describe('LEAK — store subscription cleanup and per-provider isolation', () => {
  it('5a: each FormProvider mount gets its own store; a write to an unmounted store is inert', async () => {
    const config = form.create(rilConfig, 'iso-form').add({ id: 'a', type: 'text' }).build();

    capturedStore = null;
    const first = render(
      <FormProvider formConfig={config}>
        <FormBody />
        <StoreProbe />
      </FormProvider>
    );
    const storeA = capturedStore!;

    capturedStore = null;
    const second = render(
      <FormProvider formConfig={config}>
        <FormBody />
        <StoreProbe />
      </FormProvider>
    );
    const storeB = capturedStore!;

    // Per-provider stores — no shared global store leaking values across mounts.
    expect(storeA).not.toBe(storeB);

    first.unmount();

    // Writing into the unmounted mount's store must not fire a live subscriber
    // (which would setState on a dead tree) — no throw, no React warning.
    await act(async () => {
      storeA.getState()._setValue('a', 'ghost');
      await wait(0);
    });
    expect(storeA.getState().values.a).toBe('ghost');
    expect(reactLifecycleWarnings()).toEqual([]);

    second.unmount();
  });
});

// ============================================================================
// 6. Remount after unmount mid-validation is clean (no ghost state)
// ============================================================================

describe('LEAK — remount after unmount mid-validation carries no ghost state', () => {
  it('6a: a fresh mount has no error/value from the previous instance late resolution', async () => {
    const { schema, calls } = makeControllableValidator();
    const config = form
      .create(rilConfig, 'remount-form')
      .setValidation({ mode: 'onChange' })
      .add({
        id: 'email',
        type: 'text',
        props: { label: 'Email' },
        validation: { validate: schema as never },
      })
      .build();

    const first = render(
      <FormProvider formConfig={config}>
        <FormBody />
      </FormProvider>
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'bad' } });
    });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    first.unmount();
    // Old instance's validation resolves invalid AFTER unmount.
    await act(async () => {
      for (const c of calls) c.resolve([{ message: 'ghost error' }]);
      await wait(0);
    });

    // Fresh mount — a brand-new store; nothing from the old instance leaks in.
    render(
      <FormProvider formConfig={config}>
        <FormBody />
      </FormProvider>
    );
    await waitFor(() => expect(screen.getByTestId('input-email')).toBeInTheDocument());
    expect(screen.getByTestId('input-email')).toHaveValue('');
    expect(screen.queryByText('ghost error')).not.toBeInTheDocument();
    expect(reactLifecycleWarnings()).toEqual([]);
  });
});

// ============================================================================
// 7. Workflow persistence debounced save timer on unmount
//    Source: usePersistence.ts:185-195 (debouncedSave ref), :302-331 (auto-
//    persist effect schedules it), :272 (cancel — ONLY in clearPersistedData).
//    There is NO unmount cleanup that cancels the pending debounce.
// ============================================================================

describe('LEAK — workflow persistence debounced save on unmount', () => {
  const WORKFLOW_ID = 'persist-leak-flow';

  function buildPersistedFlow(adapter: WorkflowPersistenceAdapter, debounceMs: number) {
    const stepForm = form
      .create(rilConfig, 'persist-step')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();
    const notesForm = form
      .create(rilConfig, 'persist-notes')
      .add({ id: 'note', type: 'text', props: { label: 'Note' } })
      .build();
    return flow
      .create(rilConfig, WORKFLOW_ID, 'Persist Leak')
      .addStep({ id: 'one', title: 'One', formConfig: stepForm })
      .addStep({ id: 'two', title: 'Two', formConfig: notesForm })
      .configure({ persistence: { adapter, options: { autoPersist: true, debounceMs } } })
      .build();
  }

  it('7a: a completed workflow cancels its pending save (clearPersistedData path) — no resurrection', async () => {
    // This is the cleanup that DOES exist: completion calls clearPersistedData,
    // which cancels the debounce (usePersistence.ts:272). Sanity-anchor so 7b's
    // failure is unambiguously the MISSING unmount cleanup, not a broken adapter.
    const adapter = makeSpyAdapter();
    const { unmount } = render(
      <WorkflowProvider workflowConfig={buildPersistedFlow(adapter, 60)}>
        <FlowBody />
        <NextButton />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Ann' } });
    });
    // Auto-save becomes active once loading settles.
    await waitFor(() => expect(adapter.save).toHaveBeenCalled(), { timeout: 2000 });

    // Advance to the last step and complete.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('input-note')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // remove() was called on completion (clear-on-complete).
    await waitFor(() => expect(adapter.remove).toHaveBeenCalled(), { timeout: 2000 });

    adapter.save.mockClear();
    unmount();
    await wait(200);
    // No post-completion resurrection save.
    expect(adapter.save).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------------
  // On unmount, a pending debounced save is FLUSHED, not dropped — workflow
  // persistence exists to resume where the user left off, so navigating away
  // inside the debounce window must persist the last edit, not lose it.
  //
  // usePersistence (usePersistence.ts) now has an unmount-only cleanup that
  // clears `isMountedRef` (so the flushed save touches no React state on the
  // dead hook) then `debouncedSave.current.flush()` — running the pending save
  // immediately with the latest state and clearing the timer, so nothing fires
  // LATER. `saveWorkflowState` still honours the workflowCompletedRef guard, so
  // a completed workflow (7a) is never resurrected.
  // ------------------------------------------------------------------------
  it('7b: FLUSHES a pending debounced save on unmount so the last edit is persisted', async () => {
    const adapter = makeSpyAdapter();
    const { unmount } = render(
      <WorkflowProvider workflowConfig={buildPersistedFlow(adapter, 200)}>
        <FlowBody />
      </WorkflowProvider>
    );

    await waitFor(() => expect(screen.getByTestId('input-name')).toBeInTheDocument());

    // First edit + wait for the first autosave: confirms auto-persist is active
    // and past the initial isLoadingPersisted window.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'first' } });
    });
    await waitFor(() => expect(adapter.save).toHaveBeenCalled(), { timeout: 2000 });

    // Reset the spy, make a fresh edit that schedules a NEW 200ms debounced save,
    // then unmount immediately (well under 200ms of real time elapses here).
    adapter.save.mockClear();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'second' } });
    });
    unmount();

    // The pending save was FLUSHED on unmount — the last edit ('second') is
    // persisted synchronously as part of teardown.
    await waitFor(() => expect(adapter.save).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(adapter.save.mock.calls[0][1])).toContain('second');

    // And nothing fires LATER: the timer was cleared by the flush, so no second,
    // post-unmount write against the dead adapter.
    await wait(400);
    expect(adapter.save).toHaveBeenCalledTimes(1);
  });
});
