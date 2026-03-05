import type { WorkflowSkipButtonRendererProps } from 'rilaykit';
import { Button } from '@/components/ui/button';

export function WorkflowSkipButtonRenderer({
  canSkip,
  isSubmitting,
  onSkip,
  className,
}: WorkflowSkipButtonRendererProps) {
  if (!canSkip) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSkip}
      disabled={isSubmitting}
      className={className}
    >
      Skip
    </Button>
  );
}
