import type { WorkflowSkipButtonRendererProps } from '@rilaykit/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowSkipButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowSkipButton({ className, children }: WorkflowSkipButtonProps) {
  const { workflowConfig, currentStep, skipStep, workflowState } = useWorkflowContext();

  const renderer = workflowConfig.renderConfig?.skipButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No skipButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a skipButtonRenderer using config.setWorkflowSkipButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  const canSkip =
    Boolean(currentStep?.allowSkip) &&
    workflowConfig.navigation?.allowStepSkipping !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handleSkip = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSkip) return;
    await skipStep();
  };

  const props: WorkflowSkipButtonRendererProps = {
    canSkip,
    onSkip: handleSkip,
    className,
    children,
  };

  return renderer(props);
}

export default WorkflowSkipButton;
