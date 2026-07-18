import { uiTools } from '@rilaykit/agent';
import { toParts } from '@rilaykit/agent/ai-sdk';
import { Catalog, Parts } from '@rilaykit/agent/react';
import { ril } from '@rilaykit/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The REAL installed AI SDK (ai@5.0.215): the conversation fixtures are typed
// against the SDK's own `UIMessage`/`UIMessagePart`, and the host's in-place
// tool-result update (`settleTool`) is gated by the SDK's own `isToolUIPart`
// guard — the same shapes a real `useChat` transcript carries turn after turn.
import { type UIMessage, type UIMessagePart, type UITools, isToolUIPart } from 'ai';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * MULTI-TURN agentic-conversation harness — the real production UX, not a single
 * emission. An assistant emits UI (a `show_form`, a `show_flow`, a `data-*`
 * receipt), the human resolves it, the HOST appends the tool OUTPUT to that
 * message AND a fresh assistant message (the next turn), and the loop repeats —
 * exactly what an `ai` `useChat` + `addToolResult` product does. The message list
 * GROWS across turns; earlier turns must stay settled (not re-armed, not
 * re-resolvable), each turn's resolve stays isolated by `toolCallId`, and the
 * whole transcript renders coherently as one `<Parts>`-per-message layout.
 *
 * Nothing of the agent layer is mocked: real catalog, real built-in HITL
 * renderers (ShowForm / ShowFlow / DefaultTool), real forms/workflow engines,
 * real RTL interaction. Only the model side is literal `ai@5` wire JSON, and the
 * "host" is a tiny stateful reducer standing in for the app's `addToolResult`
 * mirror. Every assertion pins what the USER SEES or the EXACT
 * `onResolve(toolCallId, output, toolName)` payload.
 */

// =============================================================================
// The catalog: one text input, the assistant's prose (`part:text`), a receipt
// renderer (`part:data`), and the three UI tools via their shipped built-ins.
// =============================================================================

type MsgPart = UIMessagePart<Record<string, unknown>, UITools>;

const catalog = ril
  .create()
  .component('text', {
    description: 'Single-line text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ id, props, field }) => {
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
    },
  })
  // Text parts render null without a registered renderer — the known footgun.
  .part('text', {
    renderer: ({ part }: { part: { text?: string } }) => <p>{part.text}</p>,
  })
  // A `data-receipt` part dispatches on `part.type === 'data'`; the discriminator
  // is `part.name`. The host owns the chrome — the agent ships no default.
  .part('data', {
    renderer: ({ part }: { part: { name?: string; data?: unknown } }) => {
      const data = (part.data ?? {}) as { ref?: unknown; holder?: unknown };
      return (
        <div data-receipt data-receipt-name={part.name} data-receipt-ref={String(data.ref ?? '')}>
          Receipt {String(data.ref ?? '')} for {String(data.holder ?? '')}
        </div>
      );
    },
  })
  .use(uiTools());

// =============================================================================
// Wire-shape builders — literal `ai@5` UIMessage parts, one per tool state.
// =============================================================================

function message(id: string, role: 'assistant' | 'user', parts: MsgPart[]): UIMessage {
  return { id, role, parts } satisfies UIMessage;
}

function text(value: string): MsgPart {
  return { type: 'text', text: value, state: 'done' };
}

function readyForm(toolCallId: string, schema: unknown): MsgPart {
  return { type: 'tool-show_form', toolCallId, state: 'input-available', input: { schema } };
}

function streamingForm(toolCallId: string, schema: unknown): MsgPart {
  return { type: 'tool-show_form', toolCallId, state: 'input-streaming', input: { schema } };
}

function doneForm(toolCallId: string, schema: unknown, output: unknown): MsgPart {
  return {
    type: 'tool-show_form',
    toolCallId,
    state: 'output-available',
    input: { schema },
    output,
  };
}

function readyFlow(toolCallId: string, schema: unknown): MsgPart {
  return { type: 'tool-show_flow', toolCallId, state: 'input-available', input: { schema } };
}

