import type { FieldConfigFor, FieldConfigOf } from '@rilaykit/core';
import type { FieldConfig } from '@rilaykit/forms';
import { describe, expectTypeOf, it } from 'vitest';

type Cat = { text: { label?: string }; num: { min?: number } };

describe('FieldConfigFor ↔ FieldConfig assignability', () => {
  it('makes every FieldConfigFor<C> member accepted by the builder FieldConfig<C, T>', () => {
    // The claim the catalog JSDoc makes ("directly assignable to the builder's
    // `.add(...)` — no cast at the builder boundary") pinned as a type test, so
    // the two shapes cannot drift apart unnoticed.
    expectTypeOf<FieldConfigFor<Cat>>().toMatchTypeOf<FieldConfig<Cat, keyof Cat & string>>();
  });

  it('derives the builder FieldConfig from the single core FieldConfigOf member', () => {
    expectTypeOf<FieldConfig<Cat, 'text'>>().toEqualTypeOf<FieldConfigOf<Cat, 'text'>>();
    expectTypeOf<FieldConfigFor<Cat>>().toEqualTypeOf<
      FieldConfigOf<Cat, 'text'> | FieldConfigOf<Cat, 'num'>
    >();
  });

  it('exposes exactly the builder-consumed slots — no dead `default` slot', () => {
    expectTypeOf<keyof FieldConfigOf<Cat, 'text'>>().toEqualTypeOf<
      'id' | 'type' | 'props' | 'validation' | 'conditions' | 'effects'
    >();
  });
});
