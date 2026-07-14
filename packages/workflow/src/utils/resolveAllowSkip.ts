import type { StepConfig } from '@rilaykit/core';

/**
 * Normalizes `StepConfig.allowSkip` (static boolean or dynamic predicate)
 * into a plain boolean, evaluating predicates against the workflow data.
 */
export function resolveAllowSkip(step: StepConfig, allData: Record<string, unknown>): boolean {
  if (typeof step.allowSkip === 'function') {
    return step.allowSkip({ allData });
  }
  return step.allowSkip === true;
}
