import { NotFoundError, ril } from '@rilaykit/core';
import type { RilayPlugin, ToolRenderContext } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('ril.use()', () => {
  it('applies the plugin to the current instance, preserving prior registrations', () => {
    const plugin: RilayPlugin = (r) => r.tool('show_form', { description: 'from plugin' });
    const base = ril.create().component('text', { description: 'base' });
    const r = base.use(plugin);
    expect(r.getComponent('text')?.description).toBe('base');
    expect(r.getTool('show_form')?.description).toBe('from plugin');
    // immutability: the pre-use instance is unchanged
    expect(base.getTool('show_form')).toBeUndefined();
  });
});

describe('ril.renderers()', () => {
  const textSchema = z.object({ label: z.string() });
  const textMeta = { group: 'inputs' };
  const textRenderer = ({ id }: { id: string }) => <input data-id={id} />;
  const toolRenderer = (ctx: ToolRenderContext) => <div data-state={ctx.state} />;

  it('attaches renderers to existing entries without touching schemas', () => {
    const base = ril
      .create()
      .component('text', { description: 'kept', propsSchema: textSchema, meta: textMeta })
      .tool('show_form', { description: 'kept too' });
    const r = base.renderers({
      components: { text: textRenderer },
      tools: { show_form: toolRenderer },
    });
    expect(r.getComponent('text')?.renderer).toBe(textRenderer);
    expect(r.getComponent('text')?.description).toBe('kept');
    expect(r.getComponent('text')?.propsSchema).toBe(textSchema);
    // meta is deep-cloned at registration (immutability), so structural — not
    // referential — equality is the contract.
    expect(r.getComponent('text')?.meta).toEqual(textMeta);
    expect(r.getTool('show_form')?.renderer).toBe(toolRenderer);
    expect(r.getTool('show_form')?.description).toBe('kept too');
    // immutability
    expect(base.getComponent('text')?.renderer).toBeUndefined();
    expect(base.getTool('show_form')?.renderer).toBeUndefined();
  });

  it('overrides a part renderer while preserving the rest of the entry', () => {
    const initialPartRenderer = () => <span />;
    const partRenderer = () => <em />;
    const partMeta = { collapsible: true };
    const base = ril.create().part('reasoning', { renderer: initialPartRenderer, meta: partMeta });
    const r = base.renderers({ parts: { reasoning: partRenderer } });
    expect(r.getPart('reasoning')?.renderer).toBe(partRenderer);
    // meta is deep-cloned at registration (immutability), so structural equality.
    expect(r.getPart('reasoning')?.meta).toEqual(partMeta);
    // immutability
    expect(base.getPart('reasoning')?.renderer).toBe(initialPartRenderer);
  });

  it('throws NotFoundError with the namespaced key for unknown entries', () => {
    const r = ril.create();

    const componentError = catchError(() => r.renderers({ components: { ghost: () => <i /> } }));
    expect(componentError).toBeInstanceOf(NotFoundError);
    expect((componentError as NotFoundError).meta).toEqual({ key: 'component:ghost' });

    const toolError = catchError(() => r.renderers({ tools: { ghost: () => <i /> } }));
    expect(toolError).toBeInstanceOf(NotFoundError);
    expect((toolError as NotFoundError).meta).toEqual({ key: 'tool:ghost' });

    const partError = catchError(() => r.renderers({ parts: { ghost: () => <i /> } }));
    expect(partError).toBeInstanceOf(NotFoundError);
    expect((partError as NotFoundError).meta).toEqual({ key: 'part:ghost' });
  });
});
