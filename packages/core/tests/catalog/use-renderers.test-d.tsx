import { ril } from '@rilaykit/core';
import type { ComponentRenderContext, RilayPlugin, ToolRenderContext } from '@rilaykit/core';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

describe('.use() static typing', () => {
  it('exposes RilayPlugin as the public plugin type', () => {
    const plugin: RilayPlugin = (r) => {
      expectTypeOf(r).toEqualTypeOf<ril<Record<string, unknown>>>();
      return r.tool('search', { description: 'Search' });
    };
    expectTypeOf(ril.create().use(plugin)).toEqualTypeOf<ril<unknown>>();
  });
});

describe('.renderers() static typing', () => {
  it('rejects component keys that are not registered', () => {
    const base = ril.create().component('text', {
      propsSchema: z.object({ label: z.string() }),
    });
    // @ts-expect-error — unknown component key is rejected statically
    base.renderers({ components: { nope: () => <i /> } });
  });

  it('gives tool renderers a usable ToolRenderContext (resolve is callable)', () => {
    const base = ril.create().tool('search', { description: 'Search' });
    base.renderers({
      tools: {
        search: (ctx) => {
          expectTypeOf(ctx).toEqualTypeOf<ToolRenderContext<unknown, unknown>>();
          ctx.resolve({ ok: true });
          return <div data-state={ctx.state} />;
        },
      },
    });
  });

  it('types the renderer ctx from the registered props', () => {
    const base = ril.create().component('text', {
      propsSchema: z.object({ label: z.string() }),
    });
    base.renderers({
      components: {
        text: (ctx) => {
          expectTypeOf(ctx).toMatchTypeOf<ComponentRenderContext<{ label: string }>>();
          expectTypeOf(ctx.props.label).toBeString();
          return <input aria-label={ctx.props.label} />;
        },
      },
    });
  });
});
