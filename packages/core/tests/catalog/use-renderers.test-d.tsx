import { ril } from '@rilaykit/core';
import type { ComponentRenderContext } from '@rilaykit/core';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

describe('.renderers() static typing', () => {
  it('rejects component keys that are not registered', () => {
    const base = ril.create().component('text', {
      propsSchema: z.object({ label: z.string() }),
    });
    // @ts-expect-error — unknown component key is rejected statically
    base.renderers({ components: { nope: () => <i /> } });
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
