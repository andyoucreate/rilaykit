import type { ComponentConfig, RilayInstance } from '@rilaykit/core';

/**
 * Legacy cast for the form builder: entries registered via addComponent keep
 * the flat ComponentConfig shape (id, flat renderer, useFieldRenderer) at
 * runtime. FormField consumes ComponentEntry directly since Task 8; delete
 * this once the builder does too (Task 16).
 *
 * @internal
 */
export function getLegacyComponentConfig<C>(
  config: Pick<RilayInstance<C>, 'getComponent'>,
  type: string
): ComponentConfig | undefined {
  return config.getComponent(type) as unknown as ComponentConfig | undefined;
}
