import type { RilayInstance } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

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
  if (!schema) return [];

  const standard = schema['~standard'] as unknown as JsonSchemaExtension | undefined;
  const extension = standard?.jsonSchema;
  if (!extension) return [];

  let jsonSchema: ObjectJsonSchema;
  try {
    jsonSchema = extension.output({ target: 'draft-2020-12' }) as ObjectJsonSchema;
  } catch {
    return [];
  }

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
 */
export function manifest(catalog: AnyCatalog): string {
  const lines: string[] = [];

  const components = catalog.getAllComponents();
  if (components.length > 0) {
    lines.push('## Available components');
    lines.push('');
    for (const component of components) {
      lines.push(`- **${component.type}**${component.description ? ` — ${component.description}` : ''}`);
      for (const prop of describeProps(component.propsSchema)) lines.push(renderProp(prop));
    }
    lines.push('');
  }

  const tools = catalog.getAllTools().filter((tool) => tool.inputSchema !== undefined);
  if (tools.length > 0) {
    lines.push('## Available tools');
    lines.push('');
    for (const tool of tools) {
      lines.push(`- **${tool.name}**${tool.description ? ` — ${tool.description}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## How to show UI');
  lines.push('');
  lines.push('- Use `show_form` to collect structured input from the user in one screen.');
  lines.push('- Use `show_flow` when the input is long enough to warrant multiple steps.');
  lines.push('- Use `show_component` to display information — not to collect input.');
  lines.push('- Component `props` must match the props listed above exactly.');

  return lines.join('\n');
}
