import { FlowBack, FlowNext } from '../../src';

/**
 * Shared flow nav buttons for workflow package tests, mirroring
 * tests/e2e/_setup/nav-buttons.tsx. The `testId` prop keeps the
 * historical per-suite test ids configurable.
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
