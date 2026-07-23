import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { tools as aiSdkTools } from '../../src/ai-sdk';
import { tools as anthropicTools } from '../../src/anthropic';
import { emittableToolSchema, isEmittableTool } from '../../src/manifest/manifest';
import { uiTools } from '../../src/tools/ui-tools';

/**
 * Issue #23: `uiTools()` declared the show_form/show_flow `schema` arg as
 * `z.unknown()`, projecting to an unconstrained `{}` (no `type`). Models then
 * serialized the nested FormSchema as a stringified JSON, so the HITL form
 * silently never rendered. The fix gives `schema` an honest, permissive object
 * shape whose native projection is object-typed on BOTH adapter paths.
 */
const catalog = ril.create().use(uiTools());

const schemaArgType = (root: unknown): unknown =>
  (root as { properties?: { schema?: { type?: unknown } } })?.properties?.schema?.type;

describe('issue #23 — the emitted `schema` argument is object-typed, not `{}`', () => {
  it.each(['show_form', 'show_flow'])(
    'the manifest-advertised root types %s.schema as an object',
    (toolName) => {
      const entry = catalog.getTool(toolName);
      const root = emittableToolSchema({
        inputSchema: entry?.inputSchema,
        inputJsonSchema: entry?.inputJsonSchema,
      });
      expect(schemaArgType(root)).toBe('object');
    }
  );

  it.each(['show_form', 'show_flow'])('%s stays emittable', (toolName) => {
    const entry = catalog.getTool(toolName);
    expect(
      isEmittableTool({
        name: toolName,
        inputSchema: entry?.inputSchema,
        inputJsonSchema: entry?.inputJsonSchema,
      })
    ).toBe(true);
  });

  it.each(['show_form', 'show_flow'])(
    'the ANTHROPIC adapter emits %s.schema as an object (native z.toJSONSchema)',
    (toolName) => {
      const def = anthropicTools(catalog).find((t) => t.name === toolName);
      expect(schemaArgType(def?.input_schema)).toBe('object');
    }
  );

  it.each(['show_form', 'show_flow'])(
    'the AI-SDK adapter emits %s.schema as an object',
    (toolName) => {
      const def = aiSdkTools(catalog)[toolName] as {
        inputSchema: { jsonSchema?: Record<string, unknown> };
      };
      expect(schemaArgType(def.inputSchema.jsonSchema)).toBe('object');
    }
  );
});

describe('issue #23 — runtime validation stays permissive (compileForm owns the real errors)', () => {
  const validate = (toolName: string, value: unknown) =>
    catalog.getTool(toolName)?.inputSchema?.['~standard'].validate(value);
  const issuesOf = (result: unknown) => (result as { issues?: unknown[] }).issues;

  it('accepts a full FormSchema (version, rows, nested fields all pass through)', () => {
    const result = validate('show_form', {
      schema: {
        id: 'contact',
        version: 1,
        rows: [],
        fields: [{ id: 'email', type: 'email', props: { label: 'Email' } }],
      },
    });
    expect(result).toMatchObject({ value: { schema: { id: 'contact' } } });
    expect(issuesOf(result)).toBeUndefined();
  });

  it('accepts a schema missing `id` — that error belongs to compileForm, not the tool boundary', () => {
    expect(issuesOf(validate('show_form', { schema: { fields: [] } }))).toBeUndefined();
  });

  it('rejects a STRINGIFIED schema — the exact bug shape the model used to emit', () => {
    expect(
      issuesOf(validate('show_form', { schema: '{"id":"contact","fields":[]}' }))
    ).toBeDefined();
  });

  it('accepts a full FlowSchema for show_flow', () => {
    const result = validate('show_flow', {
      schema: { id: 'signup', name: 'Sign up', steps: [{ id: 's1', title: 'Step', form: {} }] },
    });
    expect(issuesOf(result)).toBeUndefined();
  });

  it('rejects a STRINGIFIED flow schema for show_flow (symmetric with show_form)', () => {
    expect(issuesOf(validate('show_flow', { schema: '{"id":"signup","steps":[]}' }))).toBeDefined();
  });
});
