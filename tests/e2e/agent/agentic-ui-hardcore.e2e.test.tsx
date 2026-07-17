import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentRenderContext,
  type Part,
  isDataPart,
  isTextPart,
  isToolPart,
  manifest,
  ril,
  uiTools,
} from 'rilaykit';
import { toParts, tools } from 'rilaykit/ai-sdk';
import { Catalog, Parts } from 'rilaykit/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * HARDCORE agentic-UI harness — the @rilaykit/agent layer driven the way a
 * production AI product would: the model side is literal AI SDK v5 wire JSON,
 * the client side is the REAL catalog, the REAL built-in HITL renderers
 * (ShowForm / ShowFlow / ShowComponent — NO host `.renderers()` overrides, so
 * the shipped fallbacks are what's under test), the REAL forms/workflow engines,
 * and REAL React Testing Library interaction. Every assertion pins what the USER
 * SEES or the EXACT `onResolve(toolCallId, output, toolName)` payload the AI SDK
 * `addToolResult` mirror would carry back.
 *
 * Distinct from the flagship `full-agentic-app.e2e.test.tsx`: that one exercises
 * a HOST-authored `show_flow` renderer with persistence end-to-end. This one
 * pounds on the BUILT-IN fallbacks, the wire adapter, the streaming lock, the
 * one-answer-per-call latch, concurrency, and the manifest/tools server surface.
 */

// =============================================================================
// A production-shaped catalog: two form inputs, one display component, and the
// three UI tools — rendered by the shipped built-ins, never a host override.
// =============================================================================

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

/** A display-only component for `show_component`: renders its own text and any
 * nested children the model emitted. */
function Callout({ props, children }: ComponentRenderContext) {
  return (
    <section data-callout>
      <p data-callout-text>{String((props as { text?: unknown }).text ?? '')}</p>
      {children}
    </section>
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
  .component('callout', {
    description: 'A highlighted message block',
    propsSchema: z.object({ text: z.string() }),
    renderer: Callout,
  })
  // The assistant's prose parts render through a registered `part` renderer —
  // the agent layer ships no default for `text`, the host owns its chat chrome.
  .part('text', {
    renderer: ({ part }: { part: { text?: string } }) => <p>{part.text}</p>,
  })
  // A renderer-only tool: NO inputSchema. Spec §4 says it is host-executed and
  // must be EXCLUDED from the emittable manifest and the generated ToolSet.
  .tool('run_search', {
    description: 'Run a background search (host-executed)',
    renderer: ({ toolCallId }) => <div data-host-tool={toolCallId}>searching…</div>,
  })
  .use(uiTools());

// =============================================================================
// Wire fixtures — the exact shape AI SDK v5 UIMessages carry.
// =============================================================================

/** Round-trips through JSON so the fixture is provably serializable — the same
 * boundary a real streamed message crosses. */
function sdkMessage(parts: unknown[]): unknown {
  return JSON.parse(JSON.stringify({ id: 'msg_1', role: 'assistant', parts }));
}

function formTool(
  toolCallId: string,
  schema: unknown,
  state = 'input-available'
): Record<string, unknown> {
  return { type: 'tool-show_form', toolCallId, state, input: { schema } };
}

/** A single text field form, `required` so submit is gate-able. */
function oneFieldForm(id: string, fieldLabel: string): unknown {
  return {
    id,
    fields: [{ id: 'value', type: 'text', props: { label: fieldLabel } }],
  };
}

function renderParts(message: unknown, onResolve = vi.fn()) {
  const view = render(
    <Catalog value={catalog}>
      <Parts parts={toParts(message)} onResolve={onResolve} />
    </Catalog>
  );
  return { view, onResolve };
}

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 1. HITL resolve loop — the happy path, exact values back.
// =============================================================================

describe('show_form HITL resolve loop', () => {
  it('a filled multi-field form resolves { status:"submitted", values } with EXACT values and toolName', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderParts(
      sdkMessage([
        { type: 'text', text: 'I need a few details.' },
        formTool('call_profile', {
          id: 'profile',
          fields: [
            { id: 'firstName', type: 'text', props: { label: 'First name' } },
            { id: 'lastName', type: 'text', props: { label: 'Last name' } },
            {
              id: 'channel',
              type: 'select',
              props: {
                label: 'Preferred channel',
                options: [
                  { value: 'email', label: 'Email' },
                  { value: 'sms', label: 'SMS' },
                ],
              },
              default: 'email',
            },
          ],
        }),
      ])
    );

    expect(screen.getByText('I need a few details.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('First name'), 'Karl');
    await user.type(screen.getByLabelText('Last name'), 'Mazier');
    await user.selectOptions(screen.getByLabelText('Preferred channel'), 'sms');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_profile',
        {
          status: 'submitted',
          values: { firstName: 'Karl', lastName: 'Mazier', channel: 'sms' },
        },
        'show_form'
      )
    );
  });

  it('the one-shot latch resolves EXACTLY ONCE even when Submit is clicked twice', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderParts(
      sdkMessage([formTool('call_once', oneFieldForm('once', 'Your name'))])
    );

    await user.type(await screen.findByLabelText('Your name'), 'Ada');
    const submit = screen.getByRole('button', { name: 'Submit' });
    await user.click(submit);
    await user.click(submit);

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith(
      'call_once',
      { status: 'submitted', values: { value: 'Ada' } },
      'show_form'
    );
  });

  it('Cancel resolves { status:"cancelled" } once; a Submit racing behind it is swallowed', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderParts(
      sdkMessage([formTool('call_cancel', oneFieldForm('cancelable', 'Note'))])
    );

    await user.type(await screen.findByLabelText('Note'), 'changed my mind');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // The latch is now closed — a follow-up Submit must not resolve again.
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith(
      'call_cancel',
      { status: 'cancelled' },
      'show_form'
    );
  });
});

