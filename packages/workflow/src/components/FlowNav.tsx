import type { StepConfig } from '@rilaykit/core';
import { useForm, useFormSubmitting } from '@rilaykit/forms';
import React, { useCallback, useMemo } from 'react';
import { resolveAllowSkip } from '../utils/resolveAllowSkip';
import { useWorkflowContext } from './WorkflowProvider';

export interface FlowNavContext {
  go: () => void;
  canGo: boolean;
  submitting: boolean;
  isLastStep: boolean;
  step: StepConfig;
}

export interface FlowNavProps {
  children?: React.ReactNode | ((ctx: FlowNavContext) => React.ReactNode);
  className?: string;
}

type Direction = 'next' | 'back' | 'skip';

function useFlowNav(direction: Direction): FlowNavContext & { hidden: boolean } {
  const { context, workflowState, currentStep, goPrevious, skipStep } = useWorkflowContext();
  const { submit } = useForm();
  const formSubmitting = useFormSubmitting();

  const submitting = formSubmitting || workflowState.isSubmitting;
  const busy = workflowState.isTransitioning || submitting;
  const allowSkip = resolveAllowSkip(currentStep, context.allData);

  const canGo = useMemo(() => {
    if (direction === 'back') return !context.isFirstStep && !busy;
    if (direction === 'skip') return allowSkip && !busy;
    return !busy;
  }, [direction, context.isFirstStep, allowSkip, busy]);

  const go = useCallback(() => {
    if (!canGo) return;
    if (direction === 'next') void submit();
    else if (direction === 'back') void goPrevious();
    else void skipStep();
  }, [canGo, direction, submit, goPrevious, skipStep]);

  return {
    go,
    canGo,
    submitting,
    isLastStep: context.isLastStep,
    step: currentStep,
    hidden: direction === 'skip' && !allowSkip,
  };
}

function createNavButton(direction: Direction, label: string) {
  return React.memo(function FlowNavButton({ children, className }: FlowNavProps) {
    const { hidden, ...ctx } = useFlowNav(direction);

    if (hidden) {
      return null;
    }
    if (typeof children === 'function') {
      return <>{children(ctx)}</>;
    }
    return (
      <button
        type="button"
        className={className}
        disabled={!ctx.canGo}
        onClick={ctx.go}
        data-flow-nav={direction}
      >
        {children ?? label}
      </button>
    );
  });
}

export const FlowNext = createNavButton('next', 'Next');
export const FlowBack = createNavButton('back', 'Back');
export const FlowSkip = createNavButton('skip', 'Skip');
