import { cn } from '@/lib/utils';
import { Flow, useVisitedSteps } from 'rilaykit/react';

export function Stepper({ className }: { className?: string }) {
  const visitedSteps = useVisitedSteps();

  return (
    <Flow.Progress>
      {({ steps, currentIndex, goTo }) => (
        <div className={cn('flex items-center gap-2', className)}>
          {steps.map((step, index) => {
            const isActive = index === currentIndex;
            const isVisited = visitedSteps.has(step.id);
            const isCompleted = isVisited && !isActive;

            return (
              <div key={step.id} className="flex items-center gap-2">
                {index > 0 && (
                  <div className={cn('h-px w-8', isVisited ? 'bg-primary' : 'bg-border')} />
                )}
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'bg-primary/10 text-primary',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                  )}
                >
                  <span className="flex size-6 items-center justify-center rounded-full border text-xs">
                    {isCompleted ? '✓' : index + 1}
                  </span>
                  {step.title}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Flow.Progress>
  );
}