function receipt(data: unknown): MsgPart {
  return { type: 'data-receipt', data } as MsgPart;
}

/** A single required text field — submit is gate-able and the value round-trips. */
function oneField(formId: string, fieldId: string, label: string): unknown {
  return { id: formId, fields: [{ id: fieldId, type: 'text', props: { label } }] };
}

// =============================================================================
// The host — a stateful `addToolResult` mirror. On every resolve it (a) settles
// the tool in place (state → output-available, carrying the resolved output) and
// (b) hands the message list to a scenario `advance` that decides the next turn.
// =============================================================================

interface ResolveEvent {
  readonly toolCallId: string;
  readonly output: unknown;
  readonly toolName: string;
}

type Advance = (messages: UIMessage[], event: ResolveEvent) => UIMessage[];

/** In-place settle, keyed by `toolCallId`, gated by the SDK's own tool guard —
 * exactly `addToolResult`: the tool part becomes `output-available`, everything
 * else in the transcript is untouched. */
function settleTool(msg: UIMessage, toolCallId: string, output: unknown): UIMessage {
  return {
    ...msg,
    parts: msg.parts.map((part) =>
      isToolUIPart(part) && part.toolCallId === toolCallId
        ? { ...part, state: 'output-available', output }
        : part
    ),
  } as UIMessage;
}

function allToolsSettled(messages: UIMessage[]): boolean {
  const toolParts = messages.flatMap((m) => m.parts).filter(isToolUIPart);
  return toolParts.length > 0 && toolParts.every((p) => p.state === 'output-available');
}

/** One `<Parts>` per message — the coherent transcript layout. */
function Conversation({
  initial,
  advance,
  onResolve,
}: {
  readonly initial: UIMessage[];
  readonly advance: Advance;
  readonly onResolve: (toolCallId: string, output: unknown, toolName: string) => void;
}) {
  const [messages, setMessages] = useState<UIMessage[]>(initial);
  const handleResolve = useCallback(
    (toolCallId: string, output: unknown, toolName: string) => {
      onResolve(toolCallId, output, toolName);
      setMessages((prev) => advance(prev, { toolCallId, output, toolName }));
    },
    [advance, onResolve]
  );

  return (
    <Catalog value={catalog}>
      {messages.map((m) => (
        <section key={m.id} data-message={m.id} data-role={m.role}>
          <Parts parts={toParts(m)} onResolve={handleResolve} />
        </section>
      ))}
    </Catalog>
  );
}

/** Presentational transcript (no host state) for snapshot-driven scenarios. */
function Transcript({
  messages,
  onResolve,
}: {
  readonly messages: UIMessage[];
  readonly onResolve: (toolCallId: string, output: unknown, toolName: string) => void;
}) {
  return (
    <Catalog value={catalog}>
      {messages.map((m) => (
        <section key={m.id} data-message={m.id} data-role={m.role}>
          <Parts parts={toParts(m)} onResolve={onResolve} />
        </section>
      ))}
    </Catalog>
  );
}

const sectionOf = (id: string) =>
  document.querySelector(`[data-message="${id}"]`) as HTMLElement | null;

const settledMarker = (id: string, name: string, state: string) =>
  sectionOf(id)?.querySelector(`[data-tool-name="${name}"][data-tool-state="${state}"]`) ?? null;

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 1. The three-turn spine: show_form → (resolve) → show_flow → (resolve) →
//    text + data receipt. Prior turns settle; resolves stay isolated by id.
// =============================================================================

