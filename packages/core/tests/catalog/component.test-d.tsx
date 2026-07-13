import { ril } from '@rilaykit/core';
import type { ComponentRenderContext } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

describe('propsSchema type inference', () => {
  it('infers renderer ctx props from the zod schema', () => {
    ril.create().component('select', {
      propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
      renderer: (ctx) => {
        expectTypeOf(ctx).toMatchTypeOf<
          ComponentRenderContext<{ label: string; options: string[] }>
        >();
        expectTypeOf(ctx.props.label).toBeString();
        return <div />;
      },
    });
  });

  it('accumulates the component map in the instance generic', () => {
    const r = ril.create().component('select', {
      propsSchema: z.object({ label: z.string() }),
    });
    const entry = r.getComponent('select');
    expectTypeOf(entry!.propsSchema!).toMatchTypeOf<StandardSchemaV1<unknown, { label: string }>>();
  });
});
