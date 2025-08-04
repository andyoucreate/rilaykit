import type {
  ComponentRendererBaseProps,
  WorkflowPreviousButtonRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowPreviousButtonProps
  extends ComponentRendererBaseProps<WorkflowPreviousButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export function WorkflowPreviousButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowPreviousButtonProps) {
  const { context, goPrevious, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { formState } = useFormContext();

  const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
  const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;

  const canGoPrevious =
    context.currentStepIndex > 0 && !workflowState.isTransitioning && !finalIsSubmitting;

  const handlePrevious = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoPrevious) return;
    await goPrevious();
  };

  const baseProps: WorkflowPreviousButtonRendererProps = {
    canGoPrevious,
    isSubmitting: finalIsSubmitting,
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
