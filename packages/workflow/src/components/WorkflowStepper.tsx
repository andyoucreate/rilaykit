import type { RendererChildrenFunction, WorkflowStepperRendererProps } from '@rilaykit/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowStepperProps {
  onStepClick?: (stepIndex: number) => void;
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<WorkflowStepperRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function WorkflowStepper({
  onStepClick,
  className,
  children,
  renderAs,
}: WorkflowStepperProps) {
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

  const baseProps = {
    steps: workflowState.resolvedSteps,
    currentStepIndex: workflowState.currentStepIndex,
    visitedSteps: workflowState.visitedSteps,
    onStepClick: handleStepClick,
    className,
  };

  // If renderAs is 'children' or true, use children as renderer
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        'When renderAs="children" is used, children must be a function that returns React elements'
      );
    }
    return children(baseProps);
  }

  // Default behavior: use configured renderer
  const stepperRenderer = workflowConfig.renderConfig?.stepperRenderer;

  if (!stepperRenderer) {
    throw new Error(
      `No stepperRenderer configured for workflow "${workflowConfig.id}". Please configure a stepperRenderer using config.setStepperRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // WorkflowStepperRendererProps doesn't have children, so we just pass the base props
  const stepperProps: WorkflowStepperRendererProps = baseProps;

  return stepperRenderer(stepperProps);
}

export default WorkflowStepper;
