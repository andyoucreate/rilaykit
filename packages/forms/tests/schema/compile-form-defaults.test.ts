import { ril } from '@rilaykit/core';
import { compileForm } from '@rilaykit/forms';
import React from 'react';
import { describe, expect, it } from 'vitest';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'T', renderer: () => React.createElement('input') });
}

describe('compileForm per-field inline default', () => {
  it('collects per-field `default` into defaultValues', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', default: 'A' },
        { id: 'b', type: 'text' },
      ],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ a: 'A' });
  });

  it('top-level defaultValues overrides a per-field default for the same id', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', default: 'field' }],
      defaultValues: { a: 'top' },
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ a: 'top' });
  });

  it('returns undefined defaultValues when no field declares a default', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text' }],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toBeUndefined();
  });

  it('collects inline defaults from fields inside explicit rows', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      rows: [
        {
          kind: 'fields' as const,
          fields: [
            { id: 'a', type: 'text', default: 'A' },
            { id: 'b', type: 'text', default: 'B' },
          ],
        },
      ],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ a: 'A', b: 'B' });
  });

  it('ignores fields inside repeatable templates (repeatable defaults use defaultValue)', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      rows: [
        { kind: 'fields' as const, fields: [{ id: 'a', type: 'text', default: 'A' }] },
        {
          kind: 'repeatable' as const,
          repeatable: {
            id: 'items',
            rows: [{ kind: 'fields' as const, fields: [{ id: 'x', type: 'text', default: 'X' }] }],
          },
        },
      ],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ a: 'A' });
  });

  it('preserves a top-level default for a field that declares no inline default', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', default: 'A' },
        { id: 'b', type: 'text' },
      ],
      defaultValues: { b: 'B' },
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ a: 'A', b: 'B' });
  });
});
