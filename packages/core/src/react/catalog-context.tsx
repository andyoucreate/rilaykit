import type React from 'react';
import { createContext, useContext } from 'react';
import type { RilayInstance } from '../config/ril';
import { ConfigurationError } from '../errors';
import type { CatalogEntry } from '../types/catalog';

type AnyCatalog = RilayInstance<Record<string, unknown>>;

const CatalogContext = createContext<AnyCatalog | null>(null);

export interface CatalogProps {
  readonly value: AnyCatalog;
  readonly children: React.ReactNode;
}

/**
 * Makes a catalog available to <Parts>/<Part>. Form/Flow receive their catalog
 * embedded in their config via the builders — for them this provider is an
 * override, not a requirement.
 *
 * Lives behind the `@rilaykit/core/react` subpath on purpose: `@rilaykit/core`
 * itself must stay free of runtime React so the isomorphic `lib/catalog.ts`
 * blueprint can be imported from a server component without tripping
 * "createContext is not supported in Server Components".
 */
export function Catalog({ value, children }: CatalogProps) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
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