// =============================================================================
// 2. show_flow — the BUILT-IN renderer drives a real multi-step workflow.
// =============================================================================

describe('show_flow built-in renderer', () => {
  it('a 2-step flow emitted as a tool part drives the real workflow to completion, resolving the step-keyed data', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderParts(
      sdkMessage([
        {
          type: 'tool-show_flow',
          toolCallId: 'call_flow',
          state: 'input-available',
          input: {
            schema: {
              id: 'onboarding',
              name: 'Onboarding',
              steps: [
                {
                  id: 'account',
                  title: 'Account',
                  form: {
                    id: 'account',
                    fields: [{ id: 'email', type: 'text', props: { label: 'Email' } }],
                  },
                },
                {
                  id: 'company',
                  title: 'Company',
                  form: {
                    id: 'company',
                    fields: [{ id: 'name', type: 'text', props: { label: 'Company name' } }],
                  },
                },
              ],
            },
          },
        },
      ])
    );

    await user.type(await screen.findByLabelText('Email'), 'karl@acme.co');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(await screen.findByLabelText('Company name'), 'Acme');
    // Advancing past the last step completes the flow.
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_flow',
        {
          status: 'submitted',
          values: { account: { email: 'karl@acme.co' }, company: { name: 'Acme' } },
        },
        'show_flow'
      )
    );
  });
});

// =============================================================================
// 3. show_component — a component tree renders; an unknown component degrades.
// =============================================================================

describe('show_component built-in renderer', () => {
  it('renders a component tree (with nested children) through the catalog', () => {
    renderParts(
      sdkMessage([
        {
          type: 'tool-show_component',
          toolCallId: 'call_show',
          state: 'input-available',
          input: {
            node: {
              type: 'callout',
              props: { text: 'Booking confirmed' },
              children: [{ type: 'callout', props: { text: 'Seat 14C' } }],
            },
          },
        },
      ])
    );

    const outer = screen.getByText('Booking confirmed');
    expect(outer).toBeInTheDocument();
    // The nested child rendered INSIDE the parent callout.
    const parentSection = outer.closest('[data-callout]');
    expect(within(parentSection as HTMLElement).getByText('Seat 14C')).toBeInTheDocument();
  });

  it('an unknown component degrades to the EmissionErrorView (with catalog ids as expectedKeys) AND delivers { status:"error" } once — siblings survive', async () => {
    const { onResolve } = renderParts(
      sdkMessage([
        { type: 'text', text: 'Here is your summary.' },
        {
          type: 'tool-show_component',
          toolCallId: 'call_bad',
          state: 'input-available',
          input: { node: { type: 'ghost', props: {} } },
        },
      ])
    );

    // The whole <Parts> list did NOT crash — the sibling text still renders.
    expect(screen.getByText('Here is your summary.')).toBeInTheDocument();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-agent-error', 'emission');
    // The retry payload names the real catalog ids the model could have used.
    const keysEl = alert.querySelector('[data-agent-error-expected-keys]');
    expect(keysEl?.getAttribute('data-agent-error-expected-keys')).toContain('callout');

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    const [callId, output, toolName] = onResolve.mock.calls[0] as [
      string,
      { status: string; error: string; expectedKeys: string[] },
      string,
    ];
    expect(callId).toBe('call_bad');
    expect(toolName).toBe('show_component');
    expect(output.status).toBe('error');
    expect(output.error).toBe('Unknown component "ghost"');
    expect(output.expectedKeys).toEqual(expect.arrayContaining(['text', 'select', 'callout']));
  });
});

