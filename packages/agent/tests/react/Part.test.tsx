import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfigurationError, ril } from '@rilaykit/core';
import { Catalog } from '@rilaykit/core/react';
import { Part } from '../../src/react/Part';

const catalog = ril
  .create()
  .part('text', { renderer: ({ part }) => <p>{part.text}</p> })
  .tool('search_flights', {
    description: 'Search flights',
    renderer: ({ state, input, resolve }) => (
      <button type="button" onClick={() => resolve({ picked: 'AF123' })}>
        {state}:{(input as { from?: string }).from}
      </button>
    ),
  });

function mount(ui: React.ReactNode) {
  return render(<Catalog value={catalog}>{ui}</Catalog>);
}

describe('<Part>', () => {
  it('resolves a text part through the part: namespace', () => {
    mount(<Part part={{ type: 'text', text: 'bonjour' }} />);
    expect(screen.getByText('bonjour')).toBeInTheDocument();
  });

  it('hands a tool renderer its state and input', () => {
    mount(<Part part={{ type: 'tool', toolCallId: 'c1', name: 'search_flights', state: 'streaming', input: { from: 'CDG' } }} />);
    expect(screen.getByRole('button')).toHaveTextContent('streaming:CDG');
  });

  it('wires resolve() to onResolve with the toolCallId — the HITL mirror', async () => {
    const onResolve = vi.fn();
    mount(<Part part={{ type: 'tool', toolCallId: 'c1', name: 'search_flights', state: 'ready', input: {} }} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('c1', { picked: 'AF123' });
  });

  it('falls back to a humanized name for an unregistered tool', () => {
    mount(<Part part={{ type: 'tool', toolCallId: 'c2', name: 'search_hotels', state: 'ready', input: {} }} />);
    expect(screen.getByText('Search hotels')).toBeInTheDocument();
  });

  it.each(['toString', 'constructor', '__proto__'])(
    'a tool named %s falls back to the DefaultTool marker — the built-in lookup never resolves an inherited Object member',
    (name) => {
      mount(<Part part={{ type: 'tool', toolCallId: 'c9', name, state: 'ready', input: {} }} />);
      const marker = document.querySelector('[data-part="tool"]');
      expect(marker).not.toBeNull();
      expect(marker?.getAttribute('data-tool-name')).toBe(name);
    }
  );

  it('prefers a consumer fallback over the built-in one', () => {
    const Fallback = ({ part }: { part: Part }) => <em>custom:{part.type}</em>;
    mount(<Part part={{ type: 'tool', toolCallId: 'c3', name: 'nope', state: 'ready', input: {} }} fallback={Fallback} />);
    expect(screen.getByText('custom:tool')).toBeInTheDocument();
  });

  it('renders nothing for an unregistered part type rather than crashing', () => {
    const { container } = mount(<Part part={{ type: 'data', name: 'usage', data: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders using an explicit catalog prop with no <Catalog> ancestor', () => {
    render(
      <Part
        part={{ type: 'tool', toolCallId: 'c4', name: 'search_flights', state: 'streaming', input: { from: 'CDG' } }}
        catalog={catalog}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('streaming:CDG');
  });

  it('throws a ConfigurationError with neither a catalog prop nor a <Catalog> ancestor', () => {
    expect(() =>
      render(<Part part={{ type: 'tool', toolCallId: 'c5', name: 'search_flights', state: 'ready', input: {} }} />)
    ).toThrow(ConfigurationError);
  });
});
