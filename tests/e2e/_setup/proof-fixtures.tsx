import type { ComponentRenderContext } from '@rilaykit/core';
import { ril } from '@rilaykit/core';

/**
 * Terse text renderer for proof suites: raw data-testid={id} (not MockTextInput's
 * input-${id} scheme) plus inline error alerts, so hardening proofs assert exact
 * user-visible behavior.
 */
export const ProofTextInput = ({ id, field }: ComponentRenderContext) => (
  <div>
    <input
      data-testid={id}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
    />
    {field?.error?.map((err) => (
      <p key={err.message} role="alert">
        {err.message}
      </p>
    ))}
  </div>
);

/** Minimal single-component catalog for the proof suites. */
export function createProofRil() {
  return ril.create().component('text', { renderer: ProofTextInput });
}
