import { Button } from '@/components/ui/button';
import type { WorkflowNextButtonRendererProps } from 'rilaykit';

export function WorkflowNextButtonRenderer({
  isLastStep,
  canGoNext,
  isSubmitting,
  onSubmit,
  className,
}: WorkflowNextButtonRendererProps) {
  return (
    <Button type="button" onClick={onSubmit} disabled={!canGoNext} className={className}>
      {isSubmitting ? 'Processing...' : isLastStep ? 'Complete' : 'Next'}
    </Button>
  );
}
