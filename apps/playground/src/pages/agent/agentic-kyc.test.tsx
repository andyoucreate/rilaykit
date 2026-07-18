import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentKycPage } from './agentic-kyc';

/**
 * Proof the agentic-KYC demo actually works: the assistant's show_flow emission is
 * an untrusted JSON FlowSchema that compileFlow must turn into a live workflow. If
 * the schema were malformed, ShowFlow would render an EmissionErrorView instead of
 * the flow. This asserts the opening prose plus the FIRST step's field render — so
 * compileFlow succeeded and the flow mounted, no LLM and no browser.
 */
describe('AgentKycPage — the show_flow schema compiles and the flow mounts', () => {
  it('renders the assistant prose and the first KYC step', () => {
    render(<AgentKycPage />);

    expect(screen.getByText(/complete your KYC/i)).toBeInTheDocument();
    // The flow compiled and its first step (Identity) mounted its fields.
    expect(screen.getByText('Legal name')).toBeInTheDocument();
    expect(screen.getByText('Country of residence')).toBeInTheDocument();
    // No emission error surfaced (a malformed schema would show one instead).
    expect(screen.queryByText(/could not|invalid|error/i)).not.toBeInTheDocument();
  });
});
