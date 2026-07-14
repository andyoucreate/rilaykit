import { Button } from '@/components/ui/button';
import { Flow } from 'rilaykit';

export function SkipButton({ className }: { className?: string }) {
  return (
    <Flow.Skip>
      {({ go, canGo }) => (
        <Button type="button" variant="ghost" onClick={go} disabled={!canGo} className={className}>
          Skip
        </Button>
      )}
    </Flow.Skip>
  );
}
