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

  it('collects falsy inline defaults (false, 0, empty string, null)', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'checked', type: 'text', default: false },
        { id: 'count', type: 'text', default: 0 },
        { id: 'note', type: 'text', default: '' },
        { id: 'nil', type: 'text', default: null },
      ],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toEqual({ checked: false, count: 0, note: '', nil: null });
  });

  it('omits a field that declares an explicit `default: undefined`', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', default: undefined }],
    };
    const { defaultValues } = compileForm(schema, makeCatalog());
    expect(defaultValues).toBeUndefined();
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

describe('compileForm defaultValues isolation', () => {
  function makeSchema() {
    return {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'x', type: 'text' }],
      defaultValues: { x: 'original' },
    };
  }

  it('returns a fresh defaultValues object per compile, detached from the input schema', () => {
    const schema = makeSchema();

    const a = compileForm(schema, makeCatalog());
    const b = compileForm(schema, makeCatalog());

    (a.defaultValues as Record<string, unknown>).x = 'mutated';

    expect(b.defaultValues).toEqual({ x: 'original' });
    expect(schema.defaultValues).toEqual({ x: 'original' });
  });

  it('detaches defaultValues from the schema even when a field also declares an inline default', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'x', type: 'text', default: 'inline' }],
      defaultValues: { y: 'original' },
    };

    const result = compileForm(schema, makeCatalog());
    (result.defaultValues as Record<string, unknown>).y = 'mutated';

    expect(schema.defaultValues).toEqual({ y: 'original' });
  });
})
