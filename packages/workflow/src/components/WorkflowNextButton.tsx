import type { WorkflowNextButtonRendererProps } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNextButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowNextButton({ className, children }: WorkflowNextButtonProps) {
  const { context, submitWorkflow, workflowState, workflowConfig } = useWorkflowContext();
  const { submit } = useFormContext();

  const renderer = workflowConfig.renderConfig?.nextButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No nextButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a nextButtonRenderer using config.setWorkflowNextButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  const canGoNext = !workflowState.isTransitioning && !workflowState.isSubmitting;

  const handleNext = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoNext) return;
    await submit(event);
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoNext) return;
    await submitWorkflow();
  };

  const props: WorkflowNextButtonRendererProps = {
    isLastStep: context.isLastStep,
    canGoNext,
    isSubmitting: workflowState.isSubmitting,
    onNext: handleNext,
    onSubmit: handleSubmit,
    className,
    children,
  };

  return renderer(props);
}

export default WorkflowNextButton;
