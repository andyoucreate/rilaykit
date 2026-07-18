import type Anthropic from '@anthropic-ai/sdk';
import { uiTools } from '@rilaykit/agent';
import { type AnthropicToolDefinition, toParts, tools } from '@rilaykit/agent/anthropic';
import { Catalog, Parts } from '@rilaykit/agent/react';
import { type LogLevel, ril, setLogSink } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Part, ToolPart } from '../../src/types/part';

/**
 * REAL-SDK runtime verification of the `anthropic` adapter (`tools`, `toParts`)
 * against the actually-installed `@anthropic-ai/sdk` (0.112.1). Nothing here is a
 * hand-authored stand-in for the SDK: every message content block is typed with
 * `satisfies Anthropic.TextBlock` / `satisfies Anthropic.ToolUseBlock` /
 * `satisfies Anthropic.ContentBlock` against the SDK's own definitions, so if the
 * installed SDK renamed a discriminant (`tool_use`), moved the model's arguments
 * off `input`, or dropped a required field (`caller`, `citations`), THIS file's
 * fixtures fail to compile — the SDK's types, not our assumptions, gate the test.
 *
 * The type-level companion (`packages/agent/tests/types/anthropic-real-adapter.test-d.tsx`)
 * proves `tools()` is assignable to `Anthropic.Tool[]` with no cast under real
 * `tsc`; this file proves the RUNTIME mapping and the end-to-end HITL path with
 * the SDK's own block shapes.
 *
 * NOTE ON PLACEMENT: this file lives under `packages/agent/tests/` (not repo-root
 * `tests/e2e`) precisely so `@anthropic-ai/sdk` resolves through
 * `packages/agent/node_modules`, mirroring the sibling `ai-sdk-real-adapter.*`.
 */

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

/** Real SDK caller stub shared by tool_use fixtures (0.112.1 made `caller` required). */
const direct = { type: 'direct' } satisfies Anthropic.DirectCaller;

/** The shared provider tool-name gate (`^[a-zA-Z0-9_-]{1,64}$`). */
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ============================================================================
// 1. tools(catalog) → real Anthropic.Tool[] (runtime shape + no-cast binding)
// ============================================================================

describe('tools() → real Anthropic.Tool[] wire shape', () => {
  it('every entry is a valid Anthropic.Tool: name + input_schema with literal type:"object"', () => {
    // The no-cast binding is the SERVER line: `messages.create({ tools })`.
    const asTools: Anthropic.Tool[] = tools(catalog);
    expect(asTools.length).toBeGreaterThan(0);

    const byName = Object.fromEntries(asTools.map((t) => [t.name, t]));
    // uiTools() registers show_form / show_flow / show_component — all emittable.
    expect(Object.keys(byName).sort()).toEqual(['show_component', 'show_flow', 'show_form']);

    for (const tool of asTools) {
      expect(typeof tool.name).toBe('string');
      expect(TOOL_NAME_RE.test(tool.name)).toBe(true);
      expect(typeof tool.description).toBe('string');
      // The load-bearing invariant: root is the LITERAL 'object' the API requires.
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).toHaveProperty('properties');
    }
  });

  it('the emitted show_form schema round-trips through the SDK InputSchema shape', () => {
    const showForm = tools(catalog).find((t) => t.name === 'show_form');
    // Re-narrow to the SDK type at runtime-assertion time (no cast needed —
    // structurally it already is one).
    const inputSchema: Anthropic.Tool.InputSchema | undefined = showForm?.input_schema;
    expect(inputSchema?.type).toBe('object');
    expect(inputSchema?.properties).toMatchObject({ schema: {} });
  });
});

// ============================================================================
// 2. Non-zod tool schemas: projection fallback, manual escape hatch, drop+log
// ============================================================================

/**
 * Non-zod carrier that EXPOSES the vendor-neutral `~standard.jsonSchema.output`
 * extension (ArkType-shaped). `z.toJSONSchema` throws on it; the adapter must
 * fall back to `projectToJsonSchema`. These vendors aren't installed, so the
 * carrier is hand-authored to the Standard Schema spec — the shape a real
 * valibot/arktype schema presents to a vendor-neutral consumer.
 */
const arkLikeCitySchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'arktype',
    validate: (v: unknown) =>
      typeof (v as Record<string, unknown>)?.city === 'string'
        ? { value: v }
        : { issues: [{ message: 'city is required' }] },
    jsonSchema: {
      output: () => ({
        type: 'object',
        properties: { city: { type: 'string', description: 'The city to look up' } },
        required: ['city'],
      }),
    },
  },
} as unknown as StandardSchemaV1;

/** Non-zod carrier WITHOUT the jsonSchema extension (the valibot situation). */
const valibotToolSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'valibot',
    validate: (v: unknown) =>
      typeof (v as Record<string, unknown>)?.q === 'string'
        ? { value: v }
        : { issues: [{ message: 'q is required' }] },
  },
} as unknown as StandardSchemaV1;

/** Non-zod carrier with NEITHER the extension NOR a manual inputJsonSchema. */
const unprojectableSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'mystery',
    validate: (v: unknown) => ({ value: v }),
  },
} as unknown as StandardSchemaV1;

describe('non-zod tool schemas against real Anthropic.Tool.InputSchema', () => {
  afterEach(() => setLogSink(null));

  it('(a) projection fallback: a non-zod schema WITH the extension yields a valid InputSchema', () => {
    const cat = ril
      .create()
      .tool('lookup_city', { description: 'Look up a city', inputSchema: arkLikeCitySchema });
    const defs: AnthropicToolDefinition[] = tools(cat);
    const asTools: Anthropic.Tool[] = defs; // no cast
    const lookup = asTools.find((t) => t.name === 'lookup_city');
    expect(lookup?.input_schema.type).toBe('object');
    expect(lookup?.input_schema.properties).toMatchObject({ city: { type: 'string' } });
  });

  it('(b) manual escape hatch: no extension + inputJsonSchema uses that schema', () => {
    const cat = ril.create().tool('search', {
      description: 'Search',
      inputSchema: valibotToolSchema,
      inputJsonSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    });
    const search = tools(cat).find((t) => t.name === 'search');
    expect(search?.input_schema).toMatchObject({
      type: 'object',
      properties: { q: { type: 'string' } },
    });
  });

  it('(c) unprojectable + no manual schema: DROPPED and logged, never thrown', () => {
    const warnings: string[] = [];
    setLogSink((level: LogLevel, _scope, message) => {
      if (level === 'warn') warnings.push(message);
    });
    const cat = ril
      .create()
      .tool('emittable', { description: 'ok', inputSchema: z.object({ a: z.string() }) })
      .tool('mystery', { description: 'unprojectable', inputSchema: unprojectableSchema });

    let defs: AnthropicToolDefinition[] = [];
    expect(() => {
      defs = tools(cat);
    }).not.toThrow();

    // The good tool survives; the unprojectable one is skipped, not crashing.
    expect(defs.map((d) => d.name)).toEqual(['emittable']);
    expect(warnings.some((w) => w.includes('mystery') && w.includes('inputJsonSchema'))).toBe(true);
  });

  it('a renderer-only tool (no inputSchema) is excluded from the definitions', () => {
    const cat = ril
      .create()
      .tool('render_only', { description: 'no schema', renderer: () => <div>hi</div> });
    expect(tools(cat)).toEqual([]);
  });
});

// ============================================================================
// 3. toParts() over REAL @anthropic-ai/sdk content blocks
// ============================================================================

