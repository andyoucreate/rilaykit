import type { WorkflowNavigationRendererProps } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { WorkflowNextButton } from './WorkflowNextButton';
import { WorkflowPreviousButton } from './WorkflowPreviousButton';
import { useWorkflowContext } from './WorkflowProvider';
import { WorkflowSkipButton } from './WorkflowSkipButton';

export interface WorkflowNavigationProps {
  className?: string;
}

export function WorkflowNavigation({ className }: WorkflowNavigationProps) {
  const {
    workflowConfig,
    currentStep,
    context,
    goPrevious,
    skipStep,
    submitWorkflow,
    workflowState,
  } = useWorkflowContext();
  const { submit } = useFormContext();

  const navigationRenderer = workflowConfig.renderConfig?.navigationRenderer;

  // If a custom renderer is provided, use it with the legacy API
  if (navigationRenderer) {
    const canGoNext = !workflowState.isTransitioning && !workflowState.isSubmitting;
    const canGoPrevious =
      context.currentStepIndex > 0 &&
      workflowConfig.navigation?.allowBackNavigation !== false &&
      !workflowState.isTransitioning &&
      !workflowState.isSubmitting;
    const canSkip =
      Boolean(currentStep?.allowSkip) &&
      workflowConfig.navigation?.allowStepSkipping !== false &&
      !workflowState.isTransitioning &&
      !workflowState.isSubmitting;

    const handleNext = async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canGoNext) return;
      await submit(event);
    };

    const handlePrevious = async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canGoPrevious) return;
      await goPrevious();
    };

    const handleSkip = async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSkip) return;
      await skipStep();
    };

    const handleSubmit = async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canGoNext) return;
      await submitWorkflow();
    };

    const navigationProps: WorkflowNavigationRendererProps = {
      currentStep,
      context,
      canGoNext,
      canGoPrevious,
      canSkip,
      isSubmitting: workflowState.isSubmitting,
      onNext: handleNext,
      onPrevious: handlePrevious,
      onSkip: canSkip ? handleSkip : (e) => e?.preventDefault(),
      onSubmit: handleSubmit,
      className,
    };

    return navigationRenderer(navigationProps);
  }

  // Default implementation using the new decomposed components
  return (
    <div className={`flex justify-between items-center ${className || ''}`}>
      <WorkflowPreviousButton />
      <div className="flex gap-2">
        <WorkflowSkipButton />
        <WorkflowNextButton />
      </div>
    </div>
  );
}

export default WorkflowNavigation;
