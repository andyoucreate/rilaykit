import type Anthropic from '@anthropic-ai/sdk';
import { type AnthropicToolDefinition, toParts, tools } from '@rilaykit/agent/anthropic';
import { ril } from '@rilaykit/core';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Part } from '../../src/types/part';

/**
 * REAL-SDK type verification for the `anthropic` adapter (`tools`, `toParts`)
 * against the actually-installed `@anthropic-ai/sdk` (0.112.1) — NOT a
 * hand-authored stand-in. Every `Tool` / `Tool.InputSchema` / `Message` /
 * content-block type here is imported from the real SDK. Runs under
 * `vitest --typecheck` (real `tsc`), so a genuine assignability defect fails CI,
 * not just review.
 *
 * The adapter's load-bearing claim (src/anthropic/index.ts:10-22) is that a
 * `tools()` result is assignable to the real `Anthropic.Tool[]` with NO cast:
 * each entry's `input_schema` must satisfy `Anthropic.Tool.InputSchema`, whose
 * `type` is the LITERAL `'object'` (0.112.1: messages.d.ts:1241-1246). The
 * narrow `{ type: 'object'; [k: string]: unknown }` the adapter emits is exactly
 * what keeps `messages.create({ tools })` cast-free. These tests lock that in.
 */

const catalog = ril
  .create()
  .tool('get_weather', {
    description: 'weather',
    inputSchema: z.object({ city: z.string() }),
  })
  .tool('book_trip', { inputSchema: z.object({ when: z.string() }) });

describe('tools() → real Anthropic.Tool[], no cast', () => {
  it('the whole array is assignable to the real Anthropic.Tool[]', () => {
    // The bare typed binding IS the assertion — it fails typecheck if the
    // adapter return is not structurally an `Anthropic.Tool[]`. This is the exact
    // no-cast line a consumer writes: `messages.create({ tools: tools(catalog) })`.
    const asTools: Anthropic.Tool[] = tools(catalog);
    expectTypeOf(asTools).toExtend<Anthropic.Tool[]>();
    expectTypeOf(tools(catalog)).toExtend<Anthropic.Tool[]>();
  });

  it('a single AnthropicToolDefinition IS a real Anthropic.Tool', () => {
    expectTypeOf<AnthropicToolDefinition>().toExtend<Anthropic.Tool>();
    const def = {} as AnthropicToolDefinition;
    const asTool: Anthropic.Tool = def;
    expectTypeOf(asTool).toExtend<Anthropic.Tool>();
  });

  it("input_schema satisfies the SDK's own Tool.InputSchema", () => {
    const def = {} as AnthropicToolDefinition;
    // No cast: the adapter's emitted `input_schema` IS an `InputSchema`.
    const schema: Anthropic.Tool.InputSchema = def.input_schema;
    expectTypeOf(schema).toExtend<Anthropic.Tool.InputSchema>();
    expectTypeOf<AnthropicToolDefinition['input_schema']>().toExtend<Anthropic.Tool.InputSchema>();
  });

  it("Tool.InputSchema.type is the LITERAL 'object' (why the adapter re-states it)", () => {
    expectTypeOf<Anthropic.Tool.InputSchema['type']>().toEqualTypeOf<'object'>();
  });

  it('a bare Record<string, unknown> is NOT a valid input_schema — the reason for the narrow type', () => {
    const widened = {} as Record<string, unknown>;
    // @ts-expect-error `type` widens to `unknown`, non-assignable to the literal 'object'
    const bad: Anthropic.Tool.InputSchema = widened;
    void bad;
  });

  it('an input_schema with the WRONG root type literal is rejected by the SDK type', () => {
    // @ts-expect-error the Messages API root must be `type: 'object'`, not 'string'
    const bad: Anthropic.Tool.InputSchema = { type: 'string' };
    void bad;
  });
});

describe('real @anthropic-ai/sdk content-block discriminants the adapter reads have not drifted', () => {
  it('toParts() accepts a real Anthropic.Message and yields the internal Part[]', () => {
    const message = {} as Anthropic.Message;
    expectTypeOf(toParts(message)).toEqualTypeOf<Part[]>();
    // `Message.content` is `Array<ContentBlock>` — toParts is defined over it.
    expectTypeOf<Anthropic.Message['content']>().toEqualTypeOf<Array<Anthropic.ContentBlock>>();
  });

  it('text / tool_use discriminants match what toParts() branches on', () => {
    // text block: literal 'text' with a string `text` field.
    expectTypeOf<Anthropic.TextBlock['type']>().toEqualTypeOf<'text'>();
    expectTypeOf<Anthropic.TextBlock['text']>().toEqualTypeOf<string>();
    // tool_use block: literal 'tool_use' with id/name strings.
    expectTypeOf<Anthropic.ToolUseBlock['type']>().toEqualTypeOf<'tool_use'>();
    expectTypeOf<Anthropic.ToolUseBlock['id']>().toEqualTypeOf<string>();
    expectTypeOf<Anthropic.ToolUseBlock['name']>().toEqualTypeOf<string>();
  });

  it('tool_use blocks carry `input` (never `arguments`) — the field the adapter reads', () => {
    // The adapter reads `block.input`; the SDK types it `unknown`.
    expectTypeOf<Anthropic.ToolUseBlock>().toHaveProperty('input');
    expectTypeOf<Anthropic.ToolUseBlock['input']>().toEqualTypeOf<unknown>();
    // There is no `arguments` field to accidentally read (the OpenAI-ism).
    expectTypeOf<Anthropic.ToolUseBlock>().not.toHaveProperty('arguments');
  });

  it('TextBlock and ToolUseBlock are both members of the real ContentBlock union', () => {
    expectTypeOf<Anthropic.TextBlock>().toExtend<Anthropic.ContentBlock>();
    expectTypeOf<Anthropic.ToolUseBlock>().toExtend<Anthropic.ContentBlock>();
  });
});
