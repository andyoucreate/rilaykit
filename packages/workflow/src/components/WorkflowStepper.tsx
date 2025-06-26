import type { WorkflowStepperRendererProps } from '@streamline/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepperProps {
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export function WorkflowStepper({ onStepClick, className }: WorkflowStepperProps) {
  const { workflowConfig, workflowState, goToStep } = useWorkflowContext();

  const stepperRenderer = workflowConfig.renderConfig?.stepperRenderer;

  if (!stepperRenderer) {
    throw new Error(
      `No stepperRenderer configured for workflow "${workflowConfig.id}". Please configure a stepperRenderer using config.setStepperRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // Handle step click with optional override
  const handleStepClick = (stepIndex: number) => {
    if (onStepClick) {
      onStepClick(stepIndex);
    } else {
      // Default behavior: navigate to step
      goToStep(stepIndex);
    }
  };

  const stepperProps: WorkflowStepperRendererProps = {
    steps: workflowState.resolvedSteps,
    currentStepIndex: workflowState.currentStepIndex,
    visitedSteps: workflowState.visitedSteps,
    onStepClick: handleStepClick,
    className,
  };

  return stepperRenderer(stepperProps);
}

export default WorkflowStepper;
