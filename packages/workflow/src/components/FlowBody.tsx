import type { StepConfig } from '@rilaykit/core';
import { FormBody } from '@rilaykit/forms/react';
import React from 'react';
import { useFlow } from './WorkflowProvider';

export interface FlowBodyProps {
  stepId?: string;
  children?: React.ReactNode | ((ctx: { step: StepConfig }) => React.ReactNode);
}

/**
 * Renders the main content of the current flow step.
 * Precedence: custom `step.renderer(step)` -> render-prop/children -> `<FormBody />` default.
 */
export const FlowBody = React.memo(function FlowBody({ stepId, children }: FlowBodyProps) {
  const { currentStep } = useFlow();

  if (!currentStep) {
    return null;
  }

  if (stepId && currentStep.id !== stepId) {
    return null;
  }

  if (currentStep.renderer) {
    return currentStep.renderer(currentStep);
  }

  if (typeof children === 'function') {
    return <>{children({ step: currentStep })}</>;
  }

  if (children) {
    return <>{children}</>;
  }

  return <FormBody />;
});

export default FlowBody;
