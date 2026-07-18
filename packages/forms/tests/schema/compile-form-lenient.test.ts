import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';
import { SchemaValidationError } from '../../src/schema/types';

const catalog = ril.create().component('text', {
  description: 'Text',
  propsSchema: z.object({ label: z.string() }),
});

describe('compileForm lenient mode', () => {
  it('mounts a field as soon as its definition is complete', () => {
    const { formConfig } = compileForm(
      {
        id: 'f',
        fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }, { id: 'ema' }],
      } as never,
      catalog as never,
      { lenient: true }
    );
    expect(formConfig.allFields.map((field) => field.id)).toEqual(['name']);
  });

  it('skips an unknown type rather than raising, so the next chunk can fix it', () => {
    const { formConfig } = compileForm(
      { id: 'f', fields: [{ id: 'x', type: 'tex' }] } as never,
      catalog as never,
      { lenient: true }
    );
    expect(formConfig.allFields).toEqual([]);
  });

  it('still raises in strict mode — lenient is opt-in, never the default', () => {
    expect(() =>
      compileForm({ id: 'f', fields: [{ id: 'x', type: 'tex' }] } as never, catalog as never)
    ).toThrow(SchemaValidationError);
  });

  it('tolerates a missing fields array entirely', () => {
    const { formConfig } = compileForm({ id: 'f' } as never, catalog as never, { lenient: true });
    expect(formConfig.allFields).toEqual([]);
  });

  it('tolerates an EMPTY TRANSIENT CONTAINER — a field entry that is {} is skipped silently', () => {
    const { formConfig } = compileForm(
      {
        id: 'f',
        fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }, {}],
      } as never,
      catalog as never,
      { lenient: true }
    );
    expect(formConfig.allFields.map((field) => field.id)).toEqual(['name']);
  });

  it('with validateProps: a field whose props are still streaming (invalid) is SKIPPED, not raised', () => {
    const { formConfig } = compileForm(
      {
        id: 'f',
        fields: [
          { id: 'name', type: 'text', props: { label: 'Name' } },
          // `label` torn mid-stream: the partial parser dropped the torn string,
          // so props arrive incomplete and fail the propsSchema — this render only.
          { id: 'email', type: 'text', props: {} },
        ],
      } as never,
      catalog as never,
      { lenient: true, validateProps: true }
    );
    expect(formConfig.allFields.map((field) => field.id)).toEqual(['name']);
  });

  it('KEEPS a complete field but STRIPS its half-arrived validation config', () => {
    // The core definition (id, type, props) is complete, so the field mounts;
    // the validation block is missing a required param mid-stream and must be
    // dropped for this render — dropping the FIELD would unmount it and reset
    // the store (the exact bug class progressive mounting exists to prevent).
    const { formConfig } = compileForm(
      {
        id: 'f',
        fields: [
          {
            id: 'name',
            type: 'text',
            props: { label: 'Name' },
            validation: { rules: [{ type: 'minLength' }] },
          },
        ],
      } as never,
      catalog as never,
      { lenient: true }
    );
    expect(formConfig.allFields.map((field) => field.id)).toEqual(['name']);
    expect(formConfig.allFields[0].validation?.validate).toBeUndefined();
  });

  it('skips a later duplicate id instead of raising — the first occurrence wins', () => {
    const { formConfig } = compileForm(
      {
        id: 'f',
        fields: [
          { id: 'name', type: 'text', props: { label: 'First' } },
          { id: 'name', type: 'text', props: { label: 'Second' } },
        ],
      } as never,
      catalog as never,
      { lenient: true }
    );
    expect(formConfig.allFields).toHaveLength(1);
    expect(formConfig.allFields[0].props).toEqual({ label: 'First' });
  });

  it('skips an incomplete repeatable, then compiles it once its template is complete', () => {
    const incomplete: FormSchema = {
      id: 'f',
      rows: [
        {
          kind: 'repeatable',
          repeatable: { id: 'lines', rows: [{ fields: [{ id: 'label' }] }] },
        },
      ],
    } as never;
    const { formConfig: partial } = compileForm(incomplete, catalog as never, { lenient: true });
    expect(partial.repeatableFields).toBeUndefined();

    const complete: FormSchema = {
      id: 'f',
      rows: [
        {
          kind: 'repeatable',
          repeatable: {
            id: 'lines',
            rows: [{ fields: [{ id: 'label', type: 'text', props: { label: 'L' } }] }],
          },
        },
      ],
    } as never;
    const { formConfig: full } = compileForm(complete, catalog as never, { lenient: true });
    expect(Object.keys(full.repeatableFields ?? {})).toEqual(['lines']);
  });

  it('never throws on a partial schema — a missing id degrades instead of raising', () => {
    expect(() => compileForm({} as never, catalog as never, { lenient: true })).not.toThrow();
  });
});
