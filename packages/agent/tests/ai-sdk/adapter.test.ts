import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toParts, tools } from '../../src/ai-sdk';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .tool('search_flights', {
    description: 'Search flights',
    inputSchema: z.object({ from: z.string() }),
  })
  .tool('render_only', { description: 'Host executed' })
  .use(uiTools());

describe('ai-sdk toParts()', () => {
  it('maps every AI SDK state to a rilaykit state', () => {
    const message = {
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'tool-show_form', toolCallId: 'c1', state: 'input-streaming', input: { a: 1 } },
        { type: 'tool-show_form', toolCallId: 'c2', state: 'input-available', input: { a: 1 } },
        {
          type: 'tool-show_form',
          toolCallId: 'c3',
          state: 'output-available',
          input: {},
          output: { ok: true },
        },
        {
          type: 'tool-show_form',
          toolCallId: 'c4',
          state: 'output-error',
          input: {},
          errorText: 'boom',
        },
      ],
    };
    expect(toParts(message).map((p) => (p.type === 'tool' ? p.state : p.type))).toEqual([
      'text',
      'streaming',
      'ready',
      'done',
      'error',
    ]);
  });

  it("recovers the tool name from the AI SDK's `tool-${name}` type", () => {
    const parts = toParts({
      parts: [
        { type: 'tool-search_flights', toolCallId: 'c1', state: 'input-available', input: {} },
      ],
    });
    expect(parts[0]).toMatchObject({ type: 'tool', name: 'search_flights' });
  });

  it('carries output and errorText through', () => {
    const parts = toParts({
      parts: [
        { type: 'tool-x', toolCallId: 'c1', state: 'output-error', input: {}, errorText: 'boom' },
      ],
    });
    expect(parts[0]).toMatchObject({ errorText: 'boom', state: 'error' });
  });

  it('maps a `data-${name}` part to a DataPart carrying its payload', () => {
    const parts = toParts({ parts: [{ type: 'data-usage', data: { tokens: 12 } }] });
    expect(parts).toEqual([{ type: 'data', name: 'usage', data: { tokens: 12 } }]);
  });

  it('marks a still-streaming text part `streaming`, a settled one `done`', () => {
    const parts = toParts({
      parts: [
        { type: 'text', text: 'partial', state: 'streaming' },
        { type: 'text', text: 'whole' },
      ],
    });
    expect(parts).toEqual([
      { type: 'text', text: 'partial', state: 'streaming' },
      { type: 'text', text: 'whole', state: 'done' },
    ]);
  });

  it('normalizes a missing tool input to {} — renderers never see undefined', () => {
    const parts = toParts({
      parts: [{ type: 'tool-show_form', toolCallId: 'c1', state: 'input-available' }],
    });
    expect(parts[0]).toMatchObject({ type: 'tool', input: {} });
  });

  it('skips a tool part with an unmapped state or a missing toolCallId', () => {
    expect(
      toParts({
        parts: [
          { type: 'tool-x', toolCallId: 'c1', state: 'weird-state', input: {} },
          { type: 'tool-x', state: 'input-available', input: {} },
        ],
      })
    ).toEqual([]);
  });

  it('ignores unknown part types rather than crashing', () => {
    expect(toParts({ parts: [{ type: 'reasoning', text: 'hmm' }] })).toEqual([]);
  });

  it('handles a message with no parts', () => {
    expect(toParts({})).toEqual([]);
  });

  it('skips null and undefined slots in the parts array rather than throwing', () => {
    expect(toParts({ parts: [null, undefined, { type: 'text', text: 'ok' }] })).toEqual([
      { type: 'text', text: 'ok', state: 'done' },
    ]);
  });
});

describe('ai-sdk tools()', () => {
  const generated = tools(catalog);

  it("emits UI tools WITHOUT execute — the SDK's native HITL pattern", () => {
    expect(generated.show_form).toBeDefined();
    expect((generated.show_form as { execute?: unknown }).execute).toBeUndefined();
  });

  it('passes zod schemas through untouched', () => {
    expect((generated.search_flights as { inputSchema: unknown }).inputSchema).toBe(
      catalog.getTool('search_flights')?.inputSchema
    );
  });

  it("EXCLUDES renderer-only tools — a tool without inputSchema is not the agent's to call", () => {
    expect(generated.render_only).toBeUndefined();
  });

  it('carries descriptions so the model knows what each tool does', () => {
    expect((generated.search_flights as { description: string }).description).toBe(
      'Search flights'
    );
  });

  it('survives a tool named __proto__ as an OWN property', () => {
    const hostile = ril
      .create()
      .tool('__proto__', { description: 'Hostile', inputSchema: z.object({}) });
    const result = tools(hostile);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});
