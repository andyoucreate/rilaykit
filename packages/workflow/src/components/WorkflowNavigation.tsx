import type { WorkflowNavigationRendererProps } from '@rilay/core';
import { useFormContext } from '@rilay/form-builder';
import { useWorkflowContext } from './WorkflowProvider';

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

  if (!navigationRenderer) {
    throw new Error(
      `No navigationRenderer configured for workflow "${workflowConfig.id}". Please configure a navigationRenderer using config.setWorkflowNavigationRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  const canGoNext = !workflowState.isTransitioning && !workflowState.isSubmitting;
  const canGoPrevious =
    context.currentStepIndex > 0 &&
    workflowConfig.navigation?.allowBackNavigation !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;
  const canSkip =
    Boolean(currentStep.allowSkip) &&
    workflowConfig.navigation?.allowStepSkipping !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handleNext = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!canGoNext) return;

    // Validate form before going to next step
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

    // Validate form before final submission
    const isFormValid = await submit(event);

    if (isFormValid) {
      await submitWorkflow();
    }
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
    onSkip: handleSkip,
    onSubmit: handleSubmit,
    className,
  };

  return navigationRenderer(navigationProps);
}

export default WorkflowNavigation;
