import type { ComponentRendererBaseProps, WorkflowSkipButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export function WorkflowSkipButton({
  className,
  ...props
}: ComponentRendererBaseProps<WorkflowSkipButtonRendererProps>) {
  const { currentStep, skipStep, workflowState, workflowConfig, context, conditionsHelpers } =
    useWorkflowContext();
  const { formState } = useFormContext();

  const canSkip =
    (Boolean(currentStep?.allowSkip) ||
      conditionsHelpers.isStepSkippable(workflowState.currentStepIndex)) &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handleSkip = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSkip) return;
    await skipStep();
  };

  const baseProps: WorkflowSkipButtonRendererProps = {
    canSkip,
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
