import type { ComponentConfig, RilayInstance } from '@rilaykit/core';

/**
 * Legacy shape until Task 8: entries registered via addComponent keep the
 * flat ComponentConfig shape (id, flat renderer, useFieldRenderer) at runtime.
 * Delete in Task 8 once forms consume ComponentEntry directly.
 *
 * @internal
 */
export function getLegacyComponentConfig<C>(
  config: Pick<RilayInstance<C>, 'getComponent'>,
  type: string
): ComponentConfig | undefined {
  return config.getComponent(type) as unknown as ComponentConfig | undefined;
}
