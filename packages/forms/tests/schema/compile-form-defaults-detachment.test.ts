import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { compileForm } from '../../src/schema';

/**
 * Round 1 detached the defaults object itself, but only ONE level: every NESTED
 * object and array was still shared — across two compiles of the same schema AND
 * with the caller's own parsed JSON. Mutating one compile's nested default
 * corrupted the other compile and the input schema alike.
 */
function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
}

describe('compileForm defaults detachment', () => {
  it('detaches nested object and array defaults across two compiles', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {} }],
      defaultValues: {
        profile: { name: 'Ada', tags: ['x'] },
        list: [{ n: 1 }],
      },
    };

    const first = compileForm(schema, makeCatalog()).defaultValues as Record<string, any>;
    const second = compileForm(schema, makeCatalog()).defaultValues as Record<string, any>;

    expect(first.profile).not.toBe(second.profile);
    expect(first.profile.tags).not.toBe(second.profile.tags);
    expect(first.list).not.toBe(second.list);
    expect(first.list[0]).not.toBe(second.list[0]);

    first.profile.name = 'MUTATED';
    first.profile.tags.push('y');
    first.list[0].n = 99;

    expect(second.profile.name).toBe('Ada');
    expect(second.profile.tags).toEqual(['x']);
    expect(second.list[0].n).toBe(1);
  });

  it('detaches nested defaults from the input schema', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {} }],
      defaultValues: { profile: { name: 'Ada', tags: ['x'] } },
    };

    const compiled = compileForm(schema, makeCatalog()).defaultValues as Record<string, any>;
    compiled.profile.name = 'MUTATED';
    compiled.profile.tags.push('y');

    expect(schema.defaultValues.profile.name).toBe('Ada');
    expect(schema.defaultValues.profile.tags).toEqual(['x']);
  });

  it('detaches an inline object/array field default from the schema', () => {
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {}, default: { nested: { deep: 1 }, arr: [1] } }],
    };

    const compiled = compileForm(schema, makeCatalog()).defaultValues as Record<string, any>;
    compiled.a.nested.deep = 99;
    compiled.a.arr.push(2);

    expect((schema.fields[0] as any).default.nested.deep).toBe(1);
    expect((schema.fields[0] as any).default.arr).toEqual([1]);
  });
});
