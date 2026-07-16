import type { Part as PartType } from 'rilaykit';
import { manifest, ril, uiTools } from 'rilaykit';
import { tools as aiSdkTools } from 'rilaykit/ai-sdk';
import { tools as anthropicTools } from 'rilaykit/anthropic';
import { Catalog, Part, Parts } from 'rilaykit/react';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

/**
 * THE TRIPWIRE for the DX-1 class: the spec's route-handler + client usage,
 * type-checked end to end. A fluently built catalog (typed components + tools
 * + uiTools plugin) MUST flow through every consumer entry point — manifest,
 * both tools() adapters, <Catalog>, <Parts>, <Part> — WITHOUT a cast.
 *
 * This file exists because the bug was invisible: every package tsconfig
 * excludes test files from `tsc --noEmit`, so no REAL catalog was ever
 * type-checked against the consumers. This file IS in the type-check graph
 * (vitest's typecheck pass, tsconfig.vitest.json).
 */

// The spec's `lib/catalog.ts` blueprint: typed components + tools + plugin.
const catalog = ril
  .create()
  .component('card', {
    description: 'A titled card',
    propsSchema: z.object({ title: z.string() }),
  })
  .tool('get_weather', {
    description: 'Get the weather for a city',
    inputSchema: z.object({ city: z.string() }),
  })
  .use(uiTools());

const textPart: PartType = { type: 'text', text: 'hello', state: 'done' };

describe('spec usage: a fluent all-in-one catalog flows through every consumer', () => {
  it('manifest(catalog) accepts the fluent catalog (route handler)', () => {
    expectTypeOf(manifest(catalog)).toBeString();
  });

  it('ai-sdk tools(catalog) accepts the fluent catalog (route handler)', () => {
    aiSdkTools(catalog);
  });

  it('anthropic tools(catalog) accepts the fluent catalog (route handler)', () => {
    anthropicTools(catalog);
  });

  it('<Catalog value>, <Parts catalog>, <Part catalog> accept the fluent catalog (client)', () => {
    <Catalog value={catalog}>
      <Parts parts={[textPart]} catalog={catalog} />
      <Part part={textPart} catalog={catalog} />
    </Catalog>;
  });
});

describe('DX-3: the all-in-one ril.create() default generic must not poison props', () => {
  it('gives .renderers() ctx.props the real inferred props type, not never', () => {
    ril
      .create()
      .component('card', { propsSchema: z.object({ title: z.string() }) })
      .renderers({
        components: {
          card: (ctx) => {
            expectTypeOf(ctx.props).toEqualTypeOf<{ title: string }>();
            return <div>{ctx.props.title}</div>;
          },
        },
      });
  });

  it('rejects a typo’d renderer key at the type level', () => {
    ril
      .create()
      .component('card', { propsSchema: z.object({ title: z.string() }) })
      .renderers({
        components: {
          // @ts-expect-error — "cardTYPO" is not a registered component key
          cardTYPO: (_ctx) => <div />,
        },
      });
  });
});
