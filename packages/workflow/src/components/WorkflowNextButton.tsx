import type { ComponentRendererBaseProps, WorkflowNextButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNextButtonProps
  extends ComponentRendererBaseProps<WorkflowNextButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export function WorkflowNextButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowNextButtonProps) {
  const { context, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { submit, formState } = useFormContext();

  const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
  const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;

  const canGoNext = !workflowState.isTransitioning && !finalIsSubmitting;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!canGoNext) return;

    await submit(event);
  };

  const baseProps: WorkflowNextButtonRendererProps = {
    isLastStep: context.isLastStep,
    canGoNext,
    isSubmitting: finalIsSubmitting,
    onSubmit: handleSubmit,
    className,
    currentStep,
    stepData: formState.values || {},
    allData: context.allData,
    context,
  };

  return (
    <ComponentRendererWrapper
      name="WorkflowNextButton"
      renderer={workflowConfig.renderConfig?.nextButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
}

export default WorkflowNextButton;
