import { describe, expect, it } from 'vitest';
import { ril } from '../../src/config/ril';

interface Cyclic {
  self?: Cyclic;
  x?: number;
}

describe('clonePlainData cycle guard', () => {
  it('does not overflow the stack on a cyclic defaultProps', () => {
    const cyc: Cyclic = {};
    cyc.self = cyc;

    expect(() =>
      ril.create().component('c', { renderer: () => null, defaultProps: cyc })
    ).not.toThrow();
  });

  it('preserves the cycle in the stored clone', () => {
    const cyc: Cyclic = {};
    cyc.self = cyc;

    const config = ril.create().component('c', { renderer: () => null, defaultProps: cyc });
    const stored = config.getComponent('c')?.defaultProps as Cyclic;

    expect(stored.self).toBe(stored);
  });

  it('produces an independent clone (input mutation does not leak)', () => {
    const cyc: Cyclic = {};
    cyc.self = cyc;

    const config = ril.create().component('c', { renderer: () => null, defaultProps: cyc });
    const stored = config.getComponent('c')?.defaultProps as Cyclic;

    // Mutate the original input through its cycle.
    (cyc.self as Cyclic).x = 42;

    expect(stored.x).toBeUndefined();
  });
});
