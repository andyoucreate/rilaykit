import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { tools as anthropicTools } from '../../src/anthropic';
import { isEmittableTool } from '../../src/manifest/manifest';

/**
 * Round 31: the anthropic adapter converted tool schemas with zod's
 * `z.toJSONSchema` only, while manifest()/isEmittableTool gate on the
 * vendor-neutral `~standard.jsonSchema` projection. So a NON-ZOD vendor that
 * exposes the extension (e.g. ArkType) was ADVERTISED by the manifest but
 * DROPPED by the anthropic adapter — the model was told to call a tool absent
 * from the tool array. The adapter now falls back to the same projection, so
 * emittability agrees across manifest, ai-sdk, and anthropic for any vendor.
 */

/** A non-zod Standard Schema exposing the optional `~standard.jsonSchema` extension. */
function fakeProjectableSchema(): StandardSchemaV1<unknown, unknown> {
  const objectRoot = {
    type: 'object',
    properties: { from: { type: 'string' } },
    required: ['from'],
  };
  return {
    '~standard': {
      version: 1,
      vendor: 'fake-arktype',
      validate: (value: unknown) => ({ value }),
      // The vendor-neutral JSON Schema extension zod v4 / ArkType expose.
      jsonSchema: { output: () => objectRoot },
    },
  } as unknown as StandardSchemaV1<unknown, unknown>;
}

describe('Round 31: anthropic adapter emits a non-zod tool via the ~standard.jsonSchema projection', () => {
  const catalog = ril
    .create()
    .tool('projectable', { description: 'non-zod', inputSchema: fakeProjectableSchema() });

  it('manifest considers the non-zod tool emittable (advertises it)', () => {
    const tool = catalog.getAllTools().find((t) => t.name === 'projectable');
    expect(tool).toBeDefined();
    if (tool) expect(isEmittableTool(tool)).toBe(true);
  });

  it('the anthropic adapter now EMITS the same tool (no manifest↔adapter drift)', () => {
    const defs = anthropicTools(catalog);
    const projectable = defs.find((d) => d.name === 'projectable');
    expect(projectable).toBeDefined();
    expect(projectable?.input_schema.type).toBe('object');
  });
});
