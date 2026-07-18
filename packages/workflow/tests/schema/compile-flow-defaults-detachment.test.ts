import { ril } from '@rilaykit/core';
import { compileFlow } from '@rilaykit/workflow';
import React from 'react';
import { describe, expect, it } from 'vitest';

/**
 * compileFlow's per-step defaults must be detached to the same depth as
 * compileForm's: two compiles of one schema, and the caller's parsed JSON, must
 * never share a nested default object.
 */
function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

function makeSchema() {
  return {
    version: 1 as const,
    id: 'wf',
    name: 'Flow',
    steps: [
      {
        id: 'a',
        title: 'A',
        form: {
          version: 1 as const,
          id: 'a-form',
          fields: [{ id: 'f', type: 'text', props: {} }],
          defaultValues: { profile: { name: 'Ada', tags: ['x'] } },
        },
      },
    ],
  };
}

describe('compileFlow defaults detachment', () => {
  it('detaches nested per-step defaults across two compiles', () => {
    const schema = makeSchema();
    const first = compileFlow(schema, makeCatalog()).defaultValues as Record<string, any>;
    const second = compileFlow(schema, makeCatalog()).defaultValues as Record<string, any>;

    expect(first.a.profile).not.toBe(second.a.profile);

    first.a.profile.name = 'MUTATED';
    first.a.profile.tags.push('y');

    expect(second.a.profile.name).toBe('Ada');
    expect(second.a.profile.tags).toEqual(['x']);
  });

  it('detaches nested per-step defaults from the input schema', () => {
    const schema = makeSchema();
    const compiled = compileFlow(schema, makeCatalog()).defaultValues as Record<string, any>;

    compiled.a.profile.name = 'MUTATED';

    expect(schema.steps[0].form.defaultValues.profile.name).toBe('Ada');
  });
});
