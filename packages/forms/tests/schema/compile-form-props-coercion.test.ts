import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileForm } from '../../src/schema';

/**
 * PINNED CONTRACT: `validateProps: true` feeds the COERCED props value into the
 * built field, not the raw one. A propsSchema is a Standard Schema, so it may
 * transform or apply defaults — discarding its output would make every
 * transform in a propsSchema silently meaningless.
 *
 * Without `validateProps`, props pass through untouched (the schema is never
 * run at all).
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

describe('compileForm validateProps coercion', () => {
  it('feeds the coerced props value into the built field', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'hi' } }],
    };

    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });

    expect(formConfig.allFields[0].props).toEqual({ label: 'HI', size: 'md' });
  });

  it('coerces props of a repeatable template field too', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      rows: [
        {
          kind: 'repeatable' as const,
          repeatable: {
            id: 'rep',
            rows: [
              { kind: 'fields' as const, fields: [{ id: 'b', type: 'text', props: { label: 'x' } }] },
            ],
          },
        },
      ],
    };

    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });

    expect(formConfig.repeatableFields?.rep.allFields[0].props).toEqual({
      label: 'X',
      size: 'md',
    });
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

  it('does not mutate the input schema when coercing', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'hi' } }],
    };

    compileForm(schema, makeCatalog(), { validateProps: true });

    expect(schema.fields[0].props).toEqual({ label: 'hi' });
  });
});
