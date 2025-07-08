import type { RendererChildrenFunction, WorkflowNextButtonRendererProps } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNextButtonProps {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<WorkflowNextButtonRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function WorkflowNextButton({ className, children, renderAs }: WorkflowNextButtonProps) {
  const { context, submitWorkflow, workflowState, workflowConfig, currentStep } =
    useWorkflowContext();
  const { submit, formState } = useFormContext();

  const canGoNext = !workflowState.isTransitioning && !workflowState.isSubmitting;

  const handleNext = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoNext) return;
    await submit(event);
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoNext) return;
    await submitWorkflow();
  };

  const baseProps = {
    isLastStep: context.isLastStep,
    canGoNext,
    isSubmitting: workflowState.isSubmitting,
    onNext: handleNext,
    onSubmit: handleSubmit,
    className,
    // Step data
    currentStep,
    stepData: formState.values || {},
    allData: context.allData,
    context,
  };

  // If renderAs is 'children' or true, use children as renderer
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        'When renderAs="children" is used, children must be a function that returns React elements'
      );
    }
    return children(baseProps);
  }

  // Default behavior: use configured renderer
  const renderer = workflowConfig.renderConfig?.nextButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No nextButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a nextButtonRenderer using config.setWorkflowNextButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const props: WorkflowNextButtonRendererProps = {
    ...baseProps,
    children: resolvedChildren, // Always React.ReactNode
  };

  return renderer(props);
}

export default WorkflowNextButton;
