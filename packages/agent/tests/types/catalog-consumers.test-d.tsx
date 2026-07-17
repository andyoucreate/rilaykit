import { manifest, uiTools } from '@rilaykit/agent';
import { tools as aiSdkTools } from '@rilaykit/agent/ai-sdk';
import { tools as anthropicTools } from '@rilaykit/agent/anthropic';
import { Catalog, Part, Parts } from '@rilaykit/agent/react';
import { ril } from '@rilaykit/core';
import type { Tool, ToolSet } from 'ai';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Part as PartType } from '../../src/types/part';

/**
 * DX-1: every consumer entry point must accept ANY built catalog —
 * `RilayInstance` is invariant in its component map, so the old
 * `RilayInstance<Record<string, unknown>>` parameters rejected every real
 * catalog. Three shapes are locked in here:
 *   1. a fluently typed component catalog (`ril<{card: {...}}>`)
 *   2. a tool-only catalog (`ril<unknown>`)
 *   3. an untyped `ril.create()`
 */

const typedCatalog = ril
  .create()
  .component('card', { propsSchema: z.object({ title: z.string() }) })
  .tool('get_weather', { inputSchema: z.object({ city: z.string() }) })
  .use(uiTools());

const toolOnlyCatalog = ril
  .create()
  .tool('get_weather', { description: 'weather', inputSchema: z.object({ city: z.string() }) });

const untypedCatalog = ril.create();

const textPart: PartType = { type: 'text', text: 'hi', state: 'done' };

describe('DX-1: manifest() accepts any built catalog', () => {
  it('accepts typed, tool-only and untyped catalogs', () => {
    expectTypeOf(manifest(typedCatalog)).toBeString();
    expectTypeOf(manifest(toolOnlyCatalog)).toBeString();
    expectTypeOf(manifest(untypedCatalog)).toBeString();
  });
});

describe('DX-1: adapter tools() accept any built catalog', () => {
  it('ai-sdk tools() accepts typed, tool-only and untyped catalogs', () => {
    aiSdkTools(typedCatalog);
    aiSdkTools(toolOnlyCatalog);
    aiSdkTools(untypedCatalog);
  });

  it('anthropic tools() accepts typed, tool-only and untyped catalogs', () => {
    anthropicTools(typedCatalog);
    anthropicTools(toolOnlyCatalog);
    anthropicTools(untypedCatalog);
  });
});

describe('DX-1: React entry points accept any built catalog', () => {
  it('<Catalog value={...}> accepts typed, tool-only and untyped catalogs', () => {
    <Catalog value={typedCatalog}>{null}</Catalog>;
    <Catalog value={toolOnlyCatalog}>{null}</Catalog>;
    <Catalog value={untypedCatalog}>{null}</Catalog>;
  });

  it('<Parts catalog={...}> and <Part catalog={...}> accept typed, tool-only and untyped catalogs', () => {
    <Parts parts={[textPart]} catalog={typedCatalog} />;
    <Parts parts={[textPart]} catalog={toolOnlyCatalog} />;
    <Parts parts={[textPart]} catalog={untypedCatalog} />;
    <Part part={textPart} catalog={typedCatalog} />;
    <Part part={textPart} catalog={toolOnlyCatalog} />;
    <Part part={textPart} catalog={untypedCatalog} />;
  });
});

/**
 * DX-2: `tools()` must be accepted by `streamText({ tools })` with NO cast. The
 * adapter now types `inputSchema` as the SDK's own `Tool['inputSchema']` and
 * type-only-imports `ai` (an optional peer), so this asserts against the REAL
 * `ToolSet`/`Tool` from `ai` rather than a hand-written stand-in.
 */
describe('DX-2: ai-sdk tools() return type is the real AI SDK ToolSet', () => {
  it('is assignable to the SDK ToolSet with no cast', () => {
    // The bare assignment is the assertion: it would fail typecheck if the return
    // were not assignable to the real ToolSet (it was, before Tool['inputSchema']).
    const toolset: ToolSet = aiSdkTools(typedCatalog);
    expectTypeOf(toolset).toMatchTypeOf<ToolSet>();
  });

  it('does not erase the tool definitions to unknown', () => {
    const definitions = aiSdkTools(typedCatalog);
    expectTypeOf(definitions.get_weather).not.toBeUnknown();
    expectTypeOf(definitions.get_weather.inputSchema).toEqualTypeOf<Tool['inputSchema']>();
    expectTypeOf(definitions.get_weather.description).toEqualTypeOf<string | undefined>();
  });
});
