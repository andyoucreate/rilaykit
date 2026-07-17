import type { RilayInstance } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

interface PropDescription {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly description?: string;
}

/**
 * A schema's JSON-Schema `properties`/`required` shape, read defensively —
 * every field is `unknown` until narrowed, since it comes from a vendor's
 * output rather than a type this module controls.
 */
interface ObjectJsonSchema {
  readonly properties?: Record<string, { readonly type?: unknown; readonly description?: unknown }>;
  readonly required?: readonly unknown[];
}

/**
 * The optional `StandardJSONSchemaV1` extension (`@standard-schema/spec`):
 * a schema library may expose `~standard.jsonSchema.output(...)` to convert
 * itself to JSON Schema without callers needing to know which library it is.
 * Present on zod v4 (verified against the installed 4.4.3); absent on
 * vendors that don't implement the extension.
 */
interface JsonSchemaExtension {
  readonly jsonSchema?: {
    readonly output: (options: { readonly target: string }) => unknown;
  };
}

/**
 * Projects a Standard Schema to JSON Schema through the vendor-neutral
 * `~standard.jsonSchema.output` extension. Returns the projected value in a
 * wrapper so callers can distinguish "not projectable" (`null`) from a
 * projection that happens to be falsy. Never throws: an absent schema, a
 * vendor without the extension, a malformed schema missing `~standard`, or a
 * throwing converter (zod's `z.custom()` / `z.date()` are unrepresentable in
 * JSON Schema) all degrade to `null`.
 */
function projectToJsonSchema(
  schema: StandardSchemaV1 | undefined
): { readonly projected: unknown } | null {
  if (!schema) return null;

  const standard = schema['~standard'] as unknown as JsonSchemaExtension | undefined;
  const extension = standard?.jsonSchema;
  if (!extension) return null;

  try {
    return { projected: extension.output({ target: 'draft-2020-12' }) };
  } catch {
    return null;
  }
}

/**
 * The tool-name constraint shared by the mainstream providers: the Anthropic
 * Messages API and OpenAI/AI SDK function tools all require
 * `^[a-zA-Z0-9_-]{1,64}$`. A name outside it is rejected by the provider (for
 * Anthropic, a 400 for the WHOLE request), so it is a universal emittability
 * gate, not an Anthropic-specific one — the manifest and every adapter share
 * it so they cannot disagree about which tools are callable.
 */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** The root JSON Schema an adapter would emit for a tool, or null if none. */
function emittableToolSchema(entry: {
  readonly inputSchema?: StandardSchemaV1<unknown, unknown>;
  readonly inputJsonSchema?: Record<string, unknown>;
}): Record<string, unknown> | null {
  if (entry.inputSchema === undefined) return null;
  if (entry.inputJsonSchema !== undefined) return entry.inputJsonSchema;
  const projection = projectToJsonSchema(entry.inputSchema);
  return projection ? (projection.projected as Record<string, unknown>) : null;
}

/**
 * A tool is emittable — advertisable to the model AND emittable by the adapters
 * — only if a provider can actually accept its definition. The single source of
 * truth both `manifest()` and the adapters consult so they cannot drift apart
 * (a skip class added here applies everywhere at once). Emittable iff: it has an
 * inputSchema, its name matches the shared provider pattern, and the schema an
 * adapter would emit (projected via the vendor-neutral `~standard.jsonSchema`
 * extension, or a manual `inputJsonSchema`) has a top-level `type: "object"` —
 * the root shape every provider requires. Never throws.
 */
export function isEmittableTool(entry: {
  readonly name: string;
  readonly inputSchema?: StandardSchemaV1<unknown, unknown>;
  readonly inputJsonSchema?: Record<string, unknown>;
}): boolean {
  if (!TOOL_NAME_PATTERN.test(entry.name)) return false;
  const root = emittableToolSchema(entry);
  return root !== null && (root as { readonly type?: unknown }).type === 'object';
}

