import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import React from 'react';
import { describe, it } from 'vitest';

/**
 * `.add()` / `.addSeparateRows()` must narrow EACH argument independently to the
 * component type that argument declares. A variadic call whose arguments have
 * different `type`s used to widen the inferred type parameter to the union of
 * them all, which widened `props` to the union of every sibling's props — so a
 * field could be handed a sibling component's props and still type-check.
 */
function makeCatalog() {
  return ril
    .create()
    .component('alpha', {
      name: 'Alpha',
      renderer: () => React.createElement('input'),
      defaultProps: { alphaOnly: '' },
    })
    .component('beta', {
      name: 'Beta',
      renderer: () => React.createElement('input'),
      defaultProps: { betaOnly: 0 },
    });
}

type Catalog = ReturnType<typeof makeCatalog> extends ril<infer C> ? C : never;

describe('form.add — mixed-type calls', () => {
  it('accepts each field with its own component props', () => {
    form
      .create<Catalog>(makeCatalog(), 'f')
      .add(
        { id: 'a', type: 'alpha', props: { alphaOnly: 'ok' } },
        { id: 'b', type: 'beta', props: { betaOnly: 1 } }
      )
      .addSeparateRows([
        { id: 'c', type: 'alpha', props: { alphaOnly: 'ok' } },
        { id: 'd', type: 'beta', props: { betaOnly: 2 } },
      ]);
  });

  it('rejects a field given a sibling component type props in a mixed variadic call', () => {
    form.create<Catalog>(makeCatalog(), 'f').add(
      // @ts-expect-error — `alpha` does not accept `beta`'s props
      { id: 'a', type: 'alpha', props: { betaOnly: 1 } },
      { id: 'b', type: 'beta', props: { betaOnly: 1 } }
    );
  });

  it('rejects a field given a sibling component type props in a mixed array call', () => {
    // The array overload reports on the call, not the offending element.
    // @ts-expect-error — `beta` does not accept `alpha`'s props
    form.create<Catalog>(makeCatalog(), 'f').add([
      { id: 'a', type: 'beta', props: { alphaOnly: 'x' } },
      { id: 'b', type: 'alpha', props: { alphaOnly: 'x' } },
    ]);
  });

  it('rejects a field given a sibling component type props in a mixed addSeparateRows call', () => {
    form.create<Catalog>(makeCatalog(), 'f').addSeparateRows([
      // @ts-expect-error — `alpha` does not accept `beta`'s props
      { id: 'a', type: 'alpha', props: { betaOnly: 1 } },
      { id: 'b', type: 'beta', props: { betaOnly: 1 } },
    ]);
  });
});
