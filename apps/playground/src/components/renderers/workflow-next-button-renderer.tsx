import type { WorkflowNextButtonRendererProps } from 'rilaykit';
import { Button } from '@/components/ui/button';

export function WorkflowNextButtonRenderer({
  isLastStep,
  canGoNext,
  isSubmitting,
  onSubmit,
  className,
}: WorkflowNextButtonRendererProps) {
  return (
    <Button
      type="button"
      onClick={onSubmit}
      disabled={!canGoNext}
      className={className}
    >
      {isSubmitting ? 'Processing...' : isLastStep ? 'Complete' : 'Next'}
    </Button>
  );
}
