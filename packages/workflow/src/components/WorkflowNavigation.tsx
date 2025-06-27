import type { WorkflowNavigationRendererProps } from '@rilay/core';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNavigationProps {
  className?: string;
}

export function WorkflowNavigation({ className }: WorkflowNavigationProps) {
  const {
    workflowConfig,
    currentStep,
    context,
    goNext,
    goPrevious,
    skipStep,
    submitWorkflow,
    workflowState,
  } = useWorkflowContext();

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

  const handleNext = async () => {
    if (!canGoNext) return;
    await goNext();
  };

  const handlePrevious = async () => {
    if (!canGoPrevious) return;
    await goPrevious();
  };

  const handleSkip = async () => {
    if (!canSkip) return;
    await skipStep();
  };

  const handleSubmit = async () => {
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
    onSkip: handleSkip,
    onSubmit: handleSubmit,
    className,
  };

  return navigationRenderer(navigationProps);
}

export default WorkflowNavigation;
