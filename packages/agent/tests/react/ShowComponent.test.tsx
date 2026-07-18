import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Part } from '../../src/react/Part';
import { MAX_NODE_DEPTH } from '../../src/react/fallbacks/ShowComponent';
import { uiTools } from '../../src/tools/ui-tools';

let probedProps: Record<string, unknown> | null = null;

const catalog = ril
  .create()
  .component('probe', {
    description: 'Records the props its renderer receives',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props }) => {
      probedProps = props;
      return <span>{String(props.label)}</span>;
    },
  })
  .component('bomb', {
    description: 'A renderer that throws',
    propsSchema: z.object({}),
    renderer: () => {
      throw new Error('renderer exploded');
    },
  })
  .component('stack', {
    description: 'Vertical stack',
    propsSchema: z.object({ gap: z.number() }),
    renderer: ({ props, children }) => <div data-gap={props.gap}>{children}</div>,
  })
  .component('badge', {
    description: 'A badge',
    propsSchema: z.object({ label: z.string() }),
    renderer: ({ props }) => <span>{props.label}</span>,
  })
  .component('ghost', {
    description: 'Registered as a schema-only entry — no renderer attached',
    propsSchema: z.object({}),
  })
  .use(uiTools());

/** Builds a chain of `length` nodes: `length - 1` nested stacks around a badge leaf. */
function deepTree(length: number): unknown {
  let node: unknown = { type: 'badge', props: { label: 'leaf' } };
  for (let index = 1; index < length; index += 1) {
    node = { type: 'stack', props: { gap: 1 }, children: [node] };
  }
  return node;
}

function showComponent(node: unknown, state: 'streaming' | 'ready' = 'ready') {
  return render(
    <Catalog value={catalog}>
      <Part
        part={{ type: 'tool', toolCallId: 'c1', name: 'show_component', state, input: { node } }}
      />
    </Catalog>
  );
}

