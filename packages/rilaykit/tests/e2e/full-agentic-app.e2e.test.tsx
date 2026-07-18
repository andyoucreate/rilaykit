import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useRef } from 'react';
import {
  type ComponentRenderContext,
  type FieldEffectContext,
  type FlowBindings,
  type FlowSchema,
  LocalStorageAdapter,
  type PartRenderContext,
  type ToolRenderContext,
  compileFlow,
  manifest,
  ril,
  uiTools,
} from 'rilaykit';
import { toParts, tools } from 'rilaykit/ai-sdk';
import { Catalog, Flow, FormBody, FormField, FormList, Parts, useCatalog } from 'rilaykit/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * CAPSTONE — the whole P3 stack through the PUBLISHED all-in-one `rilaykit`
 * surface, in one production-shaped scenario: a booking assistant whose model
 * emits a multi-step flow, a human fills it (validation blocks a bad answer, a
 * derived field tracks their typing, a conditional field appears and vanishes,
 * a repeatable guest list grows and shrinks), the tab is "reloaded" mid-flow and
 * the work resumes from persisted state, and the engine-validated payload is
 * handed back to the agent exactly once. NOTHING of rilaykit is mocked — real
 * catalog, real compile, real Zustand stores, real localStorage persistence,
 * real React Testing Library user interaction. Only the model side is literal
 * JSON fixtures in the exact wire shape AI SDK v5 carries.
 *
 * The realistic composition is the point: a break here is a real bug, not a
 * contrived one. Each layer is exercised THROUGH the others, never in isolation.
 */

// =============================================================================
// The app's catalog — custom components, the UI tools, and the app's own
// `show_flow` chrome (the documented `.renderers({ tools })` extension point,
// where a production app wires its effect/validator bindings AND persistence
// that the bare built-in renderer deliberately leaves to the host).
// =============================================================================

/** A production app owns ONE persistence adapter; a reload reuses it. */
const ADAPTER = new LocalStorageAdapter();
const PERSIST_OPTIONS = { autoPersist: true, debounceMs: 0 } as const;

/** The app's non-serializable logic, resolved from the emitted schema's string
 * references at compile time: a `handle` derived live from `fullName`. */
const bindings: FlowBindings = {
  effects: {
    deriveHandle: (newValue: unknown, ctx: FieldEffectContext) => {
      const base = typeof newValue === 'string' ? newValue.trim() : '';
      ctx.setValue('handle', base ? `handle-${base.toLowerCase().replace(/\s+/g, '-')}` : '');
    },
  },
};

