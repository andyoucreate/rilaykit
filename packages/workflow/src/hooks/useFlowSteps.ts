import type { StepConfig } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import { useFlow } from '../components/WorkflowProvider';

export interface FlowStepsContext {
  steps: StepConfig[];
  currentIndex: number;
  goTo: (visibleIndex: number) => void;
}

/**
 * Exposes the VISIBLE workflow steps, the current index within them,
 * and a `goTo` navigator that maps a visible index back to the original one.
 *
 * Visibility computation ported verbatim from WorkflowStepper.tsx (deleted in this task).
 */
export function useFlowSteps(): FlowStepsContext {
  const { workflowConfig, workflowState, goToStep, conditionsHelpers } = useFlow();

  const { visibleSteps, visibleToOriginal, originalToVisible } = useMemo(() => {
    const visible: StepConfig[] = [];
    const toOriginal = new Map<number, number>();
    const toVisible = new Map<number, number>();
    workflowConfig.steps.forEach((step, originalIndex) => {
      if (conditionsHelpers.isStepVisible(originalIndex)) {
        toOriginal.set(visible.length, originalIndex);
        toVisible.set(originalIndex, visible.length);
        visible.push(step);
      }
    });
    return { visibleSteps: visible, visibleToOriginal: toOriginal, originalToVisible: toVisible };
  }, [workflowConfig.steps, conditionsHelpers]);

  const currentIndex = useMemo(
    () => originalToVisible.get(workflowState.currentStepIndex) ?? -1,
    [originalToVisible, workflowState.currentStepIndex]
  );

  const goTo = useCallback(
    (visibleIndex: number) => {
      const originalIndex = visibleToOriginal.get(visibleIndex);
      if (originalIndex === undefined) return;
      void goToStep(originalIndex);
    },
    [visibleToOriginal, goToStep]
  );

  return { steps: visibleSteps, currentIndex, goTo };
}
