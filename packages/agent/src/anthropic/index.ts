import { z } from 'zod';
import { getLogger } from '@rilaykit/core';
import type { RilayInstance } from '@rilaykit/core';
import type { Part } from '../types/part';

type AnyCatalog = RilayInstance<Record<string, unknown>>;
const logger = getLogger('agent:anthropic');

export interface AnthropicToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly input_schema: Record<string, unknown>;
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
  const content = (message as { content?: readonly (AnthropicBlock | null | undefined)[] } | undefined)?.content;
  if (!Array.isArray(content)) return [];

  const result: Part[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      result.push({ type: 'text', text: block.text, state: 'done' });
      continue;
    }
    if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
      result.push({ type: 'tool', toolCallId: block.id, name: block.name, state: 'ready', input: block.input ?? {} });
    }
  }
  return result;
}

function toJsonSchema(entry: { inputSchema?: unknown; inputJsonSchema?: Record<string, unknown> }): Record<string, unknown> | null {
  if (entry.inputJsonSchema) return entry.inputJsonSchema;
  try {
    return z.toJSONSchema(entry.inputSchema as z.ZodType) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Native `z.toJSONSchema()` — no custom converter (spec §13). Non-zod Standard
 * Schemas supply `inputJsonSchema` manually on the catalog entry. A tool we
 * cannot convert is SKIPPED and logged, never thrown: one unconvertible tool
 * must not take down the whole tool list.
 *
 * A tool registered without `inputSchema` is renderer-only (spec §4) — it is
 * excluded from generated definitions, same as the ai-sdk adapter.
 */
export function tools(catalog: AnyCatalog): AnthropicToolDefinition[] {
  const definitions: AnthropicToolDefinition[] = [];
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    const input_schema = toJsonSchema(tool);
    if (!input_schema) {
      logger.warn(`Skipping tool "${tool.name}": inputSchema is not zod and no inputJsonSchema was provided`);
      continue;
    }
    definitions.push({ name: tool.name, description: tool.description, input_schema });
  }
  return definitions;
}
