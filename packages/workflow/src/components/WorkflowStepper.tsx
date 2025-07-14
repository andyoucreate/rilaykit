import type { ComponentRendererBaseProps, WorkflowStepperRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepperProps
  extends ComponentRendererBaseProps<WorkflowStepperRendererProps> {
  onStepClick?: (stepIndex: number) => void;
}

export function WorkflowStepper({ onStepClick, className, ...props }: WorkflowStepperProps) {
  const { workflowConfig, workflowState, goToStep } = useWorkflowContext();

  // Handle step click with optional override
  const handleStepClick = (stepIndex: number) => {
    if (onStepClick) {
      onStepClick(stepIndex);
    } else {
      // Default behavior: navigate to step
      goToStep(stepIndex);
    }
  };

  const baseProps: WorkflowStepperRendererProps = {
    steps: workflowConfig.steps,
    currentStepIndex: workflowState.currentStepIndex,
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
