import type { ComponentRendererBaseProps, WorkflowStepperRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import React, { useCallback, useMemo } from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepperProps
  extends ComponentRendererBaseProps<WorkflowStepperRendererProps> {
  onStepClick?: (stepIndex: number) => void;
}

export const WorkflowStepper = React.memo(function WorkflowStepper({
  onStepClick,
  className,
  ...props
}: WorkflowStepperProps) {
  const { workflowConfig, workflowState, context, goToStep, conditionsHelpers } =
    useWorkflowContext();

  // Filter visible steps and create mapping between visible and original indices
  // Memoize this expensive calculation to avoid recalculation on every render
  const { visibleSteps, visibleToOriginalIndexMap, originalToVisibleIndexMap } = useMemo(() => {
    const visible: typeof workflowConfig.steps = [];
    const visibleToOriginal = new Map<number, number>();
    const originalToVisible = new Map<number, number>();

    workflowConfig.steps.forEach((step, originalIndex) => {
      if (conditionsHelpers.isStepVisible(originalIndex)) {
        const visibleIndex = visible.length;
        visible.push(step);
        visibleToOriginal.set(visibleIndex, originalIndex);
        originalToVisible.set(originalIndex, visibleIndex);
      }
    });

    return {
      visibleSteps: visible,
      visibleToOriginalIndexMap: visibleToOriginal,
      originalToVisibleIndexMap: originalToVisible,
    };
  }, [workflowConfig.steps, conditionsHelpers]);

  // Memoize step click handler to avoid recreation
  const handleStepClick = useCallback(
    (visibleStepIndex: number) => {
      const originalStepIndex = visibleToOriginalIndexMap.get(visibleStepIndex);
      if (originalStepIndex === undefined) return;

      if (onStepClick) {
        onStepClick(originalStepIndex);
      } else {
        // Default behavior: navigate to step
        goToStep(originalStepIndex);
      }
    },
    [visibleToOriginalIndexMap, onStepClick, goToStep]
  );

  // Calculate current step index in visible steps context - memoize to avoid recalculation
  const currentVisibleStepIndex = useMemo(
    () => originalToVisibleIndexMap.get(workflowState.currentStepIndex) ?? -1,
    [originalToVisibleIndexMap, workflowState.currentStepIndex]
  );

  // Memoize base props to avoid recreating object
  // Use visibleVisitedSteps from context (already filtered)
  const baseProps: WorkflowStepperRendererProps = useMemo(
    () => ({
      steps: visibleSteps,
      currentStepIndex: currentVisibleStepIndex,
      visitedSteps: context.visibleVisitedSteps,
      onStepClick: handleStepClick,
      className,
    }),
    [visibleSteps, currentVisibleStepIndex, context.visibleVisitedSteps, handleStepClick, className]
  );

  return (
    <ComponentRendererWrapper
      name="WorkflowStepper"
      renderer={workflowConfig.renderConfig?.stepperRenderer}
      props={baseProps}
      {...props}
    />
  );
});

export default WorkflowStepper;