function TextInput({ id, props, field }: ComponentRenderContext) {
  const errors = field?.error ?? [];
  return (
    <div>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <input
        id={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {errors.length > 0 ? <span role="alert">{errors[0].message}</span> : null}
    </div>
  );
}

function SelectInput({ id, props, field }: ComponentRenderContext) {
  const options = Array.isArray(props.options)
    ? (props.options as Array<{ value: string; label: string }>)
    : [];
  return (
    <div>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <select
        id={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The app's own step body: the default chrome PLUS remove buttons for
 * repeatable rows (the default `FormList` ships only "Add"). */
function AppStepBody() {
  return (
    <FormBody>
      {({ rows }) =>
        rows.map((row) =>
          row.kind === 'repeatable' ? (
            <FormList key={row.id} id={row.repeatable.id}>
              {({ items, add, remove, canAdd, canRemove }) => (
                <div data-guest-list>
                  {items.map((item) => (
                    <div key={item.key} data-guest-row={item.key}>
                      {item.allFields.map((f) => (
                        <FormField key={f.id} id={f.id} config={f} />
                      ))}
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => remove(item.key)}
                        >{`Remove guest ${item.index + 1}`}</button>
                      ) : null}
                    </div>
                  ))}
                  {canAdd ? (
                    <button type="button" onClick={() => add()}>
                      Add guest
                    </button>
                  ) : null}
                </div>
              )}
            </FormList>
          ) : (
            <div key={row.id}>
              {row.fields.map((f) => (
                <FormField key={f.id} id={f.id} />
              ))}
            </div>
          )
        )
      }
    </FormBody>
  );
}

/** The app's `show_flow` renderer: compiles the emitted schema against the
 * catalog with the app's bindings, mounts the real flow chrome with
 * auto-persistence, and answers the tool call exactly once. */
function AppShowFlow({ state, input, resolve }: ToolRenderContext) {
  const catalog = useCatalog();
  const settled = useRef(false);

  const compiled = useMemo(() => {
    if (state !== 'ready') return null;
    const schema = (input as { schema?: unknown } | null | undefined)?.schema;
    // The honest boundary cast on untrusted emission JSON — the same one the
    // built-in ShowFlow performs; compileFlow guards the tree and reports every
    // defect as a SchemaValidationError.
    return compileFlow(schema as FlowSchema, catalog, {
      bindings,
      validateProps: true,
    });
  }, [state, input, catalog]);

  const config = useMemo(
    () =>
      compiled
        ? {
            ...compiled.workflowConfig,
            persistence: { adapter: ADAPTER, options: PERSIST_OPTIONS },
          }
        : null,
    [compiled]
  );

  if (state !== 'ready' || !config || !compiled) {
    // Rehydrated / settled call: a bare marker, never a re-armed flow.
    return <div data-tool-state={state} data-tool-name="show_flow" />;
  }

  const settle = (output: unknown) => {
    if (settled.current) return;
    settled.current = true;
    resolve(output);
  };

  return (
    <Flow
      of={config}
      defaults={compiled.defaultValues}
      onComplete={(values) => settle({ status: 'submitted', values })}
    >
      <Flow.Body>
        <AppStepBody />
      </Flow.Body>
      <Flow.Back />
      <Flow.Next />
      <button type="button" onClick={() => settle({ status: 'cancelled' })} data-agent-cancel>
        Cancel
      </button>
    </Flow>
  );
}

const catalog = ril
  .create()
  .component('text', {
    description: 'Single-line text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: TextInput,
  })
  .component('select', {
    description: 'Dropdown selector',
    renderer: SelectInput,
  })
  .part('text', {
    renderer: ({ part }: PartRenderContext<{ text?: string }>) => <p>{part.text}</p>,
  })
  .use(uiTools())
  .renderers({ tools: { show_flow: AppShowFlow } });

// =============================================================================
// The model side — literal AI SDK v5 UIMessage fixtures.
// =============================================================================

function sdkMessage(parts: unknown[]): unknown {
  return JSON.parse(JSON.stringify({ id: 'msg_1', role: 'assistant', parts }));
}

/** The multi-step booking flow the model emits: conditional field + derived
 * field + per-field validation in step 1, a repeatable guest list in step 2. */
const bookingFlowSchema = {
  id: 'booking-assistant',
  name: 'Trip booking',
  steps: [
    {
      id: 'traveler',
      title: 'Traveler',
      form: {
        id: 'traveler',
        fields: [
          {
            id: 'fullName',
            type: 'text',
            props: { label: 'Full name' },
            validation: { rules: 'required' },
          },
          {
            id: 'email',
            type: 'text',
            props: { label: 'Email' },
            validation: { rules: ['required', 'email'] },
          },
          {
            id: 'handle',
            type: 'text',
            props: { label: 'Handle' },
            effects: [{ trigger: 'change', watch: 'fullName', handler: 'deriveHandle' }],
          },
          {
            id: 'contactPref',
            type: 'select',
            props: {
              label: 'Contact preference',
              options: [
                { value: 'email', label: 'By email' },
                { value: 'phone', label: 'By phone' },
              ],
            },
            default: 'email',
          },
          {
            id: 'phone',
            type: 'text',
            props: { label: 'Phone' },
            conditions: { visible: { field: 'contactPref', operator: 'equals', value: 'phone' } },
          },
        ],
      },
    },
    {
      id: 'party',
      title: 'Party',
      form: {
        id: 'party',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'guests',
              min: 1,
              max: 4,
              defaultValue: { guestName: '' },
              rows: [
                {
                  fields: [
                    {
                      id: 'guestName',
                      type: 'text',
                      props: { label: 'Guest name' },
                      validation: { rules: 'required' },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    {
      id: 'review',
      title: 'Review',
      form: {
        id: 'review',
        fields: [{ id: 'notes', type: 'text', props: { label: 'Notes' } }],
      },
    },
  ],
} as const;

function bookingMessage(): unknown {
  return sdkMessage([
    { type: 'text', text: 'Let me help you book your trip.' },
    {
      type: 'tool-show_flow',
      toolCallId: 'call_booking',
      state: 'input-available',
      input: { schema: bookingFlowSchema },
    },
  ]);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('full agentic booking app, end to end', () => {
  it('emission → server prompt/tools → multi-step fill → validation → derive → conditional → repeatable → reload → resolved payload', async () => {
    const user = userEvent.setup();

    // ---------------------------------------------------------------------
    // SERVER SIDE — the manifest teaches the catalog and tools() offers the
    // UI tools without execute (AI SDK's native HITL: the stream stays pending
    // until the client posts the tool result back).
    // ---------------------------------------------------------------------
    const prompt = manifest(catalog);
    expect(prompt).toContain('- **text** — Single-line text input');
    expect(prompt).toContain('- **select** — Dropdown selector');
    expect(prompt).toContain('- **show_flow**');

    const definitions = tools(catalog);
    expect(Object.keys(definitions).sort()).toEqual(['show_component', 'show_flow', 'show_form']);
    // The UI tools carry NO `execute` — the SDK's native HITL pattern.
    expect(Object.hasOwn(definitions.show_flow, 'execute')).toBe(false);
    expect(typeof definitions.show_flow.inputSchema).toBe('object');

    // ---------------------------------------------------------------------
    // CLIENT SIDE — toParts() → <Parts> renders the emission through the
    // real catalog. onResolve is the AI SDK addToolResult mirror.
    // ---------------------------------------------------------------------
    const onResolve = vi.fn();
    const view = render(
      <Catalog value={catalog}>
        <Parts parts={toParts(bookingMessage())} onResolve={onResolve} />
      </Catalog>
    );

    expect(screen.getByText('Let me help you book your trip.')).toBeInTheDocument();

    // ---------------------------------------------------------------------
    // STEP 1 — a validation error blocks submit, then live derive + conditional.
    // ---------------------------------------------------------------------
    await user.type(screen.getByLabelText('Full name'), 'Karl Mazier');

    // The effect fires on every keystroke: `handle` is derived from `fullName`,
    // never typed. If the effect binding were not wired, this would still be ''.
    expect((screen.getByLabelText('Handle') as HTMLInputElement).value).toBe('handle-karl-mazier');

    // A bad email: the engine must refuse to advance and surface WHY.
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Submit blocked — still on step 1 (Guest-name / step-2 chrome absent), and
    // the field's own error is announced.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address')
    );
    expect(screen.queryByLabelText('Guest name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();

    // Correct the email.
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'karl@example.com');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    // The conditional `phone` field is hidden while contactPref is 'email'.
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();

    // Reveal it: pick "By phone".
    await user.selectOptions(screen.getByLabelText('Contact preference'), 'phone');
    expect(await screen.findByLabelText('Phone')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Phone'), '+33123456789');

    // Retract it: back to "By email" — the field vanishes again. Its retracted
    // value must NOT ship in the final payload (visibility = existence).
    await user.selectOptions(screen.getByLabelText('Contact preference'), 'email');
    await waitFor(() => expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument());

    // Advance to step 2.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByLabelText('Guest name')).toBeInTheDocument();

    // ---------------------------------------------------------------------
    // STEP 2 — repeatable guest list. Fill the seeded row, then reload.
    // ---------------------------------------------------------------------
    await user.type(screen.getByLabelText('Guest name'), 'Alice');

    // Auto-persistence: wait until the tab's saved snapshot reflects step 2 and
    // the first guest, THEN simulate the reload.
    await waitFor(async () => {
      const saved = await ADAPTER.load('booking-assistant');
      // Resumed on step 2 (index 1), with the traveler answers and the first
      // guest already recorded in the persisted snapshot.
      expect(saved?.currentStepIndex).toBe(1);
      expect(saved?.allData?.traveler).toMatchObject({ email: 'karl@example.com' });
      expect(JSON.stringify(saved?.allData?.party)).toContain('Alice');
    });

    // -------- PAGE RELOAD: unmount the whole tree, remount the same emission
    // against the same adapter. The user must resume where they left off. -----
    view.unmount();
    render(
      <Catalog value={catalog}>
        <Parts parts={toParts(bookingMessage())} onResolve={onResolve} />
      </Catalog>
    );

    // Resumed on step 2 with the guest restored — not reset to step 1.
    const restoredGuest = await screen.findByLabelText('Guest name');
    expect((restoredGuest as HTMLInputElement).value).toBe('Alice');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();

    // Add two more guests, then remove the middle one — order must survive.
    await user.click(screen.getByRole('button', { name: 'Add guest' }));
    let guestInputs = screen.getAllByLabelText('Guest name');
    expect(guestInputs).toHaveLength(2);
    await user.type(guestInputs[1], 'Bob');

    await user.click(screen.getByRole('button', { name: 'Add guest' }));
    guestInputs = screen.getAllByLabelText('Guest name');
    expect(guestInputs).toHaveLength(3);
    await user.type(guestInputs[2], 'Carol');

    // Remove Bob (the middle row).
    await user.click(screen.getByRole('button', { name: 'Remove guest 2' }));
    await waitFor(() => expect(screen.getAllByLabelText('Guest name')).toHaveLength(2));
    const remaining = screen
      .getAllByLabelText('Guest name')
      .map((el) => (el as HTMLInputElement).value);
    expect(remaining).toEqual(['Alice', 'Carol']);

    // Advance to step 3.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByLabelText('Notes')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Notes'), 'Window seat please');

    // ---------------------------------------------------------------------
    // COMPLETE — the agent receives the engine-validated, step-keyed payload
    // exactly once: derived value present, retracted conditional excluded,
    // repeatable in final add/remove order.
    // ---------------------------------------------------------------------
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_booking',
        {
          status: 'submitted',
          values: {
            traveler: {
              fullName: 'Karl Mazier',
              email: 'karl@example.com',
              handle: 'handle-karl-mazier',
              contactPref: 'email',
            },
            party: { guests: [{ guestName: 'Alice' }, { guestName: 'Carol' }] },
            review: { notes: 'Window seat please' },
          },
        },
        'show_flow'
      )
    );
  });

  // ===========================================================================
  // The self-correction + cancellation branch, through the BUILT-IN show_form
  // renderer (no host override) — the model's own error-recovery loop.
  // ===========================================================================

  it('an invalid emission delivers its error once (role=alert + expectedKeys), then a corrected re-emission on the same call completes', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    // The model emits a show_form whose field carries a props violation:
    // `label` must be a string. validateProps (on in the built-in) rejects it.
    const badMessage = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_form',
        state: 'input-available',
        input: {
          schema: {
            id: 'seat',
            fields: [{ id: 'seat', type: 'text', props: { label: 42 } }],
          },
        },
      },
    ]);

    const view = render(
      <Catalog value={catalog}>
        <Parts parts={toParts(badMessage)} onResolve={onResolve} />
      </Catalog>
    );

    // The emission error is announced AND carries the accepted prop names, so a
    // self-correcting model can see exactly which key it got wrong.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-agent-error', 'emission');
    expect(alert.querySelector('[data-agent-error-expected-keys="label"]')).not.toBeNull();

    // Delivered to the model exactly once as a tool result on THIS call.
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [callId, output, toolName] = onResolve.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(callId).toBe('call_form');
    expect(output.status).toBe('error');
    expect(toolName).toBe('show_form');

    // The model re-emits a CORRECTED schema on the SAME toolCallId. <Parts>
    // keys the built-in on toolCallId, so it recovers in place.
    const fixedMessage = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_form',
        state: 'input-available',
        input: {
          schema: {
            id: 'seat',
            fields: [{ id: 'seat', type: 'text', props: { label: 'Seat number' } }],
          },
        },
      },
    ]);
    view.rerender(
      <Catalog value={catalog}>
        <Parts parts={toParts(fixedMessage)} onResolve={onResolve} />
      </Catalog>
    );

    // The corrected form is live; the user completes it and the submit resolves.
    const seat = await screen.findByLabelText('Seat number');
    await user.type(seat, '14C');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenLastCalledWith(
      'call_form',
      { status: 'submitted', values: { seat: '14C' } },
      'show_form'
    );
  });

  it('the cancellation path resolves { status: "cancelled" } exactly once', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    const message = sdkMessage([
      {
        type: 'tool-show_form',
        toolCallId: 'call_cancel',
        state: 'input-available',
        input: {
          schema: {
            id: 'seat',
            fields: [{ id: 'seat', type: 'text', props: { label: 'Seat number' } }],
          },
        },
      },
    ]);

    render(
      <Catalog value={catalog}>
        <Parts parts={toParts(message)} onResolve={onResolve} />
      </Catalog>
    );

    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_cancel',
        { status: 'cancelled' },
        'show_form'
      )
    );
  });
});