describe('a three-turn KYC/booking conversation', () => {
  it('form → flow → receipt: each turn renders as the last settles, resolves stay id-isolated, and no prior turn re-arms', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    const turn2 = message('m2', 'assistant', [
      text('Thanks Ada — now verify your identity.'),
      readyFlow('call_verify', {
        id: 'kyc-flow',
        name: 'Identity verification',
        steps: [
          {
            id: 'identity',
            title: 'Identity',
            form: {
              id: 'identity',
              fields: [{ id: 'idNumber', type: 'text', props: { label: 'ID number' } }],
            },
          },
          {
            id: 'residence',
            title: 'Residence',
            form: {
              id: 'residence',
              fields: [{ id: 'address', type: 'text', props: { label: 'Home address' } }],
            },
          },
        ],
      }),
    ]);

    const turn3 = message('m3', 'assistant', [
      text('All set — your booking is confirmed.'),
      receipt({ ref: 'BK-2026-14C', holder: 'Ada Lovelace' }),
    ]);

    const advance: Advance = (messages, e) => {
      const settled = messages.map((m) => settleTool(m, e.toolCallId, e.output));
      if (e.toolCallId === 'call_kyc') return [...settled, turn2];
      if (e.toolCallId === 'call_verify') return [...settled, turn3];
      return settled;
    };

    render(
      <Conversation
        initial={[
          message('m1', 'assistant', [
            text('Welcome! I need a few details to get started.'),
            readyForm('call_kyc', {
              id: 'contact',
              fields: [
                { id: 'name', type: 'text', props: { label: 'Full name' } },
                { id: 'email', type: 'text', props: { label: 'Email' } },
              ],
            }),
          ]),
        ]}
        advance={advance}
        onResolve={onResolve}
      />
    );

    // -- TURN 1 -------------------------------------------------------------
    expect(screen.getByText('Welcome! I need a few details to get started.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@calc.dev');
    await user.click(
      within(sectionOf('m1') as HTMLElement).getByRole('button', { name: 'Submit' })
    );

    // Exactly one resolve so far — the turn-1 form's engine-validated values.
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenNthCalledWith(
      1,
      'call_kyc',
      { status: 'submitted', values: { name: 'Ada Lovelace', email: 'ada@calc.dev' } },
      'show_form'
    );

    // Turn 1 is now SETTLED: bare done marker, no live form.
    await waitFor(() => expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull());
    expect(
      within(sectionOf('m1') as HTMLElement).queryByRole('button', { name: 'Submit' })
    ).toBeNull();

    // -- TURN 2 -------------------------------------------------------------
    // The next assistant turn appeared and mounted its flow.
    expect(screen.getByText('Thanks Ada — now verify your identity.')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('ID number'), 'AB1234');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(await screen.findByLabelText('Home address'), '10 Downing St');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    // Resolve ISOLATION: resolving turn 2 fired the flow's id, NOT turn 1's again.
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_verify',
      {
        status: 'submitted',
        values: { identity: { idNumber: 'AB1234' }, residence: { address: '10 Downing St' } },
      },
      'show_flow'
    );
    // call_kyc was answered exactly once across the whole conversation.
    expect(onResolve.mock.calls.filter((c) => c[0] === 'call_kyc')).toHaveLength(1);

    // Turn 2 now settled too; turn 1 STILL settled (the growing list didn't re-arm it).
    await waitFor(() => expect(settledMarker('m2', 'show_flow', 'done')).not.toBeNull());
    expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull();

    // -- TURN 3 -------------------------------------------------------------
    expect(screen.getByText('All set — your booking is confirmed.')).toBeInTheDocument();
    const receiptEl = document.querySelector('[data-receipt]') as HTMLElement;
    expect(receiptEl).not.toBeNull();
    expect(receiptEl).toHaveAttribute('data-receipt-name', 'receipt');
    expect(receiptEl).toHaveAttribute('data-receipt-ref', 'BK-2026-14C');
    expect(receiptEl).toHaveTextContent('Receipt BK-2026-14C for Ada Lovelace');

    // COHERENT TRANSCRIPT: three messages, in order; no live Submit anywhere —
    // every interactive turn is settled, text/tool/data interleave as authored.
    const sections = Array.from(document.querySelectorAll('[data-message]')).map((s) =>
      s.getAttribute('data-message')
    );
    expect(sections).toEqual(['m1', 'm2', 'm3']);
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    // The one-shot latch held across every re-render as the list grew from 1 → 3.
    expect(onResolve).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// 2. Concurrency WITHIN a turn: two show_forms, distinct ids. Resolve in either
//    order; each settles independently; the turn only advances when BOTH settle.
// =============================================================================

describe('two concurrent tool calls in one turn', () => {
  it('resolves independently in reverse order; the conversation advances only after the host sees both', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    const confirmation = message('m2', 'assistant', [text('Both captured — thank you.')]);

    const advance: Advance = (messages, e) => {
      const settled = messages.map((m) => settleTool(m, e.toolCallId, e.output));
      return allToolsSettled(settled) ? [...settled, confirmation] : settled;
    };

    render(
      <Conversation
        initial={[
          message('m1', 'assistant', [
            text('I need two things at once.'),
            readyForm('call_alpha', oneField('alpha', 'alphaValue', 'Alpha field')),
            readyForm('call_beta', oneField('beta', 'betaValue', 'Beta field')),
          ]),
        ]}
        advance={advance}
        onResolve={onResolve}
      />
    );

    await user.type(await screen.findByLabelText('Alpha field'), 'A-value');
    await user.type(await screen.findByLabelText('Beta field'), 'B-value');

    const submits = screen.getAllByRole('button', { name: 'Submit' });
    expect(submits).toHaveLength(2);

    // Resolve BETA first — order independence.
    await user.click(submits[1]);
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenNthCalledWith(
      1,
      'call_beta',
      { status: 'submitted', values: { betaValue: 'B-value' } },
      'show_form'
    );

    // Beta settled; ALPHA is untouched — still a live form with its typed value,
    // and the turn has NOT advanced (no confirmation yet).
    await waitFor(() => expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull());
    expect((screen.getByLabelText('Alpha field') as HTMLInputElement).value).toBe('A-value');
    expect(screen.queryByText('Both captured — thank you.')).toBeNull();
    expect(sectionOf('m2')).toBeNull();

    // Now resolve ALPHA — the host sees both settled and appends the next turn.
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_alpha',
      { status: 'submitted', values: { alphaValue: 'A-value' } },
      'show_form'
    );
    expect(await screen.findByText('Both captured — thank you.')).toBeInTheDocument();
  });
});

// =============================================================================
// 3. Error-recovery turn: a resolved value the "server" rejects → the assistant
//    re-asks on a NEW toolCallId. The failed attempt stays settled; the new call
//    is independently resolvable.
// =============================================================================

describe('server-side rejection drives a corrected re-ask on a new turn', () => {
  it('the failed attempt settles; a fresh show_form on a new toolCallId resolves independently', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    const retry = message('m2', 'assistant', [
      text('That ID number was not recognised — please re-enter it.'),
      readyForm('call_id_v2', oneField('id-retry', 'idNumber', 'ID number (retry)')),
    ]);

    const advance: Advance = (messages, e) => {
      const settled = messages.map((m) => settleTool(m, e.toolCallId, e.output));
      // The FIRST attempt is engine-valid but the server rejects it — re-ask on a
      // new call. The second attempt is accepted (terminal).
      return e.toolCallId === 'call_id_v1' ? [...settled, retry] : settled;
    };

    render(
      <Conversation
        initial={[
          message('m1', 'assistant', [
            text('What is your government ID number?'),
            readyForm('call_id_v1', oneField('id', 'idNumber', 'ID number')),
          ]),
        ]}
        advance={advance}
        onResolve={onResolve}
      />
    );

    // First attempt: a well-formed value that the server will reject.
    await user.type(await screen.findByLabelText('ID number'), 'BADID');
    await user.click(
      within(sectionOf('m1') as HTMLElement).getByRole('button', { name: 'Submit' })
    );

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenNthCalledWith(
      1,
      'call_id_v1',
      { status: 'submitted', values: { idNumber: 'BADID' } },
      'show_form'
    );

    // The failed attempt is SETTLED — a bare marker, not a re-armed form.
    await waitFor(() => expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull());
    expect(
      within(sectionOf('m1') as HTMLElement).queryByRole('button', { name: 'Submit' })
    ).toBeNull();

    // The re-ask mounts on a NEW toolCallId and is independently resolvable.
    expect(
      screen.getByText('That ID number was not recognised — please re-enter it.')
    ).toBeInTheDocument();
    await user.type(await screen.findByLabelText('ID number (retry)'), 'AB1234');
    await user.click(
      within(sectionOf('m2') as HTMLElement).getByRole('button', { name: 'Submit' })
    );

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(2));
    expect(onResolve).toHaveBeenNthCalledWith(
      2,
      'call_id_v2',
      { status: 'submitted', values: { idNumber: 'AB1234' } },
      'show_form'
    );
    // The first call was never re-fired by the second turn's activity.
    expect(onResolve.mock.calls.filter((c) => c[0] === 'call_id_v1')).toHaveLength(1);
  });
});

