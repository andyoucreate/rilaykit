import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { toParts, tools } from '../../src/anthropic';

const catalog = ril
  .create()
  .tool('search_flights', {
    description: 'Search flights',
    inputSchema: z.object({ from: z.string().describe('IATA code') }),
  })
  .tool('render_only', { description: 'Host executed' });

describe('anthropic toParts()', () => {
  it('maps text and tool_use blocks', () => {
    const message = {
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 'tu_1', name: 'search_flights', input: { from: 'CDG' } },
      ],
    };
    expect(toParts(message)).toEqual([
      { type: 'text', text: 'hello', state: 'done' },
      { type: 'tool', toolCallId: 'tu_1', name: 'search_flights', state: 'ready', input: { from: 'CDG' } },
    ]);
  });

  it('ignores block types it does not model', () => {
    expect(toParts({ content: [{ type: 'thinking', thinking: 'hmm' }] })).toEqual([]);
  });

  it('handles a message with no content', () => {
    expect(toParts({})).toEqual([]);
  });

  it('never throws on garbage input', () => {
    expect(toParts(null)).toEqual([]);
    expect(toParts(undefined)).toEqual([]);
    expect(toParts('not a message')).toEqual([]);
    expect(toParts(42)).toEqual([]);
  });

  it('skips null and undefined slots in the content array rather than throwing', () => {
    expect(toParts({ content: [null, undefined, { type: 'text', text: 'ok' }] })).toEqual([
      { type: 'text', text: 'ok', state: 'done' },
    ]);
  });
});

describe('anthropic tools()', () => {
  it('emits { name, description, input_schema } via native z.toJSONSchema()', () => {
    const [tool] = tools(catalog);
    expect(tool.name).toBe('search_flights');
    expect(tool.description).toBe('Search flights');
    expect(tool.input_schema).toMatchObject({
      type: 'object',
      properties: { from: { type: 'string', description: 'IATA code' } },
    });
  });

  it('excludes renderer-only tools', () => {
    expect(tools(catalog).map((t) => t.name)).toEqual(['search_flights']);
  });

  it('falls back to a manual inputJsonSchema for a non-zod Standard Schema', () => {
    const manual = ril.create().tool('custom', {
      description: 'Custom',
      inputSchema: { '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) } } as never,
      inputJsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
    } as never);
    expect(tools(manual)[0].input_schema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });

  it('skips a tool whose schema cannot be converted rather than throwing', () => {
    const broken = ril.create().tool('broken', {
      description: 'Broken',
      inputSchema: { '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) } } as never,
    } as never);
    expect(tools(broken)).toEqual([]);
  });
});
