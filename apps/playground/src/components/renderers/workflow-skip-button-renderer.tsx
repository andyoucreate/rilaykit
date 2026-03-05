import { Button } from '@/components/ui/button';
import type { WorkflowSkipButtonRendererProps } from 'rilaykit';

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
