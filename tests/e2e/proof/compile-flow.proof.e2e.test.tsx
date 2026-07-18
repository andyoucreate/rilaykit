/**
 * PROOF — compileFlow: a backend's pure JSON becomes a live validated multi-step
 * flow. The flagship of the P2 schema layer.
 *
 * The 2-step subscription schema is authored as a JSON STRING and `JSON.parse`d,
 * so the payload is provably data-only. Everything non-serializable is referenced
 * by string key and resolved from `FlowBindings`: an `after` handler doing
 * cross-step prefill, an `allowSkip` predicate over the collected data, and the
 * field-level validators of each step's form.
 */
import type { StepContext } from '@rilaykit/workflow';
import { compileFlow } from '@rilaykit/workflow';
import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';
import { Flow } from '@rilaykit/workflow/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createProofRil } from '../_setup/proof-fixtures';

/** The payload a subscription compiler would emit — data only, no functions. */
const SCHEMA_JSON = `{
  "version": 1,
  "id": "subscription",
  "name": "Subscription",
  "description": "Sign a customer up to a plan",
  "steps": [
    {
      "id": "account",
      "title": "Account",
      "onAfterValidation": "prefillBilling",
      "form": {
        "version": 1,
        "id": "account",
        "fields": [
          {
            "id": "email",
            "type": "text",
            "validation": { "rules": ["required", "email"], "validateOnBlur": true }
          },
          { "id": "company", "type": "text", "default": "Acme" }
        ]
      }
    },
    {
      "id": "billing",
      "title": "Billing",
      "allowSkip": { "binding": "freePlan" },
      "form": {
        "version": 1,
        "id": "billing",
        "fields": [
          { "id": "billingEmail", "type": "text" },
          { "id": "vat", "type": "text" }
        ],
        "defaultValues": { "vat": "FR-UNKNOWN" }
      }
    }
  ]
}`;

/** Reads the account email out of the namespaced workflow data. */
function accountEmail(allData: Record<string, unknown>): string {
  const account = allData.account as Record<string, unknown> | undefined;
  return String(account?.email ?? '');
}

function createBindings(prefillBilling: (step: StepContext) => void): FlowBindings {
  return {
    // Cross-step prefill: the billing email defaults to the account email.
    after: { prefillBilling },
    // A free-plan customer may skip billing entirely.
    allowSkip: { freePlan: ({ allData }) => accountEmail(allData).endsWith('@free.com') },
  };
}

function parseSchema(): FlowSchema {
  const schema: FlowSchema = JSON.parse(SCHEMA_JSON);
  // Data-only authorship: the parsed payload round-trips through JSON unchanged,
  // so it holds no functions or closures.
  expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(SCHEMA_JSON)));
  return schema;
}

