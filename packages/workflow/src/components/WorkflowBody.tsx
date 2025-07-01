import { FormBody } from '@rilay/form-builder';
import { useWorkflowContext } from './WorkflowProvider';

/**
 * Renders the main content of the current workflow step.
 * Simple component that renders either the children or FormBody by default.
 */
export function WorkflowBody() {
  const { currentStep } = useWorkflowContext();

  if (!currentStep) {
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

  // Default rendering for a step with a form
  return <FormBody />;
}

export default WorkflowBody;
