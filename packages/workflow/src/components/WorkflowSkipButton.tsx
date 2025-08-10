import type { ComponentRendererBaseProps, WorkflowSkipButtonRendererProps } from '@rilaykit/core';
import { ComponentRendererWrapper } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import React, { useCallback, useMemo } from 'react';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowSkipButtonProps
  extends ComponentRendererBaseProps<WorkflowSkipButtonRendererProps> {
  /**
   * Override the isSubmitting state from workflow/form context
   * If provided, this value will be used instead of the computed isSubmitting state
   */
  isSubmitting?: boolean;
}

export const WorkflowSkipButton = React.memo(function WorkflowSkipButton({
  className,
  isSubmitting: overrideIsSubmitting,
  ...props
}: WorkflowSkipButtonProps) {
  const { currentStep, skipStep, workflowState, workflowConfig, context, conditionsHelpers } =
    useWorkflowContext();
  const { formState } = useFormContext();

  // Memoize computed state to avoid recalculation
  const computedState = useMemo(() => {
    const computedIsSubmitting = formState.isSubmitting || workflowState.isSubmitting;
    const finalIsSubmitting = overrideIsSubmitting ?? computedIsSubmitting;
    const canSkip =
      (Boolean(currentStep?.allowSkip) ||
        conditionsHelpers.isStepSkippable(workflowState.currentStepIndex)) &&
      !workflowState.isTransitioning &&
      !finalIsSubmitting;

    return {
      finalIsSubmitting,
      canSkip,
    };
  }, [
    formState.isSubmitting,
    workflowState.isSubmitting,
    workflowState.isTransitioning,
    workflowState.currentStepIndex,
    currentStep?.allowSkip,
    conditionsHelpers.isStepSkippable,
    overrideIsSubmitting,
  ]);

  // Memoize skip handler to avoid recreation
  const handleSkip = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!computedState.canSkip) return;
      await skipStep();
    },
    [computedState.canSkip, skipStep]
  );

  // Memoize base props to avoid recreating object
  const baseProps: WorkflowSkipButtonRendererProps = useMemo(
    () => ({
      canSkip: computedState.canSkip,
      isSubmitting: computedState.finalIsSubmitting,
      onSkip: handleSkip,
      className,
      // Step data
      currentStep,
      stepData: formState.values || {},
      allData: context.allData,
      context,
    }),
    [
      computedState.canSkip,
      computedState.finalIsSubmitting,
      handleSkip,
      className,
      currentStep,
      formState.values,
      context.allData,
      context,
    ]
  );

  return (
    <ComponentRendererWrapper
      name="WorkflowSkipButton"
      renderer={workflowConfig.renderConfig?.skipButtonRenderer}
      props={baseProps}
      {...props}
    />
  );
});

export default WorkflowSkipButton;