// =============================================================================
// 4. toParts — the AI SDK v5 wire adapter maps every state to the Part shape.
// =============================================================================

describe('toParts wire adapter', () => {
  it('maps text, all four tool states, dynamic-tool, and data parts; skips torn parts', () => {
    const parts = toParts(
      sdkMessage([
        { type: 'text', text: 'streaming chunk', state: 'streaming' },
        { type: 'text', text: 'final chunk' },
        formTool('c_stream', { id: 'a' }, 'input-streaming'),
        formTool('c_ready', { id: 'b' }, 'input-available'),
        {
          type: 'tool-show_form',
          toolCallId: 'c_done',
          state: 'output-available',
          input: { id: 'c' },
          output: { status: 'submitted' },
        },
        {
          type: 'tool-show_form',
          toolCallId: 'c_err',
          state: 'output-error',
          input: null,
          errorText: 'model aborted',
        },
        {
          type: 'dynamic-tool',
          toolName: 'mcp_lookup',
          toolCallId: 'c_dyn',
          state: 'input-available',
          input: { q: 1 },
        },
        { type: 'data-progress', data: { pct: 42 } },
        // Torn / unmappable — every one of these must be DROPPED, not thrown on.
        { type: 'tool-show_form', state: 'input-available', input: {} }, // no toolCallId
        { type: 'tool-show_form', toolCallId: 'c_weird', state: 'bogus-state', input: {} }, // bad state
        { type: 'text' }, // no text string
        null,
      ])
    );

    expect(parts).toEqual([
      { type: 'text', text: 'streaming chunk', state: 'streaming' },
      { type: 'text', text: 'final chunk', state: 'done' },
      {
        type: 'tool',
        toolCallId: 'c_stream',
        name: 'show_form',
        state: 'streaming',
        input: { schema: { id: 'a' } },
        output: undefined,
        errorText: undefined,
      },
      {
        type: 'tool',
        toolCallId: 'c_ready',
        name: 'show_form',
        state: 'ready',
        input: { schema: { id: 'b' } },
        output: undefined,
        errorText: undefined,
      },
      {
        type: 'tool',
        toolCallId: 'c_done',
        name: 'show_form',
        state: 'done',
        input: { id: 'c' },
        output: { status: 'submitted' },
        errorText: undefined,
      },
      {
        type: 'tool',
        toolCallId: 'c_err',
        name: 'show_form',
        state: 'error',
        // `input ?? {}` is NULLISH — a torn `input: null` normalizes to `{}` at
        // the adapter, not just `undefined`. (A directly-constructed Part may
        // still carry null; the built-ins degrade that via `?.` — see Part.tsx.)
        input: {},
        output: undefined,
        errorText: 'model aborted',
      },
      {
        type: 'tool',
        toolCallId: 'c_dyn',
        name: 'mcp_lookup',
        state: 'ready',
        input: { q: 1 },
        output: undefined,
        errorText: undefined,
      },
      { type: 'data', name: 'progress', data: { pct: 42 } },
    ]);

    // The guards agree with the shapes.
    expect(parts.filter(isTextPart)).toHaveLength(2);
    expect(parts.filter(isToolPart)).toHaveLength(5);
    expect(parts.filter(isDataPart)).toHaveLength(1);
  });

  it('a missing input on a tool part becomes {} (never undefined) so renderers can read it safely', () => {
    const [part] = toParts(
      sdkMessage([{ type: 'tool-show_form', toolCallId: 'c_noinput', state: 'input-available' }])
    ) as [Extract<Part, { type: 'tool' }>];
    expect(part.input).toEqual({});
  });

  it('a non-message value yields an empty list', () => {
    expect(toParts(undefined)).toEqual([]);
    expect(toParts({ parts: 'not-an-array' })).toEqual([]);
  });
});

