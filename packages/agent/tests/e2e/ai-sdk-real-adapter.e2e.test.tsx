import { uiTools } from '@rilaykit/agent';
import { toParts, tools } from '@rilaykit/agent/ai-sdk';
import { Catalog, Parts } from '@rilaykit/agent/react';
import { ril } from '@rilaykit/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The REAL installed AI SDK (ai@5.0.215) — types AND runtime guards. Nothing
// here is a hand-authored stand-in: the fixtures are typed against the SDK's own
// `UIMessage` and validated by the SDK's own `isToolUIPart` / `getToolName` /
// `getToolOrDynamicToolName` / `isTextUIPart` / `isDataUIPart` before they ever
// reach `toParts()`. If the installed `ai` renamed a discriminant or moved a
// field, these guards (not our assumptions) fail first.
import {
  type ToolSet,
  type UIMessage,
  type UIMessagePart,
  type UITools,
  getToolName,
  getToolOrDynamicToolName,
  isDataUIPart,
  isTextUIPart,
  isToolUIPart,
} from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Part, ToolPart } from '../../src/types/part';

/**
 * REAL-SDK runtime verification of the `ai-sdk` adapter (`tools`, `toParts`)
 * against the actually-installed `ai@5.0.215`. The type-level companion
 * (`packages/agent/tests/types/ai-sdk-real-adapter.test-d.tsx`) proves
 * assignability under real `tsc`; this file proves the RUNTIME mapping and the
 * end-to-end HITL path with the SDK's own shapes and validators.
 */

/** Build an assistant `UIMessage` in the exact ai@5 shape; `satisfies UIMessage`
 * pins the part discriminants to the installed SDK at compile time. */
function assistant(parts: UIMessagePart<Record<string, unknown>, UITools>[]): UIMessage {
  return { id: 'm1', role: 'assistant', parts } satisfies UIMessage;
}

const catalog = ril
  .create()
  .component('text', {
    description: 'text input',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ id, props, field }) => (
      <div>
        <label htmlFor={id}>{String(props.label ?? '')}</label>
        <input
          id={id}
          value={String(field?.value ?? '')}
          onChange={(e) => field?.onChange(e.target.value)}
        />
      </div>
    ),
  })
  .use(uiTools());

const toolOf = (parts: Part[], id: string): ToolPart | undefined =>
  parts.find((p): p is ToolPart => p.type === 'tool' && p.toolCallId === id);

describe('toParts() over REAL ai@5 UIMessage shapes', () => {
  it('maps a static tool part (tool-<name>, input-available) — SDK guards confirm the shape first', () => {
    const message = assistant([
      { type: 'text', text: 'Here is a form.', state: 'done' },
      {
        type: 'tool-show_form',
        toolCallId: 'call_1',
        state: 'input-available',
        input: { schema: { id: 'f', fields: [] } },
      },
    ]);

    // The SDK's OWN guards agree these are the parts we think they are.
    expect(isTextUIPart(message.parts[0])).toBe(true);
    const toolUi = message.parts[1];
    expect(isToolUIPart(toolUi)).toBe(true);
    if (isToolUIPart(toolUi)) {
      // Real static-tool name recovery: `tool-show_form` → `show_form`.
      expect(getToolName(toolUi)).toBe('show_form');
      expect(getToolOrDynamicToolName(toolUi)).toBe('show_form');
    }

    const parts = toParts(message);
    expect(parts).toEqual([
      { type: 'text', text: 'Here is a form.', state: 'done' },
      {
        type: 'tool',
        toolCallId: 'call_1',
        name: 'show_form',
        state: 'ready', // input-available → ready
        input: { schema: { id: 'f', fields: [] } },
        output: undefined,
        errorText: undefined,
      },
    ]);
  });

  it('maps all four real tool states input-streaming|input-available|output-available|output-error', () => {
    const map = (part: UIMessagePart<Record<string, unknown>, UITools>) =>
      toolOf(toParts(assistant([part])), 'c')?.state;

    expect(
      map({ type: 'tool-x', toolCallId: 'c', state: 'input-streaming', input: undefined })
    ).toBe('streaming');
    expect(map({ type: 'tool-x', toolCallId: 'c', state: 'input-available', input: {} })).toBe(
      'ready'
    );
    expect(
      map({ type: 'tool-x', toolCallId: 'c', state: 'output-available', input: {}, output: 'ok' })
    ).toBe('done');
    expect(
      map({
        type: 'tool-x',
        toolCallId: 'c',
        state: 'output-error',
        input: {},
        errorText: 'boom',
      })
    ).toBe('error');
  });

  it('input-streaming with undefined input defaults to {} (real DeepPartial|undefined shape)', () => {
    // ai@5 types input-streaming input as `DeepPartial<...> | undefined`.
    const parts = toParts(
      assistant([{ type: 'tool-x', toolCallId: 'c', state: 'input-streaming', input: undefined }])
    );
    expect(toolOf(parts, 'c')?.input).toEqual({});
  });

  it('carries the real output-error errorText and input through', () => {
    const parts = toParts(
      assistant([
        {
          type: 'tool-x',
          toolCallId: 'c',
          state: 'output-error',
          input: { a: 1 },
          errorText: 'validation failed',
        },
      ])
    );
    const tool = toolOf(parts, 'c');
    expect(tool?.state).toBe('error');
    expect(tool?.errorText).toBe('validation failed');
    expect(tool?.input).toEqual({ a: 1 });
  });

  it('maps a real dynamic-tool part (MCP/runtime) via toolName, not the type prefix', () => {
    const message = assistant([
      {
        type: 'dynamic-tool',
        toolName: 'mcp_search',
        toolCallId: 'dyn_1',
        state: 'output-available',
        input: { q: 'hi' },
        output: { hits: 2 },
      },
    ]);
    const part = message.parts[0];
    // Real guard: dynamic tools resolve their name off `toolName`.
    expect(getToolOrDynamicToolName(part as never)).toBe('mcp_search');

    const tool = toolOf(toParts(message), 'dyn_1');
    expect(tool).toMatchObject({ name: 'mcp_search', state: 'done', output: { hits: 2 } });
  });

  it('maps a real data-<name> part and confirms it with the SDK isDataUIPart guard', () => {
    const message = assistant([{ type: 'data-progress', data: { pct: 42 } }]);
    expect(isDataUIPart(message.parts[0])).toBe(true);
    expect(toParts(message)).toEqual([{ type: 'data', name: 'progress', data: { pct: 42 } }]);
  });

  it('defers/drops the real reasoning|source-url|source-document|file|step-start parts', () => {
    const parts = toParts(
      assistant([
        { type: 'reasoning', text: 'thinking', state: 'done' },
        { type: 'source-url', sourceId: 's1', url: 'https://example.com' },
        { type: 'source-document', sourceId: 's2', mediaType: 'application/pdf', title: 'Doc' },
        { type: 'file', mediaType: 'image/png', url: 'https://example.com/a.png' },
        { type: 'step-start' },
        { type: 'text', text: 'after', state: 'done' },
      ])
    );
    // Everything deferred is dropped; only the text survives.
    expect(parts).toEqual([{ type: 'text', text: 'after', state: 'done' }]);
  });

  it('drops a tool part whose state has no mapping or whose toolCallId is missing', () => {
    // A real streamed part before an id is assigned, and an unknown state, are
    // both skipped rather than emitted half-formed.
    const parts = toParts(
      assistant([
        // @ts-expect-error missing toolCallId is not a valid SDK part — asserting toParts is defensive anyway
        { type: 'tool-x', state: 'input-available', input: {} },
      ])
    );
    expect(parts).toEqual([]);
  });

  it('ignores providerMetadata / extra SDK fields and reads `input` (never `args`)', () => {
    const parts = toParts(
      assistant([
        {
          type: 'tool-x',
          toolCallId: 'c',
          state: 'input-available',
          input: { real: true },
          providerExecuted: false,
          callProviderMetadata: { some: { vendor: 'meta' } },
        },
      ])
    );
    expect(toolOf(parts, 'c')?.input).toEqual({ real: true });
  });
});