// =============================================================================
// 4. Streaming the latest turn: input-streaming → input-available →
//    output-available. Submit is locked while streaming, unlocks at ready, and
//    an EARLIER settled turn is never disturbed. Same toolCallId updates in
//    place — the typed value survives the stream (no duplicate, no lost input).
// =============================================================================

describe('streaming the latest turn beside an already-settled one', () => {
  it('locks submit while streaming, unlocks at ready keeping typed input, settles at done — the prior turn stays put', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const schema = oneField('seat', 'seat', 'Seat number');

    // A prior, already-answered turn sits above the streaming one for the whole run.
    const priorTurn = message('m1', 'assistant', [
      text('Your name is on file.'),
      doneForm('call_prior', oneField('name', 'name', 'Prior name'), {
        status: 'submitted',
        values: { name: 'Ada Lovelace' },
      }),
    ]);

    const withStream = (streamPart: MsgPart) => [
      priorTurn,
      message('m2', 'assistant', [text('Now pick your seat.'), streamPart]),
    ];

    const view = render(
      <Transcript
        messages={withStream(streamingForm('call_stream', schema))}
        onResolve={onResolve}
      />
    );

    // Prior turn is settled from the very first paint and stays that way.
    expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull();
    expect(
      within(sectionOf('m1') as HTMLElement).queryByRole('button', { name: 'Submit' })
    ).toBeNull();

    // STREAMING: the field is live (the user may start typing) but Submit is LOCKED
    // — the model must not get an answer to a question it hasn't finished asking.
    const seatInput = await screen.findByLabelText('Seat number');
    await user.type(seatInput, '14C');
    expect(
      within(sectionOf('m2') as HTMLElement).getByRole('button', { name: 'Submit' })
    ).toBeDisabled();
    expect(onResolve).not.toHaveBeenCalled();

    // READY on the SAME toolCallId: updates IN PLACE — typed value survives, unlocks.
    view.rerender(
      <Transcript messages={withStream(readyForm('call_stream', schema))} onResolve={onResolve} />
    );
    const readyInput = await screen.findByLabelText('Seat number');
    expect((readyInput as HTMLInputElement).value).toBe('14C');
    // Exactly one seat field — the re-emission updated, it did not duplicate.
    expect(screen.getAllByLabelText('Seat number')).toHaveLength(1);
    const submit = within(sectionOf('m2') as HTMLElement).getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_stream',
        { status: 'submitted', values: { seat: '14C' } },
        'show_form'
      )
    );
    // The earlier turn never resolved as a side effect of the streaming one.
    expect(onResolve.mock.calls.some((c) => c[0] === 'call_prior')).toBe(false);

    // DONE: a rehydrated output-available re-emission must NOT re-arm — bare marker,
    // no second resolve, and the prior turn is still exactly where it was.
    view.rerender(
      <Transcript
        messages={withStream(
          doneForm('call_stream', schema, { status: 'submitted', values: { seat: '14C' } })
        )}
        onResolve={onResolve}
      />
    );
    await waitFor(() => expect(settledMarker('m2', 'show_form', 'done')).not.toBeNull());
    expect(
      within(sectionOf('m2') as HTMLElement).queryByRole('button', { name: 'Submit' })
    ).toBeNull();
    expect(settledMarker('m1', 'show_form', 'done')).not.toBeNull();
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