describe('toParts() over REAL Anthropic content blocks', () => {
  it('maps a real TextBlock → text Part and a real ToolUseBlock → tool Part keyed by id', () => {
    // Typed against the SDK's OWN block interfaces — `satisfies` fails to compile
    // if the installed SDK's shape drifted (e.g. required `citations` / `caller`).
    const textBlock = {
      type: 'text',
      text: 'Here is a form.',
      citations: null,
    } satisfies Anthropic.TextBlock;

    const toolBlock = {
      type: 'tool_use',
      id: 'toolu_01',
      name: 'show_form',
      input: { schema: { id: 'f', fields: [] } },
      caller: direct,
    } satisfies Anthropic.ToolUseBlock;

    const content: Anthropic.ContentBlock[] = [textBlock, toolBlock];
    const message = { role: 'assistant', content } as const;

    const parts = toParts(message);
    expect(parts[0]).toEqual({ type: 'text', text: 'Here is a form.', state: 'done' });
    // tool_use → a `ready` tool Part keyed by the block id, reading `input`.
    expect(toolOf(parts, 'toolu_01')).toEqual({
      type: 'tool',
      toolCallId: 'toolu_01',
      name: 'show_form',
      state: 'ready',
      input: { schema: { id: 'f', fields: [] } },
    });
  });

  it('a tool_use block always maps to `ready` (Messages API delivers blocks complete)', () => {
    const toolBlock = {
      type: 'tool_use',
      id: 'toolu_stream',
      name: 'show_component',
      input: {},
      caller: direct,
    } satisfies Anthropic.ToolUseBlock;
    const parts = toParts({ content: [toolBlock] satisfies Anthropic.ContentBlock[] });
    expect(toolOf(parts, 'toolu_stream')?.state).toBe('ready');
  });

  it('reads the model arguments off `input` (never `arguments`) and defaults absent input to {}', () => {
    // Construct a tool_use whose `input` is undefined (the field is typed
    // `unknown`, so this is a legal SDK value the adapter must tolerate).
    const toolBlock = {
      type: 'tool_use',
      id: 'toolu_noinput',
      name: 'show_form',
      input: undefined,
      caller: direct,
    } satisfies Anthropic.ToolUseBlock;
    const parts = toParts({ content: [toolBlock] satisfies Anthropic.ContentBlock[] });
    expect(toolOf(parts, 'toolu_noinput')?.input).toEqual({});
  });

  it('ignores non-text/tool_use real blocks (thinking) and malformed content, never throwing', () => {
    const thinking = {
      type: 'thinking',
      thinking: 'reasoning...',
      signature: 'sig',
    } satisfies Anthropic.ThinkingBlock;
    const text = { type: 'text', text: 'after', citations: null } satisfies Anthropic.TextBlock;

    const parts = toParts({ content: [thinking, text] satisfies Anthropic.ContentBlock[] });
    expect(parts).toEqual([{ type: 'text', text: 'after', state: 'done' }]);

    // Defensive: non-array content and null slots degrade to [], not a crash.
    expect(toParts({ content: null })).toEqual([]);
    expect(toParts(undefined)).toEqual([]);
    expect(toParts({ content: [null, undefined] })).toEqual([]);
  });
});

// ============================================================================
// 4. Round-trip: real tool_use wire shape → toParts → <Parts> → HITL resolve
// ============================================================================

describe('round-trip: real ToolUseBlock → toParts → <Parts> → HITL resolve', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a real show_form tool_use emission reaches the built-in fallback and resolves through onResolve', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    // tools() is what the SERVER hands `messages.create` — assert it is a real
    // Anthropic.Tool[] with an object-root show_form schema before driving the CLIENT.
    const toolset: Anthropic.Tool[] = tools(catalog);
    const showForm = toolset.find((t) => t.name === 'show_form');
    expect(showForm?.input_schema.type).toBe('object');

    // The assistant turn the Messages API would return: a real ToolUseBlock.
    const toolBlock = {
      type: 'tool_use',
      id: 'toolu_hitl',
      name: 'show_form',
      input: {
        schema: { id: 'seat', fields: [{ id: 'seat', type: 'text', props: { label: 'Seat' } }] },
      },
      caller: direct,
    } satisfies Anthropic.ToolUseBlock;
    const message = { role: 'assistant', content: [toolBlock] satisfies Anthropic.ContentBlock[] };

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
        'toolu_hitl',
        { status: 'submitted', values: { seat: '14C' } },
        'show_form'
      )
    );
  });
});
