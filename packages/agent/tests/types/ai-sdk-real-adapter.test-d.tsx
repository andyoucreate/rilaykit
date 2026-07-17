import { type AiSdkToolDefinition, toParts, tools } from '@rilaykit/agent/ai-sdk';
import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  type DataUIPart,
  type DynamicToolUIPart,
  type TextUIPart,
  type Tool,
  type ToolSet,
  type ToolUIPart,
  type UIMessage,
  jsonSchema,
} from 'ai';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Part } from '../../src/types/part';

/**
 * REAL-SDK type verification for the `ai-sdk` adapter, against the actually
 * installed `ai` (5.0.215) / `@ai-sdk/provider-utils` (3.0.29) — NOT a
 * hand-authored stand-in. Every `Tool` / `ToolSet` / `UIMessage` / UI-part type
 * here is imported from the real `ai` package. Runs under `vitest --typecheck`
 * (real `tsc`), so a genuine assignability defect fails CI, not just review.
 *
 * The adapter's load-bearing claim (src/ai-sdk/index.ts:97-109) is that a
 * schema-only tool value — no `execute`, no `outputSchema` — is assignable to
 * the real `ToolSet` with NO cast. ai@5's `Tool<INPUT, OUTPUT>` gates
 * `execute`/`outputSchema` behind `ToolOutputProperties<INPUT, OUTPUT> =
 * NeverOptional<OUTPUT, …>`; when `OUTPUT` is `any` (the `Tool` default, and the
 * member of `ToolSet`'s union that matters) every output property is optional,
 * so a `{ inputSchema }`-only record IS a member. These tests lock that in.
 */

const catalog = ril
  .create()
  .tool('get_weather', {
    description: 'weather',
    inputSchema: z.object({ city: z.string() }),
  })
  .tool('book_trip', { inputSchema: z.object({ when: z.string() }) });

// The exact value type each `ToolSet` entry must satisfy in ai@5.0.215.
type ToolSetValue = ToolSet[string];

describe('tools() → real ai@5 ToolSet, no cast', () => {
  it('the whole record is assignable to the real ToolSet', () => {
    // The bare typed binding IS the assertion — it fails typecheck if the
    // adapter return is not structurally a `ToolSet`.
    const asToolSet: ToolSet = tools(catalog);
    expectTypeOf(asToolSet).toExtend<ToolSet>();
    expectTypeOf(tools(catalog)).toExtend<ToolSet>();
  });

  it('a schema-only definition (no execute / no outputSchema) IS a ToolSet value', () => {
    // This is the historically-blind claim: reproduce EXACTLY what tools()
    // emits and prove it lands in the real ToolSet value union with no cast.
    const schemaOnly: AiSdkToolDefinition = {
      description: 'x',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };
    const asValue: ToolSetValue = schemaOnly;
    expectTypeOf(asValue).toExtend<ToolSetValue>();
    expectTypeOf(schemaOnly).toExtend<ToolSetValue>();
  });

  it("AiSdkToolDefinition.inputSchema IS the SDK's own Tool['inputSchema']", () => {
    expectTypeOf<AiSdkToolDefinition['inputSchema']>().toEqualTypeOf<Tool['inputSchema']>();
  });

  it("jsonSchema()'s Schema is a member of the real Tool['inputSchema'] (FlexibleSchema)", () => {
    // Why the adapter wraps every projected root with jsonSchema(): its return
    // IS a member of the SDK's FlexibleSchema union.
    expectTypeOf(jsonSchema({ type: 'object' })).toExtend<Tool['inputSchema']>();
  });

  it("a bare StandardSchemaV1 is NOT a member of Tool['inputSchema'] — the reason to wrap", () => {
    const std = {} as StandardSchemaV1;
    // @ts-expect-error a bare Standard Schema is not structurally a member of ai@5's FlexibleSchema
    const bad: Tool['inputSchema'] = std;
    void bad;
  });
});

describe('real ai@5 UI-part discriminants the adapter reads have not drifted', () => {
  it('toParts() accepts a real UIMessage and yields the internal Part[]', () => {
    const message = {} as UIMessage;
    expectTypeOf(toParts(message)).toEqualTypeOf<Part[]>();
  });

  it('text / tool / dynamic-tool / data discriminants match what toParts() branches on', () => {
    // text
    expectTypeOf<TextUIPart['type']>().toEqualTypeOf<'text'>();
    // static tool part: `tool-${name}` (adapter slices the `tool-` prefix)
    expectTypeOf<ToolUIPart['type']>().toExtend<`tool-${string}`>();
    // dynamic tool part: literal 'dynamic-tool' with a separate toolName
    expectTypeOf<DynamicToolUIPart['type']>().toEqualTypeOf<'dynamic-tool'>();
    expectTypeOf<DynamicToolUIPart['toolName']>().toEqualTypeOf<string>();
    // data part: `data-${name}` (adapter slices the `data-` prefix)
    expectTypeOf<DataUIPart<Record<string, unknown>>['type']>().toExtend<`data-${string}`>();
  });

  it('tool parts carry `input` (not `args`) and the four states the STATE_MAP maps', () => {
    // The field is `input`, never `args` — the adapter reads part.input.
    expectTypeOf<ToolUIPart>().toHaveProperty('input');
    // Every state string the adapter's STATE_MAP keys on exists on the real union.
    type SdkToolState = ToolUIPart['state'];
    expectTypeOf<'input-streaming'>().toExtend<SdkToolState>();
    expectTypeOf<'input-available'>().toExtend<SdkToolState>();
    expectTypeOf<'output-available'>().toExtend<SdkToolState>();
    expectTypeOf<'output-error'>().toExtend<SdkToolState>();
  });
});
