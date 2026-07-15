import { ril } from '@rilaykit/core';
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

  it('reports one issue per prop violation, pathed to the field id', () => {
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
    // `label` is the wrong type and `options` is missing → two zod issues.
    expect(caught?.issues.length).toBe(2);
    expect(caught?.issues.every((issue) => issue.path === 's')).toBe(true);
    expect(caught?.issues.every((issue) => issue.severity === 'error')).toBe(true);
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
    expect(caught?.issues.map((issue) => issue.path).includes('a')).toBe(true);
    expect(caught?.issues.map((issue) => issue.path).includes('b')).toBe(true);
  });
});