// =============================================================================
// 5. Streaming / re-emission on the SAME toolCallId — in-place update, latch
//    is per-call and doesn't leak.
// =============================================================================

describe('streaming and re-emission on the same tool call', () => {
  it('a streaming form mounts fields but LOCKS submit; reaching ready keeps typed input and unlocks; done shows the settled marker without re-arming', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const schema = oneFieldForm('seat', 'Seat number');

    const view = render(
      <Catalog value={catalog}>
        <Parts
          parts={toParts(sdkMessage([formTool('call_seat', schema, 'input-streaming')]))}
          onResolve={onResolve}
        />
      </Catalog>
    );

    // The field is live during streaming — the user may start typing — but the
    // Submit is LOCKED (pending): the model must not get an answer to a question
    // it has not finished asking.
    const input = await screen.findByLabelText('Seat number');
    await user.type(input, '14C');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(onResolve).not.toHaveBeenCalled();

    // Same toolCallId reaches ready. The instance updates IN PLACE — the typed
    // value survives (FormProvider growth, not a reset) and Submit unlocks.
    view.rerender(
      <Catalog value={catalog}>
        <Parts
          parts={toParts(sdkMessage([formTool('call_seat', schema, 'input-available')]))}
          onResolve={onResolve}
        />
      </Catalog>
    );

    const readyInput = await screen.findByLabelText('Seat number');
    expect((readyInput as HTMLInputElement).value).toBe('14C');
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_seat',
        { status: 'submitted', values: { value: '14C' } },
        'show_form'
      )
    );

    // A rehydrated `output-available` re-emission must NOT re-arm the form — it
    // shows the bare settled marker, and no second resolve fires.
    view.rerender(
      <Catalog value={catalog}>
        <Parts
          parts={toParts(
            sdkMessage([
              {
                type: 'tool-show_form',
                toolCallId: 'call_seat',
                state: 'output-available',
                input: { schema },
                output: { status: 'submitted', values: { seat: '14C' } },
              },
            ])
          )}
          onResolve={onResolve}
        />
      </Catalog>
    );

    await waitFor(() => {
      const marker = document.querySelector('[data-tool-name="show_form"][data-tool-state="done"]');
      expect(marker).not.toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// 6. Validation inside an emitted show_form — the engine gates the answer.
// =============================================================================

describe('validation inside an emitted show_form', () => {
  it('an invalid email blocks submit and surfaces the error; correcting it lets the engine-validated value resolve', async () => {
    const user = userEvent.setup();
    const { onResolve } = renderParts(
      sdkMessage([
        formTool('call_valid', {
          id: 'contact',
          // Form-level timing: validate on change so the error shows live (the
          // new form-level API — per-field validateOnChange/Blur are removed).
          validation: { mode: 'onChange' },
          fields: [
            {
              id: 'email',
              type: 'text',
              props: { label: 'Email' },
              validation: { rules: ['required', 'email'] },
            },
          ],
        }),
      ])
    );

    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Submit refused — the field's own error is announced, and the model got
    // nothing (an invalid value can never reach resolve).
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i));
    expect(onResolve).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'karl@example.com');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_valid',
        { status: 'submitted', values: { email: 'karl@example.com' } },
        'show_form'
      )
    );
  });
});

// =============================================================================
// 7. Multiple concurrent tool parts — resolve independently.
// =============================================================================