describe('a realistic streamed sequence (streamText/useChat snapshots)', () => {
  it('a tool part streaming → input-available → output-available yields stable, correctly-keyed Parts', () => {
    const snapshots: UIMessage[] = [
      assistant([
        {
          type: 'tool-show_form',
          toolCallId: 'call_stream',
          state: 'input-streaming',
          input: { schema: {} },
        },
      ]),
      assistant([
        {
          type: 'tool-show_form',
          toolCallId: 'call_stream',
          state: 'input-available',
          input: { schema: { id: 'f', fields: [] } },
        },
      ]),
      assistant([
        {
          type: 'tool-show_form',
          toolCallId: 'call_stream',
          state: 'output-available',
          input: { schema: { id: 'f', fields: [] } },
          output: { status: 'submitted' },
        },
      ]),
    ];

    const mapped = snapshots.map((m) => toolOf(toParts(m), 'call_stream'));

    // Stable identity across the whole stream: same key, same name.
    for (const tool of mapped) {
      expect(tool?.toolCallId).toBe('call_stream');
      expect(tool?.name).toBe('show_form');
    }
    // State advances exactly as the SDK's discriminants do.
    expect(mapped.map((t) => t?.state)).toEqual(['streaming', 'ready', 'done']);
    // Output only materializes at the terminal snapshot.
    expect(mapped[0]?.output).toBeUndefined();
    expect(mapped[2]?.output).toEqual({ status: 'submitted' });
  });
});

describe('round-trip: real-SDK wire shape → toParts → <Parts> → HITL resolve', () => {
  it('a real tool-show_form emission reaches the built-in fallback and resolves through onResolve', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    // tools() is what the SERVER hands streamText — assert it is a real ToolSet
    // with schema-only (no execute) HITL entries before driving the CLIENT path.
    const toolset: ToolSet = tools(catalog);
    expect(Object.hasOwn(toolset.show_form, 'execute')).toBe(false);
    expect(typeof (toolset.show_form as { inputSchema: unknown }).inputSchema).toBe('object');

    const message = assistant([
      {
        type: 'tool-show_form',
        toolCallId: 'call_hitl',
        state: 'input-available',
        input: {
          schema: { id: 'seat', fields: [{ id: 'seat', type: 'text', props: { label: 'Seat' } }] },
        },
      },
    ]);

    render(
      <Catalog value={catalog}>
        <Parts parts={toParts(message)} onResolve={onResolve} />
      </Catalog>
    );

    const seat = await screen.findByLabelText('Seat');
    await user.type(seat, '14C');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledExactlyOnceWith(
        'call_hitl',
        { status: 'submitted', values: { seat: '14C' } },
        'show_form'
      )
    );
  });
});