describe('show_component built-in renderer', () => {
  it('renders a leaf node with validated props', () => {
    showComponent({ type: 'badge', props: { label: 'New' } });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('resolves a tree recursively and hands each renderer its rendered children', () => {
    showComponent({
      type: 'stack',
      props: { gap: 8 },
      children: [
        { type: 'badge', props: { label: 'A' } },
        { type: 'badge', props: { label: 'B' } },
      ],
    });
    const stack = document.querySelector('[data-gap="8"]');
    expect(stack?.textContent).toBe('AB');
  });

  it('renders a 5-LEVEL heterogeneous tree with the exact nesting — every level receives its own validated props and its rendered children', () => {
    showComponent({
      type: 'stack',
      props: { gap: 1 },
      children: [
        {
          type: 'stack',
          props: { gap: 2 },
          children: [
            {
              type: 'stack',
              props: { gap: 3 },
              children: [
                {
                  type: 'stack',
                  props: { gap: 4 },
                  children: [{ type: 'badge', props: { label: 'level-5-leaf' } }],
                },
                { type: 'badge', props: { label: 'level-4-sibling' } },
              ],
            },
          ],
        },
        { type: 'badge', props: { label: 'level-2-sibling' } },
      ],
    });
    // The exact DOM chain: each stack is the DIRECT child of the one above it —
    // children are handed to the parent renderer already rendered, at every depth.
    const level5 = document.querySelector(
      '[data-gap="1"] > [data-gap="2"] > [data-gap="3"] > [data-gap="4"]'
    );
    expect(level5).not.toBeNull();
    expect(level5?.textContent).toBe('level-5-leaf');
    // Siblings at intermediate depths land in THEIR level, not the leaf's.
    expect(document.querySelector('[data-gap="3"]')?.textContent).toBe(
      'level-5-leaflevel-4-sibling'
    );
    expect(document.querySelector('[data-gap="1"]')?.textContent).toBe(
      'level-5-leaflevel-4-sibling' + 'level-2-sibling'
    );
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
  });

  it('ISOLATES a failing node — its siblings still render', () => {
    showComponent({
      type: 'stack',
      props: { gap: 8 },
      children: [
        { type: 'badge', props: { labl: 'typo' } }, // invalid props
        { type: 'badge', props: { label: 'survivor' } },
      ],
    });
    expect(screen.getByText('survivor')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('names the expected keys so the model can retry', () => {
    showComponent({ type: 'badge', props: { labl: 'typo' } });
    expect(document.querySelector('[data-agent-error-path="label"]')).not.toBeNull();
  });

  it('reports an unknown component type instead of crashing', () => {
    showComponent({ type: 'buton', props: {} });
    expect(screen.getByText(/buton/)).toBeInTheDocument();
  });

  it('renders NOTHING while the part is streaming — partial input must not produce error views', () => {
    const { container } = showComponent(
      { type: 'stack', props: { gap: 8 }, children: undefined },
      'streaming'
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the tree once the same part reaches ready', () => {
    showComponent({ type: 'badge', props: { label: 'now-ready' } }, 'ready');
    expect(screen.getByText('now-ready')).toBeInTheDocument();
  });

  it('reports a component that EXISTS in the catalog but has no renderer attached — a schema-only entry is not renderable', () => {
    showComponent({
      type: 'stack',
      props: { gap: 2 },
      children: [
        { type: 'ghost', props: {} },
        { type: 'badge', props: { label: 'survivor' } },
      ],
    });
    expect(screen.getByText('No renderer attached for component "ghost"')).toBeInTheDocument();
    // The failure is LOCAL: the sibling still renders.
    expect(screen.getByText('survivor')).toBeInTheDocument();
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats a %s component type as UNKNOWN — the catalog lookup never resolves an inherited Object member',
    (type) => {
      showComponent({ type, props: {} });
      expect(screen.getByText(`Unknown component "${type}"`)).toBeInTheDocument();
      expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
    }
  );

  it('reports a malformed node instead of crashing', () => {
    showComponent({ nope: true });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });

  it('caps recursion — a 10,000-deep tree yields an error view, not a stack overflow', () => {
    showComponent(deepTree(10_000));
    expect(
      screen.getByText(`Component tree too deep: the maximum depth is ${MAX_NODE_DEPTH}`)
    ).toBeInTheDocument();
  });

  it('renders a tree exactly at the depth cap', () => {
    showComponent(deepTree(MAX_NODE_DEPTH));
    expect(screen.getByText('leaf')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-error="emission"]')).toBeNull();
  });

  it('errors one past the depth cap, and the SIBLING of the too-deep subtree still renders', () => {
    showComponent({
      type: 'stack',
      props: { gap: 0 },
      children: [deepTree(MAX_NODE_DEPTH), { type: 'badge', props: { label: 'survivor' } }],
    });
    expect(screen.getByText('survivor')).toBeInTheDocument();
    expect(
      screen.getByText(`Component tree too deep: the maximum depth is ${MAX_NODE_DEPTH}`)
    ).toBeInTheDocument();
    expect(screen.queryByText('leaf')).not.toBeInTheDocument();
  });

  it('hands the renderer the PARSED props — an excess hostile key is stripped', () => {
    probedProps = null;
    showComponent({
      type: 'probe',
      props: { label: 'safe', dangerouslySetInnerHTML: { __html: '<img onerror=x>' } },
    });
    expect(screen.getByText('safe')).toBeInTheDocument();
    expect(probedProps).toEqual({ label: 'safe' });
  });

  it('CONTAINS a throwing renderer — its sibling still renders, nothing propagates', () => {
    // React logs boundary-caught errors to console.error in dev; scoped test plumbing.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      showComponent({
        type: 'stack',
        props: { gap: 4 },
        children: [
          { type: 'bomb', props: {} },
          { type: 'badge', props: { label: 'still-here' } },
        ],
      });
      expect(screen.getByText('still-here')).toBeInTheDocument();
      expect(screen.getByText('renderer exploded')).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('reports non-array children instead of crashing', () => {
    showComponent({ type: 'stack', props: { gap: 8 }, children: 'nope' });
    expect(
      screen.getByText(
        'Invalid "children" on component "stack": expected an array of component nodes, got string'
      )
    ).toBeInTheDocument();
  });
});
