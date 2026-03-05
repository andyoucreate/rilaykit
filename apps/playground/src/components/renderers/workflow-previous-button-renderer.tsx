import type { WorkflowPreviousButtonRendererProps } from 'rilaykit';
import { Button } from '@/components/ui/button';

export function WorkflowPreviousButtonRenderer({
  canGoPrevious,
  isSubmitting,
  onPrevious,
  className,
}: WorkflowPreviousButtonRendererProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onPrevious}
      disabled={!canGoPrevious || isSubmitting}
      className={className}
    >
      Previous
    </Button>
  );
}
