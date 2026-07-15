import { ConfigurationError, type StandardSchema, ril } from '@rilaykit/core';
import { SchemaValidationError, compileForm } from '@rilaykit/forms';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

function makeCatalog() {
  return ril
    .create()
    .component('select', {
      name: 'Select',
      propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
      renderer: () => React.createElement('select'),
    })
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

/** A Standard Schema whose validate() is async — an illegal propsSchema. */
const asyncPropsSchema: StandardSchema<Record<string, unknown>, Record<string, unknown>> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: async (value) => ({ value: value as Record<string, unknown> }),
  },
};

function makeAsyncCatalog() {
  return ril.create().component('a', {
    name: 'Async',
    propsSchema: asyncPropsSchema,
    renderer: () => React.createElement('input'),
  });
}

describe('compileForm validateProps option', () => {
  it('passes valid props', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 's', type: 'select', props: { label: 'L', options: ['a'] } }],
    };
    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });
    expect(formConfig.id).toBe('f');
  });

  it('throws SchemaValidationError on invalid props when validateProps:true', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 's', type: 'select', props: { label: 42 } }],
    };
    expect(() => compileForm(schema, makeCatalog(), { validateProps: true })).toThrowError(
      SchemaValidationError
    );
  });

  it('reports one issue per prop violation, pathed to the offending prop key', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 's', type: 'select', props: { label: 42 } }],
    };
    let caught: SchemaValidationError | undefined;
    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    // `label` is the wrong type and `options` is missing → two zod issues, each
    // carrying the vendor's own diagnostic through to SchemaIssue.message, each
    // pathed to the prop that is actually wrong and carrying the component's
    // full accepted-key set so a producer can self-correct.
    expect(caught?.issues).toEqual([
      {
        path: 'fields[0].props.label',
        message: 'Invalid input: expected string, received number',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
      {
        path: 'fields[0].props.options',
        message: 'Invalid input: expected array, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
    ]);
  });

  it('treats a missing props key as empty props, reporting one issue per required prop', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 's', type: 'select' }],
    };
    let caught: SchemaValidationError | undefined;
    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    // Normalizing absent props to `{}` keeps the per-key diagnostics: an agent
    // that omitted props entirely gets the full required-prop list in one pass,
    // not a single "expected object, received undefined".
    expect(caught?.issues).toEqual([
      {
        path: 'fields[0].props.label',
        message: 'Invalid input: expected string, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
      {
        path: 'fields[0].props.options',
        message: 'Invalid input: expected array, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
    ]);
  });

  it('ignores prop errors when validateProps is not set (default)', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 's', type: 'select', props: { label: 42 } }],
    };
    const { formConfig } = compileForm(schema, makeCatalog());
    expect(formConfig.id).toBe('f');
  });

  it('skips fields whose component declares no propsSchema', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 't', type: 'text', props: { anything: 42 } }],
    };
    const { formConfig } = compileForm(schema, makeCatalog(), { validateProps: true });
    expect(formConfig.id).toBe('f');
  });

  it('lets a catalog defect (async propsSchema) surface as ConfigurationError', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'a', props: {} }],
    };
    expect(() => compileForm(schema, makeAsyncCatalog(), { validateProps: true })).toThrowError(
      ConfigurationError
    );
    expect(() => compileForm(schema, makeAsyncCatalog(), { validateProps: true })).toThrowError(
      'propsSchema of "a" is async — props schemas must validate synchronously'
    );
  });

  it('validates props of fields nested in rows and repeatables', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      rows: [
        { kind: 'fields' as const, fields: [{ id: 'a', type: 'select', props: { label: 42 } }] },
        {
          kind: 'repeatable' as const,
          repeatable: {
            id: 'rep',
            rows: [
              {
                kind: 'fields' as const,
                fields: [{ id: 'b', type: 'select', props: { label: 7 } }],
              },
            ],
          },
        },
      ],
    };
    let caught: SchemaValidationError | undefined;
    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
    } catch (error) {
      caught = error as SchemaValidationError;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect(caught?.issues).toEqual([
      {
        path: 'rows[0].fields[0].props.label',
        message: 'Invalid input: expected string, received number',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
      {
        path: 'rows[0].fields[0].props.options',
        message: 'Invalid input: expected array, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
      {
        path: 'rows[1].repeatable.rows[0].fields[0].props.label',
        message: 'Invalid input: expected string, received number',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
      {
        path: 'rows[1].repeatable.rows[0].fields[0].props.options',
        message: 'Invalid input: expected array, received undefined',
        severity: 'error',
        expectedKeys: ['label', 'options'],
      },
    ]);
  });
});
