import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowPreviousButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowPreviousButton({ className, children }: WorkflowPreviousButtonProps) {
  const { workflowConfig, context, goPrevious, workflowState } = useWorkflowContext();

  const canGoPrevious =
    context.currentStepIndex > 0 &&
    workflowConfig.navigation?.allowBackNavigation !== false &&
    !workflowState.isTransitioning &&
    !workflowState.isSubmitting;

  const handlePrevious = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canGoPrevious) return;
    await goPrevious();
  };

  if (!canGoPrevious) {
    return null;
  }

  return (
    <button type="button" onClick={handlePrevious} disabled={!canGoPrevious} className={className}>
      {children || 'Previous'}
    </button>
  );
}

export default WorkflowPreviousButton;
