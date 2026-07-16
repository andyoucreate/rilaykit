import { ril, setLogSink } from '@rilaykit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
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
      {
        type: 'tool',
        toolCallId: 'tu_1',
        name: 'search_flights',
        state: 'ready',
        input: { from: 'CDG' },
      },
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

  it('prefers the native zod conversion over a manual inputJsonSchema when both are present', () => {
    const both = ril.create().tool('search_hotels', {
      description: 'Search hotels',
      inputSchema: z.object({ city: z.string().describe('IATA code') }),
      inputJsonSchema: { type: 'object', properties: { city: { type: 'string' } } },
    });
    expect(tools(both)[0].input_schema).toMatchObject({
      properties: { city: { type: 'string', description: 'IATA code' } },
    });
  });

  it('falls back to a manual inputJsonSchema for a non-zod Standard Schema', () => {
    const manual = ril.create().tool('custom', {
      description: 'Custom',
      inputSchema: {
        '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) },
      } as never,
      inputJsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
    } as never);
    expect(tools(manual)[0].input_schema).toEqual({
      type: 'object',
      properties: { q: { type: 'string' } },
    });
  });

  it('skips a tool whose schema cannot be converted rather than throwing', () => {
    const broken = ril.create().tool('broken', {
      description: 'Broken',
      inputSchema: {
        '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) },
      } as never,
    } as never);
    expect(tools(broken)).toEqual([]);
  });
});

// RED before the fix: tools() emitted definitions the Messages API rejects with
// a 400 — a non-object root input_schema, or a name outside the API's
// ^[a-zA-Z0-9_-]{1,64}$ pattern. One invalid tool must not sink the whole
// request: such tools are skipped and logged, same as a failed conversion.
describe('anthropic tools() — skips API-invalid definitions instead of 400-ing the request', () => {
  afterEach(() => setLogSink(null));

  function captureWarnings(): string[] {
    const warnings: string[] = [];
    setLogSink((level, scope, message) => {
      if (level === 'warn' && scope === 'agent:anthropic') warnings.push(message);
    });
    return warnings;
  }

  it('drops a tool whose converted input_schema is not a top-level object, and logs it', () => {
    const warnings = captureWarnings();
    const catalog = ril
      .create()
      .tool('valid_tool', { description: 'Valid', inputSchema: z.object({ q: z.string() }) })
      .tool('scalar_tool', { description: 'Root is a string', inputSchema: z.string() });

    expect(tools(catalog).map((tool) => tool.name)).toEqual(['valid_tool']);
    expect(warnings).toEqual([
      'Skipping tool "scalar_tool": converted input_schema has type "string" — the Messages API requires a top-level "object" schema',
    ]);
  });

  it('drops tools whose name violates the API pattern ^[a-zA-Z0-9_-]{1,64}$, and logs each', () => {
    const warnings = captureWarnings();
    const tooLong = `a${'b'.repeat(64)}`;
    const catalog = ril
      .create()
      .tool('valid_tool', { description: 'Valid', inputSchema: z.object({ q: z.string() }) })
      .tool('bad name', { description: 'Space', inputSchema: z.object({}) })
      .tool('bad.name', { description: 'Dot', inputSchema: z.object({}) })
      .tool(tooLong, { description: '65 chars', inputSchema: z.object({}) })
      .tool('mauvais_nom_é', { description: 'Unicode', inputSchema: z.object({}) });

    expect(tools(catalog).map((tool) => tool.name)).toEqual(['valid_tool']);
    expect(warnings).toEqual([
      'Skipping tool "bad name": name does not match the Anthropic tool-name pattern ^[a-zA-Z0-9_-]{1,64}$',
      'Skipping tool "bad.name": name does not match the Anthropic tool-name pattern ^[a-zA-Z0-9_-]{1,64}$',
      `Skipping tool "${tooLong}": name does not match the Anthropic tool-name pattern ^[a-zA-Z0-9_-]{1,64}$`,
      'Skipping tool "mauvais_nom_é": name does not match the Anthropic tool-name pattern ^[a-zA-Z0-9_-]{1,64}$',
    ]);
  });

  it('mixes all skip reasons in one catalog — exactly the valid tool survives', () => {
    const warnings = captureWarnings();
    const catalog = ril
      .create()
      .tool('valid_tool', { description: 'Valid', inputSchema: z.object({ q: z.string() }) })
      .tool('scalar_tool', { description: 'Root is a string', inputSchema: z.string() })
      .tool('bad name', { description: 'Space', inputSchema: z.object({}) });

    expect(tools(catalog).map((tool) => tool.name)).toEqual(['valid_tool']);
    expect(warnings).toHaveLength(2);
  });
});
