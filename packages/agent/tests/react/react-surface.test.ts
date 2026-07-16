import * as agentReact from '@rilaykit/agent/react';
import * as coreReact from '@rilaykit/core/react';
import * as rilaykitReact from 'rilaykit/react';
import { describe, expect, it } from 'vitest';

/**
 * DX-4: the agent react surface re-exports core's catalog context hooks so
 * the all-in-one `rilaykit/react` (which only re-exports @rilaykit/agent/react)
 * can reach them. `useCatalogOrNull` was added to core in a review fix but
 * never re-exported here — locked in by identity, not just presence.
 */
describe('@rilaykit/agent/react catalog context surface', () => {
  it('re-exports useCatalogOrNull from core', () => {
    expect(agentReact.useCatalogOrNull).toBe(coreReact.useCatalogOrNull);
  });

  it('flows useCatalogOrNull through the all-in-one rilaykit/react', () => {
    expect(rilaykitReact.useCatalogOrNull).toBe(coreReact.useCatalogOrNull);
  });

  it('keeps the existing catalog context exports intact', () => {
    expect(agentReact.Catalog).toBe(coreReact.Catalog);
    expect(agentReact.useCatalog).toBe(coreReact.useCatalog);
    expect(agentReact.useCatalogEntry).toBe(coreReact.useCatalogEntry);
  });
});
