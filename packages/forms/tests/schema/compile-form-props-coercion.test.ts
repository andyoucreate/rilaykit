import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileForm } from '../../src/schema';

/**
 * PINNED CONTRACT: `validateProps: true` VALIDATES and never rewrites. The props
 * the author declared are the props the field is built with, byte for byte.
 *
 * P2-r2 briefly fed each propsSchema's COERCED output into the built field, on
 * the reasoning that a Standard Schema may transform and discarding its output
 * would make transforms meaningless. That reasoning is real but strictly weaker
 * than what it cost: a `z.object()` — the exact shape ril's own propsSchema
 * example documents — STRIPS undeclared keys by default and reports no issue
 * while doing it. So `props: { label, placeholder }` against a schema declaring
 * only `label` silently lost `placeholder`: the component rendered without it,
 * and the author got no diagnostic. Silent prop deletion is a worse failure than
 * an unapplied transform, which an author can always express in the component or
 * in `defaultProps`. The option is named `validateProps`, and it now only
 * validates.
 */
function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
    propsSchema: z.object({
      label: z.string().transform((s) => s.toUpperCase()),
      size: z.string().default('md'),
    }),
  });
}

describe('compileForm validateProps does not rewrite props', () => {
  it('builds the field with the AUTHOR’s props — no transform applied, no default injected', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'hi' } }],
    };

    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });

    expect(formConfig.allFields[0].props).toEqual({ label: 'hi' });
  });

  it('keeps props the propsSchema does not declare instead of silently stripping them', () => {
    // The regression that decided this contract: a `z.object()` strips unknown
    // keys and raises NO issue, so feeding its output back deleted these two
    // props with no diagnostic whatsoever.
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', props: { label: 'hi', placeholder: 'you@x.com', rows: 3 } },
      ],
    };

    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });

    expect(formConfig.allFields[0].props).toEqual({
      label: 'hi',
      placeholder: 'you@x.com',
      rows: 3,
    });
  });

  it('leaves a repeatable template field’s props untouched too', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      rows: [
        {
          kind: 'repeatable' as const,
          repeatable: {
            id: 'rep',
            rows: [
              {
                kind: 'fields' as const,
                fields: [{ id: 'b', type: 'text', props: { label: 'x', hint: 'keep me' } }],
              },
            ],
          },
        },
      ],
    };

    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });

    expect(formConfig.repeatableFields?.rep.allFields[0].props).toEqual({
      label: 'x',
      hint: 'keep me',
    });
  });

  it('still REJECTS props that violate the propsSchema', () => {
    // Validation-only is not validation-less: the option's whole job still works.
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 42 } }],
    };

    expect(() => compileForm(schema, makeCatalog(), { validateProps: true })).toThrow(
      /Invalid form schema/
    );
  });

  it('leaves props untouched when validateProps is not set', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'hi' } }],
    };

    const { formConfig } = compileForm(schema, makeCatalog());

    expect(formConfig.allFields[0].props).toEqual({ label: 'hi' });
  });

  it('does not mutate the input schema', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'hi' } }],
    };

    compileForm(schema, makeCatalog(), { validateProps: true });

    expect(schema.fields[0].props).toEqual({ label: 'hi' });
  });
});
