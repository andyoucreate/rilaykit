import type { StepConfig } from '@rilaykit/core';
import { useFlow } from '../components/WorkflowProvider';

export interface StepContextValue {
  step: StepConfig;
  index: number;
  metadata: Record<string, unknown>;
}

/**
 * Access the current step, its index and its metadata.
 */
export function useStep(): StepContextValue {
  const { currentStep, context } = useFlow();
  return {
    step: currentStep,
    index: context.currentStepIndex,
    metadata: currentStep.metadata ?? {},
  };
}
