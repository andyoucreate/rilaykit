import { useFormContext } from '@rilaykit/forms';
import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowNextButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowNextButton({ className, children }: WorkflowNextButtonProps) {
  const { context, submitWorkflow, workflowState } = useWorkflowContext();
  const { submit } = useFormContext();

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

  const handleClick = context.isLastStep ? handleSubmit : handleNext;

  return (
    <button type="submit" onClick={handleClick} disabled={!canGoNext} className={className}>
      {children || (context.isLastStep ? 'Complete Workflow' : 'Next')}
    </button>
  );
}

export default WorkflowNextButton;
