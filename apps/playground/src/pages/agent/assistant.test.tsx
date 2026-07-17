import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentAssistantPage } from './assistant';

/**
 * End-to-end proof of the flagship agent demo: the hand-authored transcript renders
 * through <Parts>/<Catalog>, the show_form tool part mounts a REAL form, and
 * submitting it drives the actual HITL resolve loop, which advances the transcript
 * so the assistant's scripted follow-up appears — greeting the submitted name. This
 * exercises the whole composition (library render + resolve + the transcript reducer)
 * that a browser click would, without a browser.
 */
describe('AgentAssistantPage — real HITL loop', () => {
  it('renders the show_form and appends the assistant follow-up on submit', async () => {
    const { container } = render(<AgentAssistantPage />);

    // The opening assistant prose renders through the text-part renderer.
    expect(screen.getByText(/get your account set up/i)).toBeInTheDocument();

    // The show_form tool part mounted a real form with the two fields.
    fireEvent.change(screen.getByPlaceholderText('Ada Lovelace'), { target: { value: 'Neo' } });
    fireEvent.change(screen.getByPlaceholderText('ada@example.com'), {
      target: { value: 'neo@matrix.io' },
    });

    // Before submit, the follow-up must not exist yet.
    expect(screen.queryByText(/your account is ready/i)).not.toBeInTheDocument();

    const submit = container.querySelector('[data-form-submit]');
    expect(submit).not.toBeNull();
    fireEvent.click(submit as Element);

    // The resolve loop advanced the transcript: the scripted follow-up appears,
    // greeting the submitted name.
    await waitFor(() =>
      expect(screen.getByText(/your account is ready/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Thanks, Neo/)).toBeInTheDocument();
  });
});
