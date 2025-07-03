import type { WorkflowPreviousButtonRendererProps } from '@rilaykit/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowPreviousButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowPreviousButton({ className, children }: WorkflowPreviousButtonProps) {
  const { workflowConfig, context, goPrevious, workflowState } = useWorkflowContext();

  const renderer = workflowConfig.renderConfig?.previousButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No previousButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a previousButtonRenderer using config.setWorkflowPreviousButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  const canGoPrevious =
    context.currentStepIndex > 0 &&
    workflowConfig.navigation?.allowBackNavigation !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handlePrevious = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoPrevious) return;
    await goPrevious();
  };

  const props: WorkflowPreviousButtonRendererProps = {
    canGoPrevious,
    onPrevious: handlePrevious,
    className,
    children,
  };

  return renderer(props);
}

export default WorkflowPreviousButton;
