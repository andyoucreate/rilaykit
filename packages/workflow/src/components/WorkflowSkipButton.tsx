import type { RendererChildrenFunction, WorkflowSkipButtonRendererProps } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowSkipButtonProps {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<WorkflowSkipButtonRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function WorkflowSkipButton({ className, children, renderAs }: WorkflowSkipButtonProps) {
  const { currentStep, skipStep, workflowState, workflowConfig, context } = useWorkflowContext();
  const { formState } = useFormContext();

  const canSkip =
    Boolean(currentStep?.allowSkip) &&
    workflowConfig.navigation?.allowStepSkipping !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handleSkip = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSkip) return;
    await skipStep();
  };

  const baseProps = {
    canSkip,
    onSkip: handleSkip,
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
  const renderer = workflowConfig.renderConfig?.skipButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No skipButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a skipButtonRenderer using config.setWorkflowSkipButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const props: WorkflowSkipButtonRendererProps = {
    ...baseProps,
    children: resolvedChildren, // Always React.ReactNode
  };

  return renderer(props);
}

export default WorkflowSkipButton;
