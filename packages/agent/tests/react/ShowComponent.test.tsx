import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Part } from '../../src/react/Part';
import { uiTools } from '../../src/tools/ui-tools';

const catalog = ril
  .create()
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
  .use(uiTools());

function showComponent(node: unknown) {
  return render(
    <Catalog value={catalog}>
      <Part part={{ type: 'tool', toolCallId: 'c1', name: 'show_component', state: 'ready', input: { node } }} />
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

  it('ISOLATES a failing node — its siblings still render', () => {
    showComponent({
      type: 'stack',
      props: { gap: 8 },
      children: [
        { type: 'badge', props: { labl: 'typo' } },   // invalid props
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

  it('reports a malformed node instead of crashing', () => {
    showComponent({ nope: true });
    expect(document.querySelector('[data-agent-error="emission"]')).not.toBeNull();
  });
});
