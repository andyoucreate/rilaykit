import type { ComponentRendererBaseProps, WorkflowStepperRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useMemo } from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepperProps
  extends ComponentRendererBaseProps<WorkflowStepperRendererProps> {
  onStepClick?: (stepIndex: number) => void;
}

export function WorkflowStepper({ onStepClick, className, ...props }: WorkflowStepperProps) {
  const { workflowConfig, workflowState, goToStep, conditionsHelpers } = useWorkflowContext();

  // Filter visible steps and create mapping between visible and original indices
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

  // Handle step click with index mapping
  const handleStepClick = (visibleStepIndex: number) => {
    const originalStepIndex = visibleToOriginalIndexMap.get(visibleStepIndex);
    if (originalStepIndex === undefined) return;

    if (onStepClick) {
      onStepClick(originalStepIndex);
    } else {
      // Default behavior: navigate to step
      goToStep(originalStepIndex);
    }
  };

  // Calculate current step index in visible steps context
  const currentVisibleStepIndex =
    originalToVisibleIndexMap.get(workflowState.currentStepIndex) ?? -1;

  const baseProps: WorkflowStepperRendererProps = {
    steps: visibleSteps,
    currentStepIndex: currentVisibleStepIndex,
    visitedSteps: workflowState.visitedSteps,
    onStepClick: handleStepClick,
    className,
  };

  return (
    <ComponentRendererWrapper
      name="WorkflowStepper"
      renderer={workflowConfig.renderConfig?.stepperRenderer}
      props={baseProps}
      {...props}
    />
  );
}

export default WorkflowStepper;
