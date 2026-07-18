import type React from 'react';
import { createContext, useContext } from 'react';
import type { RilayInstance } from '../config/ril';
import { ConfigurationError } from '../errors';
import type { CatalogEntry } from '../types/catalog';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

const CatalogContext = createContext<AnyCatalog | null>(null);

export interface CatalogProps<C = Record<string, unknown>> {
  readonly value: RilayInstance<C>;
  readonly children: React.ReactNode;
}

/**
 * Makes a catalog available to <Parts>/<Part>. Form/Flow receive their catalog
 * embedded in their config via the builders — for them this provider is an
 * override, not a requirement.
 *
 * Generic over the catalog's component map: `RilayInstance` is invariant in
 * `C` (renderer callbacks are contravariant in their props), so a fixed
 * `RilayInstance<Record<string, unknown>>` prop would reject every fluently
 * built catalog. The context itself stores the erased `AnyCatalog` view —
 * consumers (useCatalog/useCatalogEntry) only use C-independent reads, and
 * generics are erased at runtime, so the widening cast is safe.
 *
 * Lives behind the `@rilaykit/core/react` subpath on purpose: `@rilaykit/core`
 * itself must stay free of runtime React so the isomorphic `lib/catalog.ts`
 * blueprint can be imported from a server component without tripping
 * "createContext is not supported in Server Components".
 */
export function Catalog<C>({ value, children }: CatalogProps<C>) {
  return (
    <CatalogContext.Provider value={value as unknown as AnyCatalog}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): AnyCatalog {
  const value = useContext(CatalogContext);
  if (!value) {
    throw new ConfigurationError('useCatalog must be used within a <Catalog value={...}> provider');
  }
  return value;
}

/**
 * Like useCatalog, but returns null outside a provider — for components that
 * accept an explicit catalog prop as an alternative.
 */
export function useCatalogOrNull(): AnyCatalog | null {
  return useContext(CatalogContext);
}

export function useCatalogEntry(
  kind: 'component' | 'tool' | 'part',
  name: string
): CatalogEntry | undefined {
  const catalog = useCatalog();
  if (kind === 'component') return catalog.getComponent(name) as CatalogEntry | undefined;
  if (kind === 'tool') return catalog.getTool(name) as CatalogEntry | undefined;
  return catalog.getPart(name) as CatalogEntry | undefined;
}
