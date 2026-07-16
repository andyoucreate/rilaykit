import { ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Parts } from '../../src/react/Parts';
import type { Part } from '../../src/types/part';

const catalog = ril
  .create()
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .tool('pick', {
    description: 'Pick one',
    renderer: ({ toolCallId, resolve }) => (
      <button type="button" onClick={() => resolve({ id: toolCallId })}>
        pick-{toolCallId}
      </button>
    ),
  });

describe('<Parts>', () => {
  const parts: Part[] = [
    { type: 'text', text: 'first' },
    { type: 'tool', toolCallId: 'c1', name: 'pick', state: 'ready', input: {} },
    { type: 'tool', toolCallId: 'c2', name: 'pick', state: 'ready', input: {} },
  ];

  it('renders every part in order', () => {
    render(
      <Catalog value={catalog}>
        <Parts parts={parts} />
      </Catalog>
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['pick-c1', 'pick-c2']);
  });

  it('routes each part its OWN toolCallId — not the last one rendered', async () => {
    const onResolve = vi.fn();
    render(
      <Catalog value={catalog}>
        <Parts parts={parts} onResolve={onResolve} />
      </Catalog>
    );
    await userEvent.click(screen.getByText('pick-c1'));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { id: 'c1' });
  });

  it('renders an empty list without crashing', () => {
    const { container } = render(
      <Catalog value={catalog}>
        <Parts parts={[]} />
      </Catalog>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
