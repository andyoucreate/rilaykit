import type { RendererChildrenFunction, WorkflowPreviousButtonRendererProps } from '@rilaykit/core';
import { resolveRendererChildren } from '@rilaykit/core';
import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowPreviousButtonProps {
  className?: string;
  children?: React.ReactNode | RendererChildrenFunction<WorkflowPreviousButtonRendererProps>;
  renderAs?: 'default' | 'children' | boolean;
}

export function WorkflowPreviousButton({
  className,
  children,
  renderAs,
}: WorkflowPreviousButtonProps) {
  const { context, goPrevious, workflowState, workflowConfig, currentStep } = useWorkflowContext();
  const { formState } = useFormContext();

  const canGoPrevious =
    context.currentStepIndex > 0 &&
    workflowConfig.navigation?.allowBackNavigation !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  // Throw error if previous button is rendered but navigation is disabled
  if (workflowConfig.navigation?.allowBackNavigation === false) {
    throw new Error(
      `WorkflowPreviousButton is rendered but allowBackNavigation is disabled in workflow "${workflowConfig.id}". Either enable back navigation or remove the WorkflowPreviousButton component.`
    );
  }

  const handlePrevious = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoPrevious) return;
    await goPrevious();
  };

  const baseProps = {
    canGoPrevious,
    onPrevious: handlePrevious,
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
  const renderer = workflowConfig.renderConfig?.previousButtonRenderer;

  if (!renderer) {
    throw new Error(
      `No previousButtonRenderer configured for workflow "${workflowConfig.id}". Please configure a previousButtonRenderer using config.setWorkflowPreviousButtonRenderer() or config.setWorkflowRenderConfig().`
    );
  }

  // Resolve function children to React.ReactNode before passing to renderer
  const resolvedChildren = resolveRendererChildren(children, baseProps);

  const props: WorkflowPreviousButtonRendererProps = {
    ...baseProps,
    children: resolvedChildren, // Always React.ReactNode
  };

  return renderer(props);
}

export default WorkflowPreviousButton;
