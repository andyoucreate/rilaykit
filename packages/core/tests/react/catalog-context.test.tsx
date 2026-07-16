import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src';
import { Catalog, useCatalog } from '../../src/react';
import { ConfigurationError } from '../../src/errors';

const catalog = ril.create().tool('search', { description: 'Search things' });

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
});
