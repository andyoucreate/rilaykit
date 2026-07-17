import { Button } from '@/components/ui/button';
import { Flow } from 'rilaykit/react';

export function NextButton({ className }: { className?: string }) {
  return (
    <Flow.Next>
      {({ go, canGo, submitting, isLastStep }) => (
        <Button type="button" onClick={go} disabled={!canGo} className={className}>
          {submitting ? 'Processing...' : isLastStep ? 'Complete' : 'Next'}
        </Button>
      )}
    </Flow.Next>
  );
}
