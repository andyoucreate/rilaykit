import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { useCatalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Parts } from '../../src/react/Parts';
import { uiTools } from '../../src/tools/ui-tools';

/**
 * Round 24: the `catalog` prop on <Parts>/<Part> is documented as an alternative
 * to mounting a <Catalog> provider ("Explicit override; defaults to the nearest
 * <Catalog>"). It reached tool DISPATCH (getTool) but was never threaded into
 * context, so the built-in renderers (ShowForm/ShowFlow/ShowComponent) — and any
 * custom renderer — call useCatalog() and threw, crashing the whole <Parts> list.
 */
const catalog = ril
  .create()
  .use(uiTools())
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .component('note', {
    description: 'A note',
    propsSchema: z.object({ text: z.string() }),
    renderer: ({ props }: ComponentRenderContext) => <p>{String(props.text)}</p>,
  });

describe('Round 24: the catalog prop feeds the rendered subtree (no <Catalog> provider)', () => {
  it('a built-in show_form renders from the catalog PROP alone', () => {
    render(
      <Parts
        catalog={catalog}
        parts={[
          {
            type: 'tool',
            toolCallId: 'f1',
            name: 'show_form',
            state: 'ready',
            input: {
              schema: {
                id: 'contact',
                fields: [{ id: 'title', type: 'note', props: { text: 'hi' } }],
              },
            },
          },
        ]}
      />
    );
    // Previously: ConfigurationError "useCatalog must be used within a <Catalog>".
    expect(screen.queryByText('hi')).not.toBeNull();
  });

  it('a built-in show_component renders from the catalog PROP alone', () => {
    render(
      <Parts
        catalog={catalog}
        parts={[
          {
            type: 'tool',
            toolCallId: 'c1',
            name: 'show_component',
            state: 'ready',
            input: { node: { type: 'note', props: { text: 'node-text' } } },
          },
        ]}
      />
    );
    expect(screen.queryByText('node-text')).not.toBeNull();
  });

  it('a custom tool renderer that reads useCatalog() sees the prop catalog', () => {
    const withCustom = catalog.tool('probe', {
      description: 'probe',
      renderer: () => {
        // Throws if the prop was not threaded into context.
        const c = useCatalog();
        return <span>catalog:{typeof c.getTool}</span>;
      },
    });
    render(
      <Parts
        catalog={withCustom}
        parts={[{ type: 'tool', toolCallId: 'p1', name: 'probe', state: 'ready', input: {} }]}
      />
    );
    expect(screen.queryByText('catalog:function')).not.toBeNull();
  });

  it('one built-in part does not crash sibling text parts', () => {
    render(
      <Parts
        catalog={catalog}
        parts={[
          { type: 'text', text: 'before', state: 'done' },
          {
            type: 'tool',
            toolCallId: 'f2',
            name: 'show_form',
            state: 'ready',
            input: {
              schema: { id: 'x', fields: [{ id: 't', type: 'note', props: { text: 'mid' } }] },
            },
          },
          { type: 'text', text: 'after', state: 'done' },
        ]}
      />
    );
    expect(screen.queryByText('before')).not.toBeNull();
    expect(screen.queryByText('after')).not.toBeNull();
  });
});
