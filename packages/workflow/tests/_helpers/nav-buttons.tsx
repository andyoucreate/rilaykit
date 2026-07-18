import { FlowBack, FlowNext, FlowSkip } from '../../src/react';

/**
 * Shared flow nav buttons for workflow tests. The `testId` prop keeps the
 * historical per-suite test ids configurable; tests/e2e/_setup/nav-buttons.tsx
 * re-exports these bound to the e2e ids.
 */

export function NextButton({ testId = 'next' }: { testId?: string }) {
  return (
    <FlowNext>
      {({ go, submitting }) => (
        <button type="button" data-testid={testId} onClick={go} disabled={submitting}>
          {submitting ? 'Loading...' : 'Next'}
        </button>
      )}
    </FlowNext>
  );
}

export function PrevButton({ testId = 'prev' }: { testId?: string }) {
  return (
    <FlowBack>
      {({ go, canGo }) => (
        <button type="button" data-testid={testId} onClick={go} disabled={!canGo}>
          Previous
        </button>
      )}
    </FlowBack>
  );
}

export function SkipButton({ testId = 'skip' }: { testId?: string }) {
  return (
    <FlowSkip>
      {({ go, canGo }) => (
        <button type="button" data-testid={testId} onClick={go} disabled={!canGo}>
          Skip
        </button>
      )}
    </FlowSkip>
  );
}
