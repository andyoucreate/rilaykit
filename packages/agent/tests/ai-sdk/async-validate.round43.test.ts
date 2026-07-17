import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/ai-sdk';

/**
 * Round 43 (bug hunt): #13 wraps each tool's schema in the SDK's
 * `jsonSchema(root, { validate })`, and `standardValidate` claims to preserve an
 * ASYNC Standard Schema (`validate` may return a Promise). The #13 tests only
 * exercised SYNC validators — a developer using an async validator in a tool
 * (e.g. a remote uniqueness check) takes an untested path. This pins that the
 * SDK-facing validate resolves correctly for an async vendor.
 */
function asyncProjectableSchema(): StandardSchemaV1<unknown, unknown> {
  const objectRoot = {
    type: 'object',
    properties: { handle: { type: 'string' } },
    required: ['handle'],
  };
  return {
    '~standard': {
      version: 1,
      vendor: 'fake-async',
      // ASYNC validate — resolves with issues or the value after a microtask.
      validate: async (value: unknown) => {
        await Promise.resolve();
        const handle = (value as { handle?: unknown }).handle;
        return typeof handle === 'string' && handle.length > 0
          ? { value }
          : { issues: [{ message: 'handle is required' }] };
      },
      jsonSchema: { output: () => objectRoot },
    },
  } as unknown as StandardSchemaV1<unknown, unknown>;
}

describe('Round 43: ai-sdk tools() preserves an ASYNC Standard Schema validator', () => {
  const catalog = ril
    .create()
    .tool('claim_handle', { description: 'async', inputSchema: asyncProjectableSchema() });

  it('emits the tool with the projected root', () => {
    const def = tools(catalog).claim_handle as { inputSchema: { jsonSchema?: unknown } };
    expect(def.inputSchema.jsonSchema).toEqual({
      type: 'object',
      properties: { handle: { type: 'string' } },
      required: ['handle'],
    });
  });

  it('the SDK-facing validate resolves (not rejects) for both valid and invalid input', async () => {
    const validate = (
      tools(catalog).claim_handle as {
        inputSchema: { validate?: (v: unknown) => unknown };
      }
    ).inputSchema.validate;
    expect(validate).toBeTypeOf('function');

    // Must return a thenable (the async path) and RESOLVE, never throw/reject.
    const ok = await (validate?.({ handle: 'neo' }) as Promise<{
      success: boolean;
      value?: unknown;
    }>);
    expect(ok).toEqual({ success: true, value: { handle: 'neo' } });

    const bad = await (validate?.({}) as Promise<{ success: boolean }>);
    expect(bad.success).toBe(false);
  });
});
