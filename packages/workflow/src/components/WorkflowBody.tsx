import { FormBody } from '@rilay/form-builder';
import type React from 'react';
import { useWorkflowContext } from './WorkflowProvider';

/**
 * Renders the main content of the current workflow step.
 * Simple component that renders either the children or FormBody by default.
 */
export function WorkflowBody({
  children,
  stepId,
}: { children?: React.ReactNode; stepId?: string }) {
  const { currentStep } = useWorkflowContext();

  if (!currentStep) {
    return null;
  }

  if (stepId && currentStep.id !== stepId) {
    return null;
  }

  const { formConfig } = currentStep;

  // If a step has no form, just render children or nothing
  if (!formConfig) {
    return children || null;
  }

  // Default rendering for a step with a form
  return children || <FormBody />;
}

export default WorkflowBody;
