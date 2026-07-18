import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/ai-sdk';

/**
 * Round 42 (#13): the ai-sdk adapter passed each tool's RAW Standard Schema to
 * the SDK, which only understands zod — a non-zod vendor that exposes the
 * vendor-neutral `~standard.jsonSchema` projection (e.g. ArkType) was advertised
 * by manifest() yet emitted non-functionally here (the SDK could not convert it),
 * and a vendor without native SDK support was effectively dropped. The adapter
 * now wraps every emitted tool in the SDK's `jsonSchema(projectedRoot, {validate})`
 * so ANY Standard Schema reaches the provider as its projected JSON Schema AND is
 * validated through its own `~standard.validate`.
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
      validate: (value: unknown) =>
        value && typeof (value as { from?: unknown }).from === 'string'
          ? { value }
          : { issues: [{ message: 'from must be a string' }] },
      jsonSchema: { output: () => objectRoot },
    },
  } as unknown as StandardSchemaV1<unknown, unknown>;
}

describe('Round 42: ai-sdk adapter emits a non-zod tool as a functional SDK schema', () => {
  const catalog = ril
    .create()
    .tool('projectable', { description: 'non-zod', inputSchema: fakeProjectableSchema() });

  it('emits the non-zod tool (not dropped)', () => {
    expect(tools(catalog).projectable).toBeDefined();
  });

  it("wraps it in the SDK's jsonSchema so the provider receives the projected root", () => {
    const def = tools(catalog).projectable as { inputSchema: { jsonSchema?: unknown } };
    expect(def.inputSchema.jsonSchema).toEqual({
      type: 'object',
      properties: { from: { type: 'string' } },
      required: ['from'],
    });
  });

  it('validates input through the Standard Schema (functional, not advisory)', async () => {
    const def = tools(catalog).projectable as {
      inputSchema: { validate?: (v: unknown) => unknown };
    };
    expect(def.inputSchema.validate).toBeTypeOf('function');
    const ok = await def.inputSchema.validate?.({ from: 'CDG' });
    expect(ok).toEqual({ success: true, value: { from: 'CDG' } });
    const bad = (await def.inputSchema.validate?.({})) as { success: boolean };
    expect(bad.success).toBe(false);
  });
});
