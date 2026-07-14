import { FlowBack, FlowNext, FlowSkip } from '@rilaykit/workflow';

// =================================================================
// SHARED FLOW NAV BUTTONS FOR E2E TESTS
// Thin wrappers over Flow.Next/Back/Skip exposing the historical
// test ids (next-btn / prev-btn / skip-btn).
// =================================================================

export function NextButton() {
  return (
    <FlowNext>
      {({ go, submitting }) => (
        <button type="button" data-testid="next-btn" onClick={go} disabled={submitting}>
          {submitting ? 'Loading...' : 'Next'}
        </button>
      )}
    </FlowNext>
  );
}

export function PrevButton() {
  return (
    <FlowBack>
      {({ go, canGo }) => (
        <button type="button" data-testid="prev-btn" onClick={go} disabled={!canGo}>
          Previous
        </button>
      )}
    </FlowBack>
  );
}

export function SkipButton() {
  return (
    <FlowSkip>
      {({ go, canGo }) => (
        <button type="button" data-testid="skip-btn" onClick={go} disabled={!canGo}>
          Skip
        </button>
      )}
    </FlowSkip>
  );
}
