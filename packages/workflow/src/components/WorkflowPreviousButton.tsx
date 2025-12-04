import type {
  ComponentRendererBaseProps,
  WorkflowPreviousButtonRendererProps,
} from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import React, { useCallback, useMemo } from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowPreviousButtonProps
  extends ComponentRendererBaseProps<WorkflowPreviousButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export const WorkflowPreviousButton = React.memo(function WorkflowPreviousButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowPreviousButtonProps) {
  const {
    context,
    goPrevious,
    workflowState,
    workflowConfig,
    currentStep,
    canGoPrevious: canGoPreviousFromContext,
  } = useWorkflowContext();
  const { formState } = useFormContext();

  // Memoize computed state to avoid recalculation
  const computedState = useMemo(() => {
    const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
    const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;
    // Use canGoPrevious from context which properly checks for visible previous steps
    // This handles cases where previous steps have conditions that make them invisible
    const canGoPrevious =
      canGoPreviousFromContext() && !workflowState.isTransitioning && !finalIsSubmitting;

    return {
      finalIsSubmitting,
      canGoPrevious,
    };
  }, [
    formState.isSubmitting,
    workflowState.isSubmitting,
    workflowState.isTransitioning,
    canGoPreviousFromContext,
    overrideIsSubmitting,
  ]);

  // Memoize previous handler to avoid recreation
  const handlePrevious = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!computedState.canGoPrevious) return;
      await goPrevious();
    },
    [computedState.canGoPrevious, goPrevious]
  );

  // Memoize base props to avoid recreating object
  const baseProps: WorkflowPreviousButtonRendererProps = useMemo(
    () => ({
      canGoPrevious: computedState.canGoPrevious,
      isSubmitting: computedState.finalIsSubmitting,
      onPrevious: handlePrevious,
      className,
      // Step data
      currentStep,
      stepData: formState.values || {},
      allData: context.allData,
      context,
    }),
    [
      computedState.canGoPrevious,
      computedState.finalIsSubmitting,
      handlePrevious,
      className,
      currentStep,
      formState.values,
      context.allData,
      context,
    ]
  );

  return (
    <ComponentRendererWrapper
      name="WorkflowPreviousButton"
      renderer={workflowConfig.renderConfig?.previousButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
});

export default WorkflowPreviousButton;
