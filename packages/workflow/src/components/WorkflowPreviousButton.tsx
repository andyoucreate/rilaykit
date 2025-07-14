import type {
  ComponentRendererBaseProps,
  WorkflowPreviousButtonRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export function WorkflowPreviousButton({
  className,
  ...props
}: ComponentRendererBaseProps<WorkflowPreviousButtonRendererProps>) {
  const { context, goPrevious, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { formState } = useFormContext();

  const canGoPrevious =
    context.currentStepIndex > 0 && !workflowState.isTransitioning && !workflowState.isSubmitting;

  const handlePrevious = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoPrevious) return;
    await goPrevious();
  };

  const baseProps: WorkflowPreviousButtonRendererProps = {
    canGoPrevious,
    onPrevious: handlePrevious,
    className,
    // Step data
    currentStep,
    stepData: formState.values || {},
    allData: context.allData,
    context,
  };

  return (
    <ComponentRendererWrapper
      name="WorkflowPreviousButton"
      renderer={workflowConfig.renderConfig?.previousButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
}

export default WorkflowPreviousButton;
