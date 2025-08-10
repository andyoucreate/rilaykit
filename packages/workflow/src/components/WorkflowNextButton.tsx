import type { ComponentRendererBaseProps, WorkflowNextButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import React, { useCallback, useMemo } from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNextButtonProps
  extends ComponentRendererBaseProps<WorkflowNextButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export const WorkflowNextButton = React.memo(function WorkflowNextButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowNextButtonProps) {
  const { context, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { submit, formState } = useFormContext();

  // Memoize computed state to avoid recalculation
  const computedState = useMemo(() => {
    const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
    const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;
    const canGoNext = !workflowState.isTransitioning && !finalIsSubmitting;

    return {
      finalIsSubmitting,
      canGoNext,
    };
  }, [
    formState.isSubmitting,
    workflowState.isSubmitting,
    workflowState.isTransitioning,
    overrideIsSubmitting,
  ]);

  // Memoize submit handler to avoid recreation
  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();

      if (!computedState.canGoNext) return;

      await submit(event);
    },
    [computedState.canGoNext, submit]
  );

  // Memoize base props to avoid recreating object
  const baseProps: WorkflowNextButtonRendererProps = useMemo(
    () => ({
      isLastStep: context.isLastStep,
      canGoNext: computedState.canGoNext,
      isSubmitting: computedState.finalIsSubmitting,
      onSubmit: handleSubmit,
      className,
      currentStep,
      stepData: formState.values || {},
      allData: context.allData,
      context,
    }),
    [
      context.isLastStep,
      computedState.canGoNext,
      computedState.finalIsSubmitting,
      handleSubmit,
      className,
      currentStep,
      formState.values,
      context.allData,
      context,
    ]
  );

  return (
    <ComponentRendererWrapper
      name="WorkflowNextButton"
      renderer={workflowConfig.renderConfig?.nextButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
});

export default WorkflowNextButton;
