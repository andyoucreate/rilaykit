import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src';
import { ConfigurationError } from '../../src/errors';
import { Catalog, useCatalog, useCatalogEntry, useCatalogOrNull } from '../../src/react';

const catalog = ril
  .create()
  .component('badge', { description: 'A badge' })
  .part('text', { renderer: () => <p /> })
  .tool('search', { description: 'Search things' });

function Probe() {
  const value = useCatalog();
  return <span>{value.getTool('search')?.description}</span>;
}

describe('Catalog context', () => {
  it('exposes the catalog to descendants', () => {
    render(
      <Catalog value={catalog}>
        <Probe />
      </Catalog>
    );
    expect(screen.getByText('Search things')).toBeInTheDocument();
  });

  it('throws a typed ConfigurationError outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(ConfigurationError);
  });

  it('useCatalogOrNull returns null outside a provider — the explicit-catalog-prop alternative', () => {
    let captured: unknown = 'untouched';
    function NullProbe() {
      captured = useCatalogOrNull();
      return null;
    }
    render(<NullProbe />);
    expect(captured).toBeNull();
  });

  it('useCatalogEntry resolves each namespace to ITS entry — and misses to undefined', () => {
    const captured: Record<string, unknown> = {};
    function EntryProbe() {
      captured.component = useCatalogEntry('component', 'badge');
      captured.tool = useCatalogEntry('tool', 'search');
      captured.part = useCatalogEntry('part', 'text');
      captured.miss = useCatalogEntry('component', 'search');
      return null;
    }
    render(
      <Catalog value={catalog}>
        <EntryProbe />
      </Catalog>
    );
    expect((captured.component as { description?: string }).description).toBe('A badge');
    expect((captured.tool as { description?: string }).description).toBe('Search things');
    expect(captured.part).toBeDefined();
    // The namespaces never bleed: a tool name is not a component name.
    expect(captured.miss).toBeUndefined();
  });
});
