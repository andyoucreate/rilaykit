/**
 * PROOF — compileForm: pure JSON becomes a live validated form.
 *
 * The schema is authored as a JSON STRING and `JSON.parse`d, so the payload is
 * provably data-only (no functions, no closures) — exactly what a backend or a
 * subscription compiler emits. Everything non-serializable (an ASYNC uniqueness
 * validator, a named effect handler) is resolved by string key through
 * `options.bindings`.
 *
 * Matrix rows proven here: compileForm bindings resolve registry validators +
 * named effects; per-field inline `default` merged (top-level block wins) and
 * reaching the rendered inputs; the dynamic-build path carries no `any` cast.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { async as asyncValidator } from '@rilaykit/core';
import type { FieldEffectContext } from '@rilaykit/core';
import { Form, compileForm } from '@rilaykit/forms';
import type { Bindings, FormSchema } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createProofRil } from '../_setup/proof-fixtures';

/** A real (non-mocked) delay so the uniqueness check exercises the async path. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The payload a backend would send: per-field inline defaults (streaming
 * friendly), a registry validator referenced by name, and a named effect.
 * `plan` carries BOTH an inline default and a top-level override.
 */
const SCHEMA_JSON = `{
  "version": 1,
  "id": "subscription-signup",
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
      "default": "acme-team",
      "effects": [
        { "trigger": "change", "watch": "email", "handler": "slugify", "params": { "suffix": "-team" } }
      ]
    },
    { "id": "plan", "type": "text", "default": "starter" }
  ],
  "defaultValues": { "email": "", "plan": "pro" }
}`;

function createBindings(slugify: Bindings['effects']): Bindings {
  return {
    validators: {
      uniqueEmail: (_params, message) =>
        asyncValidator<string>(async (value) => {
          await delay(40);
          return value !== 'taken@x.com';
        }, message ?? 'Email taken'),
    },
    effects: slugify,
  };
}

describe('PROOF compileForm — JSON → live validated form', () => {
  it('threads a bindings ASYNC validator + named effect from a data-only JSON schema and submits the exact payload', async () => {
    const schema: FormSchema = JSON.parse(SCHEMA_JSON);

    // Data-only authorship: the parsed payload round-trips through JSON
    // unchanged, so it holds no functions.
    expect(JSON.stringify(schema)).toBe(JSON.stringify(JSON.parse(SCHEMA_JSON)));

    // Derives the workspace from the email's local-part. An empty email derives
    // nothing — the effect also fires once at mount for the seeded `email: ''`,
    // and the inline `workspace` default must survive that pass untouched.
    const slugify = vi.fn(
      (value: unknown, context: FieldEffectContext, params?: Record<string, unknown>) => {
        const local = String(value ?? '').split('@')[0] ?? '';
        if (!local) return;
        context.setValue('workspace', `${local}${String(params?.suffix ?? '')}`);
      }
    );

    const { formConfig, defaultValues } = compileForm(schema, createProofRil(), {
      bindings: createBindings({ slugify }),
    });

    // Inline defaults merged under the schema-level block: `plan` declares both,
    // and the explicit top-level `defaultValues` wins.
    expect(defaultValues).toEqual({ workspace: 'acme-team', email: '', plan: 'pro' });

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

    // The merged defaults reach the live inputs.
    expect(((await screen.findByTestId('workspace')) as HTMLInputElement).value).toBe('acme-team');
    expect((screen.getByTestId('plan') as HTMLInputElement).value).toBe('pro');

    // A TAKEN email → the named async validator rejects → its exact message renders.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'taken@x.com' } });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Email already registered')
    );
    // The named effect ran on change, deriving workspace from the email local-part.
    expect((screen.getByTestId('workspace') as HTMLInputElement).value).toBe('taken-team');
    expect(slugify).toHaveBeenCalledWith(
      'taken@x.com',
      expect.objectContaining({ setValue: expect.any(Function) }),
      { suffix: '-team' }
    );

    // A FREE email → the async validator passes → the error clears.
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'free@x.com' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect((screen.getByTestId('workspace') as HTMLInputElement).value).toBe('free-team');

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'free@x.com',
      workspace: 'free-team',
      plan: 'pro',
    });
  });

  it('the compileForm dynamic-build path carries no `any` cast', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'packages/forms/src/schema/compile-form.ts'),
      'utf8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // The only `any` the file is allowed to carry is `Record<string, any>` — the
    // catalog constraint published verbatim by the form builder's `create<Cm>`
    // signature, which compileForm must mirror to stay assignable to it.
    const residual = code.replace(/Record<string,\s*any>/g, '');
    expect(residual.match(/\bany\b/g)).toBeNull();
  });
});
