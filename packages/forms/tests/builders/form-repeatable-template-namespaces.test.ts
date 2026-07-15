import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';

/**
 * Each repeatable's template fields live in their OWN namespace: they submit
 * under composite keys (`addresses[k0].name`), never as a bare top-level key.
 * `structureFormValues` is runtime-proven sound on this shape —
 * `{'addresses[k0].name':'Home','contacts[k0].name':'Bob'}` structures to
 * `{addresses:[{name:'Home'}],contacts:[{name:'Bob'}]}` with no collision.
 *
 * Folding every repeatable's template ids into ONE flat namespace alongside the
 * top-level fields therefore wrongly rejects a mainstream backend shape.
 */
function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
}

describe('repeatable template field namespaces', () => {
  it('accepts the same template field id in two different repeatables', () => {
    const builder = form
      .create(makeCatalog(), 'f')
      .addRepeatable('addresses', (r) => r.add({ id: 'name', type: 'text', props: {} }))
      .addRepeatable('contacts', (r) => r.add({ id: 'name', type: 'text', props: {} }));

    expect(builder.validate()).toEqual([]);
    expect(() => builder.build()).not.toThrow();
  });

  it('still rejects a template field id colliding with a TOP-LEVEL field id', () => {
    const builder = form
      .create(makeCatalog(), 'f')
      .add({ id: 'name', type: 'text', props: {} })
      .addRepeatable('addresses', (r) => r.add({ id: 'name', type: 'text', props: {} }));

    expect(builder.validate()).not.toEqual([]);
    expect(() => builder.build()).toThrow(/Duplicate field IDs: name/);
  });

  it('still rejects two colliding template field ids WITHIN one repeatable', () => {
    const builder = form.create(makeCatalog(), 'f').addRepeatable('addresses', (r) =>
      r
        .add({ id: 'name', type: 'text', props: {} })
        .add({ id: 'name', type: 'text', props: {} })
    );

    expect(builder.validate()).not.toEqual([]);
    expect(() => builder.build()).toThrow(/Duplicate field IDs: name/);
  });
});
