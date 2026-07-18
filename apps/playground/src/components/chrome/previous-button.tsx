import { Button } from '@/components/ui/button';
import { Flow } from 'rilaykit/react';

export function PreviousButton({ className }: { className?: string }) {
  return (
    <Flow.Back>
      {({ go, canGo }) => (
        <Button
          type="button"
          variant="outline"
          onClick={go}
          disabled={!canGo}
          className={className}
        >
          Previous
        </Button>
      )}
    </Flow.Back>
  );
}
