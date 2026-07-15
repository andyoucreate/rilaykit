/**
 * =============================================================================
 * FLAGSHIP E2E — "Backend sends pure JSON, it becomes a live validated form".
 *
 * The whole schema is authored as a JSON STRING and `JSON.parse`d — proving the
 * payload is data-only (no functions, no closures), exactly what a subscription
 * compiler / backend would emit. Non-serializable logic (an ASYNC uniqueness
 * check, an effect handler) is resolved by name through the SchemaRegistry.
 *
 * It proves end-to-end (real store, real registry, never mocked):
 *   1. A registry ASYNC validator referenced by name ('uniqueEmail') fires and
 *      surfaces its error for a taken email, and clears for a free one.
 *   2. A registry effect referenced by name ('slugify') runs on change.
 *   3. Submit yields the exact payload.
 * =============================================================================
 */
import { async as asyncValidator } from '@rilaykit/core';
import type { FieldEffectContext } from '@rilaykit/core';
import { Form, fromSchema } from '@rilaykit/forms';
import type { FormSchema, SchemaRegistry } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ril } from 'rilaykit';
import { describe, expect, it, vi } from 'vitest';
import { ProofTextInput } from '../_setup/proof-fixtures';

// A real (non-mocked) ~40ms async delay so the uniqueness check exercises the
// genuine async validation path.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCatalog() {
  return ril.create().component('text', { name: 'Text', renderer: ProofTextInput });
}

describe('Flagship — server JSON becomes a live validated form', () => {
  it('threads a registry ASYNC validator + named effect from a pure-JSON schema and submits the exact payload', async () => {
    // ---- The payload a backend would send: a STRING, parsed to data-only JSON.
    const jsonString = `{
      "id": "subscription-signup",
      "rows": [
        {
          "kind": "fields",
          "fields": [
            {
              "id": "email",
              "type": "text",
              "props": { "label": "Work email" },
              "validation": {
                "rules": ["required", { "type": "uniqueEmail", "message": "Email already registered" }],
                "validateOnChange": true
              }
            },
            {
              "id": "workspace",
              "type": "text",
              "props": { "label": "Workspace" },
              "effects": [
                { "trigger": "change", "watch": "email", "handler": "slugify", "params": { "suffix": "-team" } }
              ]
            }
          ]
        }
      ],
      "defaultValues": { "email": "", "workspace": "" }
    }`;

    const schema: FormSchema = JSON.parse(jsonString);

    // Proof of data-only authorship: no functions anywhere in the parsed payload.
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(jsonString)));

    // ---- Non-serializable logic is provided out-of-band, resolved by name.
    const slugify = vi.fn(
      (value: unknown, context: FieldEffectContext, params?: Record<string, unknown>) => {
        const email = String(value ?? '');
        const local = email.split('@')[0] ?? '';
        const suffix = String(params?.suffix ?? '');
        context.setValue('workspace', local ? `${local}${suffix}` : '');
      }
    );

    const registry: SchemaRegistry = {
      validators: {
        uniqueEmail: (_params, message) =>
          asyncValidator<string>(async (v) => {
            await delay(40);
            return v !== 'taken@x.com';
          }, message ?? 'Email taken'),
      },
      effects: { slugify },
    };

    const catalog = createCatalog();
    const { formConfig, defaultValues } = fromSchema(schema, catalog, registry);

    const onSubmit = vi.fn();

    render(
      <Form of={formConfig} defaults={defaultValues} onSubmit={onSubmit}>
        <Form.Body />
        <Form.Submit>
          {({ submit }) => (
            <button type="button" data-testid="submit" onClick={submit}>
              Submit
            </button>
          )}
        </Form.Submit>
      </Form>
    );

    await waitFor(() => {
      expect(screen.getByTestId('email')).toBeInTheDocument();
    });

    // ---- Type a TAKEN email → async registry validator rejects → error shows.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'taken@x.com' } });

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
    // The named effect ran on change: workspace derived from the email local-part.
    expect(screen.getByTestId('workspace')).toHaveValue('taken-team');
    expect(slugify).toHaveBeenCalledWith(
      'taken@x.com',
      expect.objectContaining({ setValue: expect.any(Function) }),
      { suffix: '-team' }
    );

    // ---- Correct to a FREE email → async validator passes → error clears.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'free@x.com' } });

    await waitFor(() => {
      expect(screen.queryByText('Email already registered')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace')).toHaveValue('free-team');

    // ---- Submit → exact payload.
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({ email: 'free@x.com', workspace: 'free-team' });
  });
});
