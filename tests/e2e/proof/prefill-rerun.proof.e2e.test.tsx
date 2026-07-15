/**
 * PROOF — `step.next.prefill` is a DERIVATION, and it re-runs.
 *
 * A step's `after` binding runs on EVERY forward transition, so a Back→Next
 * round trip re-derives the field it prefilled and overwrites whatever the user
 * typed there. Nothing pinned which of the two readings was intended, and the
 * name `prefill` invites the other one (seed-if-empty).
 *
 * The contract is OVERWRITE-ALWAYS, and it is deliberate:
 *
 *  - `prefill` sits on `setNextStepFields`, a plain setter. A host calling
 *    `helper.setNextStepFields({x: 1})` must get `x === 1`; making the write
 *    conditional on the field being empty turns a setter into a silent no-op —
 *    a worse failure than the one it would fix, and one with no diagnostic.
 *  - Seed-if-absent has its own data-loss mode, and a quieter one: a user who
 *    goes back and CORRECTS the input a field is derived from would keep the
 *    stale derived value and submit it. The README's own example
 *    (`billingEmail: step.data.email`) is exactly that shape.
 *
 * The cost is real and is the point of this proof: an edit to a derived field
 * does not survive a Back→Next. A host that wants seed-if-empty writes the
 * guard, because only the host knows which of its fields are derived and which
 * are the user's. Both directions are pinned below so the trade is a decision
 * rather than an accident.
 */
import { Flow, compileFlow } from '@rilaykit/workflow';
import type { FlowSchema, StepContext } from '@rilaykit/workflow';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createProofRil } from '../_setup/proof-fixtures';

const SCHEMA_JSON = `{
  "version": 1,
  "id": "derive",
  "name": "Derive",
  "steps": [
    {
      "id": "account",
      "title": "Account",
      "onAfterValidation": "prefillReview",
      "form": {
        "version": 1,
        "id": "account",
        "fields": [{ "id": "username", "type": "text" }]
      }
    },
    {
      "id": "review",
      "title": "Review",
      "form": {
        "version": 1,
        "id": "review",
        "fields": [{ "id": "summary", "type": "text" }]
      }
    }
  ]
}`;

function renderFlow(after: (step: StepContext) => void) {
  const schema: FlowSchema = JSON.parse(SCHEMA_JSON);
  const { workflowConfig, defaultValues } = compileFlow(schema, createProofRil(), {
    bindings: { after: { prefillReview: after } },
  });

  return render(
    <Flow of={workflowConfig} defaults={defaultValues}>
      <Flow.Body />
      <Flow.Back>Back</Flow.Back>
      <Flow.Next>Next</Flow.Next>
    </Flow>
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));

describe('PROOF: step.next.prefill re-runs on every forward transition', () => {
  it('re-derives over the user own edit — the documented cost of derivation', async () => {
    const prefillReview = vi.fn((step: StepContext) => {
      step.next.prefill({ summary: String(step.data.username) });
    });
    renderFlow(prefillReview);

    fireEvent.change(screen.getByTestId('username'), { target: { value: 'ada' } });
    next();

    await waitFor(() => expect(screen.getByTestId('summary')).toHaveValue('ada'));
    expect(prefillReview).toHaveBeenCalledTimes(1);

    // The user replaces the derived value by hand...
    fireEvent.change(screen.getByTestId('summary'), { target: { value: 'hand-written' } });

    // ...goes back, changes NOTHING, and comes forward again.
    back();
    await waitFor(() => expect(screen.getByTestId('username')).toBeInTheDocument());
    next();
    await waitFor(() => expect(screen.getByTestId('summary')).toBeInTheDocument());

    // The binding re-ran and re-derived: the hand-written value is gone. This
    // is the contract, not an accident — see this file's header.
    expect(prefillReview).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('summary')).toHaveValue('ada');
  });

  it('propagates a CORRECTED input forward — why the re-run is not simply removable', async () => {
    renderFlow((step: StepContext) => {
      step.next.prefill({ summary: String(step.data.username) });
    });

    fireEvent.change(screen.getByTestId('username'), { target: { value: 'ada' } });
    next();
    await waitFor(() => expect(screen.getByTestId('summary')).toHaveValue('ada'));

    // The user goes back and fixes a typo in the field `summary` derives FROM.
    back();
    await waitFor(() => expect(screen.getByTestId('username')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'grace' } });
    next();

    // The derived field follows. A seed-if-absent prefill would submit 'ada'.
    await waitFor(() => expect(screen.getByTestId('summary')).toHaveValue('grace'));
  });

  it('lets a host opt into seed-if-empty with a guard it owns', async () => {
    const prefillReview = vi.fn((step: StepContext) => {
      // Only the host knows which of its fields are derived and which are the
      // user's — so the guard lives here.
      const existing = step.workflow.get('review') as Record<string, unknown> | undefined;
      if (existing?.summary) return;
      step.next.prefill({ summary: String(step.data.username) });
    });
    renderFlow(prefillReview);

    fireEvent.change(screen.getByTestId('username'), { target: { value: 'ada' } });
    next();
    await waitFor(() => expect(screen.getByTestId('summary')).toHaveValue('ada'));

    fireEvent.change(screen.getByTestId('summary'), { target: { value: 'hand-written' } });
    back();
    await waitFor(() => expect(screen.getByTestId('username')).toBeInTheDocument());
    next();
    await waitFor(() => expect(screen.getByTestId('summary')).toBeInTheDocument());

    // The binding ran again and declined to overwrite.
    expect(prefillReview).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('summary')).toHaveValue('hand-written');
  });
});
