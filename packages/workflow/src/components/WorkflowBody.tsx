import { FormBody } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowBodyProps {
  stepId?: string;
  children?: React.ReactNode;
}

/**
 * Renders the main content of the current workflow step.
 * Simple component that renders either the children or FormBody by default.
 */
export function WorkflowBody({ stepId, children }: WorkflowBodyProps) {
  const { currentStep } = useWorkflowContext();

  if (!currentStep) {
    return null;
  }

  if (stepId && currentStep.id !== stepId) {
    return null;
  }

  const { formConfig, renderer } = currentStep;

  // If a step has no form, just render children or nothing
  if (!formConfig) {
    return null;
  }

  if (renderer) {
    return renderer(currentStep);
  }

  return children ?? <FormBody />;
}

export default WorkflowBody;
