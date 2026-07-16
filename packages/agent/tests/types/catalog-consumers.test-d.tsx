import { manifest, uiTools } from '@rilaykit/agent';
import { tools as aiSdkTools } from '@rilaykit/agent/ai-sdk';
import { tools as anthropicTools } from '@rilaykit/agent/anthropic';
import { Catalog, Part, Parts } from '@rilaykit/agent/react';
import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
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
 * DX-2: `tools()` must return something `streamText({ tools })` accepts.
 * StandInTool/StandInToolSet mirror the AI SDK's `Tool`/`ToolSet` shape
 * (verified against the published d.ts of ai@5.0.214 and ai@7.0.29):
 * `Tool = { description?: string; inputSchema: FlexibleSchema; execute?; ... }`
 * where FlexibleSchema's standard-schema member is
 * `StandardSchemaV1<unknown, T> & { '~standard': Props & { jsonSchema?: ... } }`.
 * The agent package must not import `ai` itself, so the assertion runs
 * against this structural stand-in.
 */
type StandInStandardSchema<T = unknown> = StandardSchemaV1<unknown, T> & {
  readonly '~standard': StandardSchemaV1.Props<unknown, T> & {
    readonly jsonSchema?: unknown;
  };
};

interface StandInTool {
  readonly description?: string;
  readonly inputSchema: StandInStandardSchema;
  readonly execute?: (input: unknown, options: unknown) => unknown;
}

type StandInToolSet = Record<string, StandInTool>;

describe('DX-2: ai-sdk tools() return type is a usable ToolSet', () => {
  it('is assignable to a structural ToolSet stand-in', () => {
    expectTypeOf(aiSdkTools(typedCatalog)).toMatchTypeOf<StandInToolSet>();
  });

  it('does not erase the tool definitions to unknown', () => {
    const definitions = aiSdkTools(typedCatalog);
    expectTypeOf(definitions.get_weather).not.toBeUnknown();
    expectTypeOf(definitions.get_weather.inputSchema).toMatchTypeOf<
      StandardSchemaV1<unknown, unknown>
    >();
    expectTypeOf(definitions.get_weather.description).toEqualTypeOf<string | undefined>();
  });
});