describe('concurrent tool parts', () => {
  it('two show_form calls resolve independently — settling one does not settle the other', async () => {
    const user = userEvent.setup();
    // Distinct FIELD ids (not just form ids) so the two concurrent forms don't
    // collide on the same DOM `id` — the host renderer binds `id={fieldId}`.
    const { onResolve } = renderParts(
      sdkMessage([
        formTool('call_alpha', {
          id: 'alpha',
          fields: [{ id: 'alphaValue', type: 'text', props: { label: 'Alpha field' } }],
        }),
        formTool('call_beta', {
          id: 'beta',
          fields: [{ id: 'betaValue', type: 'text', props: { label: 'Beta field' } }],
        }),
      ])
    );

    await user.type(await screen.findByLabelText('Alpha field'), 'A-value');
    await user.type(await screen.findByLabelText('Beta field'), 'B-value');

    // Both forms render their own Submit; order matches the parts array.
    const submits = screen.getAllByRole('button', { name: 'Submit' });
    expect(submits).toHaveLength(2);

    await user.click(submits[0]);
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_alpha',
        { status: 'submitted', values: { alphaValue: 'A-value' } },
        'show_form'
      )
    );
    // Beta is untouched — still exactly one resolve total.
    expect(onResolve).toHaveBeenCalledTimes(1);

    await user.click(submits[1]);
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenLastCalledWith(
      'call_beta',
      { status: 'submitted', values: { betaValue: 'B-value' } },
      'show_form'
    );
  });
});

// =============================================================================
// 8. manifest() + tools() — the server surface. No React, no throw.
// =============================================================================

describe('manifest() and tools() server surface', () => {
  it('manifest() lists components (with props) and only EMITTABLE tools, in Markdown', () => {
    const md = manifest(catalog);

    expect(md).toContain('## Available components');
    expect(md).toContain('- **text** — Single-line text input');
    expect(md).toContain('- **callout** — A highlighted message block');
    // A component's projected props are listed under it.
    expect(md).toContain('- label: string');

    expect(md).toContain('## Available tools');
    expect(md).toContain('- **show_form**');
    expect(md).toContain('- **show_flow**');
    expect(md).toContain('- **show_component**');
    // The renderer-only tool has NO inputSchema — never advertised.
    expect(md).not.toContain('run_search');

    expect(md).toContain('## How to show UI');
  });

  it('tools() emits exactly the three schema-bearing UI tools, each execute-less, each a jsonSchema-wrapped object root', () => {
    const definitions = tools(catalog);

    expect(Object.keys(definitions).sort()).toEqual(['show_component', 'show_flow', 'show_form']);
    // The renderer-only tool is excluded from the generated ToolSet.
    expect(Object.hasOwn(definitions, 'run_search')).toBe(false);

    for (const name of ['show_form', 'show_flow', 'show_component'] as const) {
      // Native HITL: no execute — the stream stays pending until addToolResult.
      expect(Object.hasOwn(definitions[name], 'execute')).toBe(false);
      expect(typeof definitions[name].inputSchema).toBe('object');
      // The projected JSON-Schema root the SDK forwards to the provider is an
      // object (the shape every provider requires).
      const projected = (definitions[name].inputSchema as { jsonSchema?: { type?: unknown } })
        .jsonSchema;
      expect(projected?.type).toBe('object');
    }
  });
});

// =============================================================================
// 9. error-output part — renders, never crashes.
// =============================================================================

describe('error-output tool parts', () => {
  it('a show_form part in the error state renders the settled marker (not a live form) and never resolves', async () => {
    const { onResolve } = renderParts(
      sdkMessage([
        { type: 'text', text: 'Something went wrong upstream.' },
        {
          type: 'tool-show_form',
          toolCallId: 'call_errored',
          state: 'output-error',
          input: { schema: oneFieldForm('errored', 'Name') },
          errorText: 'provider timeout',
        },
      ])
    );

    expect(screen.getByText('Something went wrong upstream.')).toBeInTheDocument();
    // Errored → bare DefaultTool marker, not an armed form.
    const marker = document.querySelector('[data-tool-name="show_form"][data-tool-state="error"]');
    expect(marker).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();

    // No answer is delivered for an already-errored call.
    await waitFor(() => {
      expect(onResolve).not.toHaveBeenCalled();
    });
  });

  it('an unknown host tool in the error state falls back to the DefaultTool marker without crashing the list', () => {
    renderParts(
      sdkMessage([
        { type: 'text', text: 'kept' },
        {
          type: 'tool-search_hotels',
          toolCallId: 'call_hotels',
          state: 'output-error',
          input: null,
          errorText: 'boom',
        },
      ])
    );
    expect(screen.getByText('kept')).toBeInTheDocument();
    const marker = document.querySelector(
      '[data-tool-name="search_hotels"][data-tool-state="error"]'
    );
    expect(marker).not.toBeNull();
    // Humanized label rendered.
    expect(marker).toHaveTextContent('Search hotels');
  });
});
