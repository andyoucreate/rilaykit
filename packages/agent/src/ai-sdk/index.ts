import type { RilayInstance } from '@rilaykit/core';
import type { Part, PartState } from '../types/part';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

const STATE_MAP: ReadonlyMap<string, PartState> = new Map([
  ['input-streaming', 'streaming'],
  ['input-available', 'ready'],
  ['output-available', 'done'],
  ['output-error', 'error'],
]);

interface SdkPart {
  readonly type?: string;
  readonly text?: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
  readonly data?: unknown;
}

/**
 * Near-identity: the Part model is structurally aligned with AI SDK v5 on purpose.
 * A Map, not an object literal — an object literal would resolve a state named
 * `toString` to the inherited method (this class escaped seven times in P1/P2).
 *
 * The Part list this returns is keyed by `toolCallId` downstream (<Parts>), but this
 * adapter does not dedupe: an AI SDK message's own `parts` array never repeats a
 * `toolCallId` for a given tool part, so pass-through is correct — collapsing here
 * would be manufacturing a guarantee the SDK already provides.
 */
export function toParts(message: unknown): Part[] {
  const parts = (message as { parts?: readonly SdkPart[] } | undefined)?.parts;
  if (!Array.isArray(parts)) return [];

  const result: Part[] = [];
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) continue;
    if (part.type === 'text' && typeof part.text === 'string') {
      result.push({
        type: 'text',
        text: part.text,
        state: part.state === 'streaming' ? 'streaming' : 'done',
      });
      continue;
    }
    if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      const state = STATE_MAP.get(part.state ?? '');
      if (!state || !part.toolCallId) continue;
      result.push({
        type: 'tool',
        toolCallId: part.toolCallId,
        name: part.type.slice('tool-'.length),
        state,
        input: part.input ?? {},
        output: part.output,
        errorText: part.errorText,
      });
      continue;
    }
    if (typeof part.type === 'string' && part.type.startsWith('data-')) {
      result.push({ type: 'data', name: part.type.slice('data-'.length), data: part.data });
    }
  }
  return result;
}

/**
 * Emits UI tools WITHOUT `execute`: the SDK's native HITL pattern — the stream stays
 * pending, the client renders from `input`, and `addToolResult` resumes the agent.
 * zod schemas pass through untouched; the SDK converts them itself.
 *
 * A tool registered without `inputSchema` is renderer-only (spec §4) — it renders a
 * host-executed tool and is excluded from generated definitions.
 */
export function tools(catalog: AnyCatalog): Record<string, unknown> {
  // A Map, then Object.fromEntries — never `generated[tool.name] = ...`. A tool named
  // `__proto__` would reassign the prototype instead of creating an own property; the
  // repo's rule for untrusted-id accumulators is Map + fromEntries (P2 r1).
  const generated = new Map<string, unknown>();
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    generated.set(tool.name, { description: tool.description, inputSchema: tool.inputSchema });
  }
  return Object.fromEntries(generated);
}
