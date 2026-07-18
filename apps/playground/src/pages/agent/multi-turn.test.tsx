import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentMultiTurnPage } from './multi-turn';

/**
 * Proof the multi-turn demo advances across tool turns: turn 1 is a show_form
 * (contact); submitting it must append the agent's NEXT turn — a show_flow
 * (booking) — to the same transcript. Asserting the booking flow's first step
 * appears only AFTER the contact form submits proves the transcript reducer wires
 * a real HITL resolve into the next tool call, no LLM and no browser.
 */
describe('AgentMultiTurnPage — resolving one tool turn appends the next', () => {
  it('advances from the contact show_form to the booking show_flow on submit', async () => {
    const { container } = render(<AgentMultiTurnPage />);

    // Turn 1: the contact form is mounted; the booking flow is not yet emitted.
    expect(screen.getByText('Your name')).toBeInTheDocument();
    expect(screen.queryByText('Preferred slot')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ada Lovelace'), { target: { value: 'Trinity' } });
    fireEvent.change(screen.getByPlaceholderText('ada@example.com'), {
      target: { value: 'trinity@matrix.io' },
    });
    const submit = container.querySelector('[data-form-submit]');
    expect(submit).not.toBeNull();
    fireEvent.click(submit as Element);

    // Turn 2: the resolve appended the booking show_flow, whose first step mounted.
    await waitFor(() => expect(screen.getByText(/thanks Trinity/i)).toBeInTheDocument());
    expect(screen.getByText('Preferred slot')).toBeInTheDocument();
  });
});
