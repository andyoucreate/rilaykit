import React from 'react';
import type { FlowStepsContext } from '../hooks/useFlowSteps';
import { useFlowSteps } from '../hooks/useFlowSteps';

export interface FlowProgressProps {
  children?: (ctx: FlowStepsContext) => React.ReactNode;
  className?: string;
}

/**
 * Headless progress indicator for the current flow.
 * Bare default renders an ordered list of visible step titles;
 * the render-prop form exposes `{ steps, currentIndex, goTo }`.
 */
export const FlowProgress = React.memo(function FlowProgress({
  children,
  className,
}: FlowProgressProps) {
  const ctx = useFlowSteps();

  if (children) {
    return <>{children(ctx)}</>;
  }

  return (
    <ol className={className} data-flow-progress>
      {ctx.steps.map((step, index) => (
        <li key={step.id} data-active={index === ctx.currentIndex ? 'true' : 'false'}>
          {step.title}
        </li>
      ))}
    </ol>
  );
});

export default FlowProgress;
