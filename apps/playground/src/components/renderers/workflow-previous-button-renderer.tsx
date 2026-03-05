import { Button } from '@/components/ui/button';
import type { WorkflowPreviousButtonRendererProps } from 'rilaykit';

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
