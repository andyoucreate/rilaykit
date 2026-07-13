/**
 * Test-only accessor for the private namespaced catalog map of a ril instance.
 * Centralizes the unknown-cast so tests never reach for `as any`.
 */
export function entriesOf(config: unknown): Map<string, unknown> {
  return (config as { entries: Map<string, unknown> }).entries;
}
