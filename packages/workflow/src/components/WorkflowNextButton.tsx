import type { ComponentRendererBaseProps, WorkflowNextButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export function WorkflowNextButton({
  className,
  ...props
}: ComponentRendererBaseProps<WorkflowNextButtonRendererProps>) {
  const { context, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { submit, formState } = useFormContext();

  const canGoNext = !workflowState.isTransitioning && !workflowState.isSubmitting;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!canGoNext) return;

    await submit(event);
  };

  const baseProps: WorkflowNextButtonRendererProps = {
    isLastStep: context.isLastStep,
    canGoNext,
    isSubmitting: formState.isSubmitting || workflowState.isSubmitting,
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