/**
 * Reads a component's propsSchema through the Standard Schema JSON-Schema
 * extension (`~standard.jsonSchema.output`) rather than a specific vendor's
 * internals. This was a deliberate choice over reading zod's `.shape` /
 * `_def.typeName` / `.isOptional()` directly:
 *
 * Verified against the installed zod (4.4.3) with a scratch script: `.shape`
 * and `.isOptional()` do still exist, but `_def.typeName` does not — v4
 * replaced it with `_def.type`, and for an optional field the description
 * and base type sit on an `{ type: 'optional', innerType }` wrapper rather
 * than on the field itself. Those internals already moved once and are not
 * a contract this module should couple to.
 *
 * The `~standard.jsonSchema` extension is vendor-neutral, spec-sanctioned,
 * and gives the same information (name, type, optional, description) in one
 * shape regardless of which Standard Schema library produced it. A schema
 * that doesn't implement the extension (no propsSchema, a non-object
 * schema, a vendor without the extension, or a malformed schema missing
 * `~standard` entirely) degrades to `[]` — the component still renders with
 * its own description, just without a prop list.
 */
function describeProps(schema: StandardSchemaV1 | undefined): PropDescription[] {
  const projection = projectToJsonSchema(schema);
  if (!projection) return [];
  const jsonSchema = projection.projected as ObjectJsonSchema;

  const properties = jsonSchema.properties;
  if (!properties) return [];

  const required = new Set(
    (jsonSchema.required ?? []).filter((key): key is string => typeof key === 'string')
  );

  return Object.entries(properties).map(([name, value]) => ({
    name,
    type: typeof value.type === 'string' ? value.type : 'unknown',
    optional: !required.has(name),
    description: typeof value.description === 'string' ? value.description : undefined,
  }));
}

function renderProp(prop: PropDescription): string {
  const suffix = prop.optional ? ' (optional)' : '';
  const note = prop.description ? ` — ${prop.description}` : '';
  return `    - ${prop.name}: ${prop.type}${suffix}${note}`;
}

/**
 * Generates the compact catalog description for a system prompt: which
 * components exist, their props, and when to use show_form vs
 * show_component. This is how the model learns the patterns it may emit.
 *
 * Provider-neutral and isomorphic — safe to import in a route handler.
 * Never throws: a component with no propsSchema, or a propsSchema this
 * module can't introspect, degrades to a description-only entry instead of
 * failing the whole manifest.
 *
 * Generic over the catalog's component map: `RilayInstance` is invariant in
 * `C` (renderer callbacks are contravariant in their props), so a fixed
 * `RilayInstance<Record<string, unknown>>` parameter would reject every
 * fluently built catalog. Only C-independent read methods are used here.
 */
export function manifest<C>(catalog: RilayInstance<C>): string {
  const lines: string[] = [];

  const components = catalog.getAllComponents();
  if (components.length > 0) {
    lines.push('## Available components');
    lines.push('');
    for (const component of components) {
      lines.push(
        `- **${component.type}**${component.description ? ` — ${component.description}` : ''}`
      );
      for (const prop of describeProps(component.propsSchema)) lines.push(renderProp(prop));
    }
    lines.push('');
  }

  const tools = catalog.getAllTools().filter(isEmittableTool);
  if (tools.length > 0) {
    lines.push('## Available tools');
    lines.push('');
    for (const tool of tools) {
      lines.push(`- **${tool.name}**${tool.description ? ` — ${tool.description}` : ''}`);
    }
    lines.push('');
  }

  // Each guidance line is emitted only when its tool is actually EMITTABLE —
  // the same predicate the "Available tools" list and both adapters use. Gating
  // on mere registration (`getTool`) would tell the model to call a show_* tool
  // that is registered renderer-only (no inputSchema) and therefore never
  // advertised or dispatchable — an undispatchable tool call.
  const emittableNames = new Set(tools.map((tool) => tool.name));
  const uiGuidance: string[] = [];
  if (emittableNames.has('show_form')) {
    uiGuidance.push('- Use `show_form` to collect structured input from the user in one screen.');
  }
  if (emittableNames.has('show_flow')) {
    uiGuidance.push('- Use `show_flow` when the input is long enough to warrant multiple steps.');
  }
  if (emittableNames.has('show_component')) {
    uiGuidance.push('- Use `show_component` to display information — not to collect input.');
    uiGuidance.push('- Component `props` must match the props listed above exactly.');
  }
  if (uiGuidance.length > 0) {
    lines.push('## How to show UI');
    lines.push('');
    lines.push(...uiGuidance);
  }

  return lines.join('\n');
}
