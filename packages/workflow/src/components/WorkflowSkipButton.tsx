import { useWorkflowContext } from './WorkflowProvider';

export interface WorkflowSkipButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function WorkflowSkipButton({ className, children }: WorkflowSkipButtonProps) {
  const { workflowConfig, currentStep, skipStep, workflowState } = useWorkflowContext();

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

  if (!canSkip) {
    return null;
  }

  return (
    <button type="button" onClick={handleSkip} disabled={!canSkip} className={className}>
      {children || 'Skip Step'}
    </button>
  );
}

export default WorkflowSkipButton;
