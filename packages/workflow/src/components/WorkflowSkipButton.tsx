import type { ComponentRendererBaseProps, WorkflowSkipButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowSkipButtonProps
  extends ComponentRendererBaseProps<WorkflowSkipButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export function WorkflowSkipButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowSkipButtonProps) {
  const { currentStep, skipStep, workflowState, workflowConfig, context, conditionsHelpers } =
    useWorkflowContext();
  const { formState } = useFormContext();

  const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
  const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;

  const canSkip =
    (Boolean(currentStep?.allowSkip) ||
      conditionsHelpers.isStepSkippable(workflowState.currentStepIndex)) &&
    !workflowState.isTransitioning &&
    !finalIsSubmitting;

  const handleSkip = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSkip) return;
    await skipStep();
  };

  const baseProps: WorkflowSkipButtonRendererProps = {
    canSkip,
    isSubmitting: finalIsSubmitting,
    onSkip: handleSkip,
    className,
    // Step data
    currentStep,
    stepData: formState.values || {},
    allData: context.allData,
    context,
  };

  return (
    <ComponentRendererWrapper
      name="WorkflowSkipButton"
      renderer={workflowConfig.renderConfig?.skipButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
}

export default WorkflowSkipButton;
