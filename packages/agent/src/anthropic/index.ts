import { getLogger } from '@rilaykit/core';
import type { RilayInstance } from '@rilaykit/core';
import { z } from 'zod';
import { TOOL_NAME_PATTERN } from '../manifest/manifest';
import type { Part } from '../types/part';

const logger = getLogger('agent:anthropic');

export interface AnthropicToolDefinition {
  readonly name: string;
  readonly description?: string;
  /**
   * A top-level JSON Schema object. The literal `type: 'object'` is what the
   * Messages API's `Tool.input_schema` (`Anthropic.Tool.InputSchema`) requires —
   * a bare `Record<string, unknown>` widens `.type` to `unknown` and makes the
   * whole definition non-assignable to `Anthropic.Tool[]`, forcing consumers to
   * cast at `messages.create({ tools })`. `tools()` only ever emits object-root
   * schemas (it skips anything else), so the narrower type is honest.
   */
  readonly input_schema: { readonly type: 'object'; readonly [key: string]: unknown };
}

interface AnthropicBlock {
  readonly type?: string;
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: unknown;
}

/**
 * The Messages API delivers `tool_use` blocks complete — there is no partial
 * "streaming" state to map here (unlike the AI SDK's `input-streaming`), so
 * every tool_use block goes straight to `ready`. Never throws: a malformed or
 * missing `content` array, or a null/undefined slot within it, degrades to a
 * skipped entry rather than a crash.
 */
export function toParts(message: unknown): Part[] {
  const content = (
    message as { content?: readonly (AnthropicBlock | null | undefined)[] } | undefined
  )?.content;
  if (!Array.isArray(content)) return [];

  const result: Part[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      result.push({ type: 'text', text: block.text, state: 'done' });
      continue;
    }
    if (
      block.type === 'tool_use' &&
      typeof block.id === 'string' &&
      typeof block.name === 'string'
    ) {
      result.push({
        type: 'tool',
        toolCallId: block.id,
        name: block.name,
        state: 'ready',
        input: block.input ?? {},
      });
    }
  }
  return result;
}

function toJsonSchema(entry: {
  inputSchema?: unknown;
  inputJsonSchema?: Record<string, unknown>;
}): Record<string, unknown> | null {
  try {
    return z.toJSONSchema(entry.inputSchema as z.ZodType) as Record<string, unknown>;
  } catch {
    // inputJsonSchema is a fallback for non-zod Standard Schema vendors, per the design spec —
    // a host wanting a custom projection registers a non-zod schema.
    return entry.inputJsonSchema ?? null;
  }
}

/**
 * Native `z.toJSONSchema()` — no custom converter (spec §13). Non-zod Standard
 * Schemas supply `inputJsonSchema` manually on the catalog entry. A tool we
 * cannot convert is SKIPPED and logged, never thrown: one unconvertible tool
 * must not take down the whole tool list.
 *
 * The same skip-and-log contract covers definitions the Messages API would
 * reject with a 400 for the entire request: a `name` outside
 * `^[a-zA-Z0-9_-]{1,64}$`, or a converted `input_schema` whose root is not
 * `type: "object"` (the API requires a top-level JSON Schema object).
 *
 * A tool registered without `inputSchema` is renderer-only (spec §4) — it is
 * excluded from generated definitions, same as the ai-sdk adapter.
 *
 * Generic over the catalog's component map: `RilayInstance` is invariant in
 * `C`, so a fixed `RilayInstance<Record<string, unknown>>` parameter would
 * reject every fluently built catalog.
 */
export function tools<C>(catalog: RilayInstance<C>): AnthropicToolDefinition[] {
  const definitions: AnthropicToolDefinition[] = [];
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    // `TOOL_NAME_PATTERN` is shared with the manifest (and every adapter) so the
    // model is never advertised a tool an adapter would drop. The manifest gates
    // on the same rules via `isEmittableTool`; the agreement is pinned by a
    // manifest↔adapter test so the two cannot drift apart.
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      logger.warn(
        `Skipping tool "${tool.name}": name does not match the Anthropic tool-name pattern ^[a-zA-Z0-9_-]{1,64}$`
      );
      continue;
    }
    const input_schema = toJsonSchema(tool);
    if (!input_schema) {
      logger.warn(
        `Skipping tool "${tool.name}": inputSchema is not zod and no inputJsonSchema was provided`
      );
      continue;
    }
    if (input_schema.type !== 'object') {
      logger.warn(
        `Skipping tool "${tool.name}": converted input_schema has type "${String(input_schema.type)}" — the Messages API requires a top-level "object" schema`
      );
      continue;
    }
    // `type: 'object'` is re-stated as a literal: the guard above proved it at
    // runtime, but TS cannot narrow the `Record<string, unknown>` from
    // `toJsonSchema`, so the spread + literal reconstructs the honest shape.
    definitions.push({
      name: tool.name,
      description: tool.description,
      input_schema: { ...input_schema, type: 'object' },
    });
  }
  return definitions;
}