describe('PROOF compileFlow — server JSON → live validated multi-step flow', () => {
  it('navigates a JSON-authored 2-step flow, prefills across steps via the after binding, and completes with the exact namespaced payload', async () => {
    const prefillBilling = vi.fn((step: StepContext) => {
      step.next.prefill({ billingEmail: step.data.email });
    });
    const { workflowConfig } = compileFlow(parseSchema(), createProofRil(), {
      bindings: createBindings(prefillBilling),
    });
    const onComplete = vi.fn();

    render(
      <Flow of={workflowConfig} onComplete={onComplete}>
        <Flow.Progress>
          {({ steps }) => <span data-testid="progress">{steps.map((s) => s.id).join(',')}</span>}
        </Flow.Progress>
        <Flow.Body />
        <Flow.Back>Back</Flow.Back>
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    expect(screen.getByTestId('progress').textContent).toBe('account,billing');
    fireEvent.change(screen.getByTestId('company'), { target: { value: 'Acme' } });

    // The JSON validation rules are live: an invalid email blocks navigation and
    // renders its exact built-in message.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Please enter a valid email address')
    );
    expect(screen.getByTestId('email')).toBeInTheDocument();

    // A valid email → the step validates and the `after` binding runs.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'ada@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The after binding prefilled the NEXT step through the real store.
    const billingEmail = (await screen.findByTestId('billingEmail')) as HTMLInputElement;
    expect(billingEmail.value).toBe('ada@acme.com');
    expect(prefillBilling).toHaveBeenCalledTimes(1);
    expect(prefillBilling.mock.calls[0]?.[0].data).toEqual({
      email: 'ada@acme.com',
      company: 'Acme',
    });

    // Back preserves the first step's values, Next replays without re-prefilling wrong.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(((await screen.findByTestId('email')) as HTMLInputElement).value).toBe('ada@acme.com');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByTestId('vat');

    fireEvent.change(screen.getByTestId('vat'), { target: { value: 'FR42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith({
      account: { email: 'ada@acme.com', company: 'Acme' },
      billing: { billingEmail: 'ada@acme.com', vat: 'FR42' },
    });
  });

  /** Drives the JSON flow to the billing step with the given account email. */
  async function reachBillingWith(email: string): Promise<void> {
    const { workflowConfig } = compileFlow(parseSchema(), createProofRil(), {
      bindings: createBindings(() => {}),
    });
    render(
      <Flow of={workflowConfig}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
        <Flow.Skip>Skip</Flow.Skip>
      </Flow>
    );
    fireEvent.change(screen.getByTestId('email'), { target: { value: email } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByTestId('billingEmail');
  }

  it('hides Skip on the billing step for a paying customer (allowSkip binding resolves false)', async () => {
    await reachBillingWith('ada@acme.com');
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('shows Skip on the same JSON step for a free-plan customer (allowSkip binding resolves true)', async () => {
    await reachBillingWith('ada@free.com');
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  /**
   * A JSON-authored flow carries its own initial values.
   *
   * `compileFlow` is symmetric with `compileForm`: because `WorkflowConfig` has
   * no defaults slot, the compiled defaults come back OUT OF BAND, already keyed
   * by step id — exactly the shape `<Flow defaults>` consumes. Both JSON default
   * channels reach the live step: a step form's `defaultValues` block AND a
   * per-field inline `default` (the P2 streaming-friendly feature).
   */
  it('carries a step form’s JSON defaults — both the defaultValues block and the per-field inline default reach the live step', async () => {
    const schema: FlowSchema = parseSchema();
    // The two JSON default channels, as authored by the backend.
    expect(schema.steps[0]?.form.fields?.[1]).toEqual({
      id: 'company',
      type: 'text',
      default: 'Acme',
    });
    expect(schema.steps[1]?.form.defaultValues).toEqual({ vat: 'FR-UNKNOWN' });

    const { workflowConfig, defaultValues } = compileFlow(schema, createProofRil(), {
      bindings: createBindings(() => {}),
    });

    // Compiled defaults are namespaced by step id — no step without defaults is keyed.
    expect(defaultValues).toEqual({
      account: { company: 'Acme' },
      billing: { vat: 'FR-UNKNOWN' },
    });

    render(
      <Flow of={workflowConfig} defaults={defaultValues}>
        <Flow.Body />
        <Flow.Next>Next</Flow.Next>
      </Flow>
    );

    // The JSON said `Acme` — the live step renders `Acme`.
    expect(((await screen.findByTestId('company')) as HTMLInputElement).value).toBe('Acme');

    // And the next step's `defaultValues` block seeds it too, through the real store.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'ada@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(((await screen.findByTestId('vat')) as HTMLInputElement).value).toBe('FR-UNKNOWN');
  });

  it('omits defaultValues entirely for a flow whose steps declare none', () => {
    const schema: FlowSchema = parseSchema();
    const bare: FlowSchema = {
      ...schema,
      steps: schema.steps.map((step) => ({
        ...step,
        form: {
          ...step.form,
          defaultValues: undefined,
          fields: step.form.fields?.map(({ default: _default, ...field }) => field),
        },
      })),
    };

    const { workflowConfig, defaultValues } = compileFlow(bare, createProofRil(), {
      bindings: createBindings(() => {}),
    });

    expect(defaultValues).toBeUndefined();
    expect(workflowConfig.steps.map((s) => s.id)).toEqual(['account', 'billing']);
  });
});
