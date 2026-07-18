import { getLogger } from '@rilaykit/core';
import type { RilayInstance } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
// `ai` is an OPTIONAL peer that a consumer of `rilaykit/ai-sdk` already installs —
// this subpath exists to feed the SDK, so importing it here is expected. `jsonSchema`
// is a RUNTIME import (the emitted tools wrap their projected JSON Schema with it, so
// ANY Standard Schema vendor — not just zod — reaches the provider and is validated);
// `Tool` is type-only. tsup externalizes `ai`, so it is never bundled.
import { type Tool, jsonSchema } from 'ai';
import { emittableToolSchema, isEmittableTool } from '../manifest/manifest';
import type { Part, PartState } from '../types/part';

const logger = getLogger('agent:ai-sdk');

const STATE_MAP: ReadonlyMap<string, PartState> = new Map([
  ['input-streaming', 'streaming'],
  ['input-available', 'ready'],
  ['output-available', 'done'],
  ['output-error', 'error'],
]);

interface SdkPart {
  readonly type?: string;
  readonly text?: string;
  /** Only on `dynamic-tool` parts — static tool parts carry the name in `type`. */
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
  readonly data?: unknown;
}

/**
 * The tool name a part carries, under either AI SDK v5 shape: a statically
 * known tool is `type: 'tool-${name}'`; a tool the SDK does not know statically
 * (MCP, runtime-defined) is `type: 'dynamic-tool'` with a separate `toolName`.
 * `undefined` — not a tool part (or a dynamic-tool part missing its name).
 */
function toolNameOf(part: SdkPart): string | undefined {
  if (part.type === 'dynamic-tool') {
    return typeof part.toolName === 'string' ? part.toolName : undefined;
  }
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : undefined;
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
    const toolName = toolNameOf(part);
    if (toolName !== undefined) {
      const state = STATE_MAP.get(part.state ?? '');
      if (!state || !part.toolCallId) continue;
      result.push({
        type: 'tool',
        toolCallId: part.toolCallId,
        name: toolName,
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
 * One generated AI SDK tool definition: the exact subset of the AI SDK's `Tool`
 * shape this adapter emits (no `execute` — native HITL). `inputSchema` is the SDK's
 * own `Tool['inputSchema']` (`FlexibleSchema`); a tool's `StandardSchemaV1` is NOT
 * structurally a member of it (verified against ai@5 — its union is zod v4/v3, the
 * SDK's `Schema`, and `LazySchema`), so `tools()` wraps every schema with the SDK's
 * `jsonSchema()`, which returns a `Schema` that IS a member. No consumer cast, and
 * no honest cast inside — the record is assignable to `ToolSet` as built.
 */
export interface AiSdkToolDefinition {
  readonly description?: string;
  readonly inputSchema: Tool['inputSchema'];
}

/** The AI SDK validator shape (`@ai-sdk/provider-utils` `ValidationResult`). */
type SdkValidation<T> = { success: true; value: T } | { success: false; error: Error };

/**
 * Adapt a Standard Schema's `~standard.validate` to the SDK's `jsonSchema({validate})`
 * contract, preserving async: the SDK converts the emitted JSON Schema for the
 * provider, and this makes the SAME schema validate the model's tool input through
 * its own vendor (zod, valibot, ArkType…) instead of the SDK's zod-only path.
 */
function standardValidate(
  schema: StandardSchemaV1
): (value: unknown) => SdkValidation<unknown> | Promise<SdkValidation<unknown>> {
  const toSdk = (result: StandardSchemaV1.Result<unknown>): SdkValidation<unknown> =>
    result.issues
      ? { success: false, error: new TypeError(result.issues.map((i) => i.message).join('; ')) }
      : { success: true, value: result.value };
  return (value: unknown) => {
    const result = schema['~standard'].validate(value);
    return result instanceof Promise ? result.then(toSdk) : toSdk(result);
  };
}

/**
 * Emits UI tools WITHOUT `execute`: the SDK's native HITL pattern — the stream stays
 * pending, the client renders from `input`, and `addToolResult` resumes the agent.
 *
 * Every emitted schema is wrapped with the SDK's `jsonSchema(projectedRoot, {validate})`
 * so ANY Standard Schema vendor works, not just zod: the projected root (the exact
 * JSON Schema the manifest advertises) reaches the provider, and the schema's own
 * `~standard.validate` validates the model's tool input. Passing the raw Standard
 * Schema instead left a non-zod tool advertised-but-non-functional (or dropped).
 *
 * A tool registered without `inputSchema` is renderer-only (spec §4) — it renders a
 * host-executed tool and is excluded from generated definitions.
 *
 * Generic over the catalog's component map: `RilayInstance` is invariant in
 * `C`, so a fixed `RilayInstance<Record<string, unknown>>` parameter would
 * reject every fluently built catalog.
 */
export function tools<C>(catalog: RilayInstance<C>): Record<string, AiSdkToolDefinition> {
  // A Map, then Object.fromEntries — never `generated[tool.name] = ...`. A tool named
  // `__proto__` would reassign the prototype instead of creating an own property; the
  // repo's rule for untrusted-id accumulators is Map + fromEntries (P2 r1).
  const generated = new Map<string, AiSdkToolDefinition>();
  for (const tool of catalog.getAllTools()) {
    if (!tool.inputSchema) continue;
    // The same emittability rule the manifest and the anthropic adapter enforce,
    // so all three agree: a tool the manifest omits is never handed to streamText,
    // where an invalid name or non-object schema would 400 the whole request.
    // Skip-and-log — one bad tool must not sink the tool set.
    if (!isEmittableTool(tool)) {
      logger.warn(
        `Skipping tool "${tool.name}": not emittable — the name must match ^[a-zA-Z0-9_-]{1,64}$ and the input schema must be a top-level object`
      );
      continue;
    }
    // `isEmittableTool` already proved a non-null object-typed projection exists, so
    // this is the SAME root the manifest advertises — the model sees exactly what the
    // provider receives (no manifest↔adapter drift).
    const root = emittableToolSchema(tool) as Parameters<typeof jsonSchema>[0];
    generated.set(tool.name, {
      description: tool.description,
      inputSchema: jsonSchema(root, { validate: standardValidate(tool.inputSchema) }),
    });
  }
  return Object.fromEntries(generated);
}
