import type { FieldConfigFor } from '@rilaykit/core';
import { describe, expectTypeOf, it } from 'vitest';

type Cat = { text: { label?: string }; num: { min?: number } };

describe('FieldConfigFor', () => {
  it('is the discriminated union of valid field configs for the catalog', () => {
    const a: FieldConfigFor<Cat> = { id: 'x', type: 'text', props: { label: 'L' } };
    const b: FieldConfigFor<Cat> = { id: 'y', type: 'num', props: { min: 1 } };
    // Asserted on the type rather than on `a`: control-flow analysis narrows a
    // const initialized with a literal down to the single matching union member,
    // so `typeof a.type` would be `'text'`, never the full discriminant union.
    expectTypeOf<FieldConfigFor<Cat>['type']>().toEqualTypeOf<'text' | 'num'>();
    // @ts-expect-error — 'ghost' is not a registered component type
    const c: FieldConfigFor<Cat> = { type: 'ghost' };
    // @ts-expect-error — label is a string, not number
    const d: FieldConfigFor<Cat> = { type: 'text', props: { label: 42 } };
    void a;
    void b;
    void c;
    void d;
  });
});
