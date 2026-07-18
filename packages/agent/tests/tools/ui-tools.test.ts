import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
  .component('select', {
    description: 'Dropdown selection',
    propsSchema: z.object({ label: z.string() }),
  })
  .use(uiTools());

describe('uiTools()', () => {
  it('registers exactly the three premium tools, with intention verbs', () => {
    expect(
      catalog
        .getAllTools()
        .map((t) => t.name)
        .sort()
    ).toEqual(['show_component', 'show_flow', 'show_form']);
  });

  it('registers schemas only — the server never sees React', () => {
    for (const tool of catalog.getAllTools()) {
      expect(tool.renderer).toBeUndefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('describes each tool for the model', () => {
    expect(catalog.getTool('show_form')?.description).toContain('form');
    expect(catalog.getTool('show_component')?.description).toContain('component');
  });

  it('is immutable — .use() returns a new instance', () => {
    const base = ril.create();
    expect(base.use(uiTools())).not.toBe(base);
    expect(base.getAllTools()).toEqual([]);
  });

  it('validates a recursive ComponentNode tree', () => {
    const schema = catalog.getTool('show_component')?.inputSchema;
    // zod's `~standard.validate` resolves synchronously for schemas with no
    // async refinements — componentNodeSchema has none — so the result is
    // asserted directly rather than defensively unwrapped from a Promise.
    const result = schema?.['~standard'].validate({
      node: {
        type: 'select',
        props: { label: 'A' },
        children: [{ type: 'select', props: { label: 'B' } }],
      },
    });
    expect(result).toEqual({
      value: {
        node: {
          type: 'select',
          props: { label: 'A' },
          children: [{ type: 'select', props: { label: 'B' } }],
        },
      },
    });
  });

  it('rejects a node whose type is not a string', () => {
    const schema = catalog.getTool('show_component')?.inputSchema;
    const result = schema?.['~standard'].validate({ node: { type: 42 } });
    expect(result && 'issues' in result ? result.issues : undefined).toEqual([
      expect.objectContaining({ path: ['node', 'type'], code: 'invalid_type' }),
    ]);
  });
});
