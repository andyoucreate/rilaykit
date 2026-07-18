import { describe, expect, it } from 'vitest';
import { grossUpTotal } from './invoice-total';

/**
 * The invoice fan-out page derives each line's total from its price and the shared
 * tax rate. That arithmetic — percent→fraction, 2-decimal rounding, and coercing
 * empty/non-numeric inputs to 0 — has several silent-regression modes, so it is a
 * pure exported helper with exact-value tests rather than inline in the effect.
 */
describe('grossUpTotal', () => {
  it('grosses a price up by the percentage tax rate', () => {
    expect(grossUpTotal(100, 20)).toBe(120);
    expect(grossUpTotal(50, 10)).toBe(55);
  });

  it('a zero (or empty) tax rate returns the price unchanged', () => {
    expect(grossUpTotal(100, 0)).toBe(100);
    expect(grossUpTotal(100, '')).toBe(100);
  });

  it('rounds to 2 decimals', () => {
    // 99.99 * 1.075 = 107.48925 → 107.49
    expect(grossUpTotal(99.99, 7.5)).toBe(107.49);
  });

  it('coerces string inputs numerically', () => {
    expect(grossUpTotal('200', '25')).toBe(250);
  });

  it('coerces empty / non-numeric price to 0', () => {
    expect(grossUpTotal('', 20)).toBe(0);
    expect(grossUpTotal(Number.NaN, 20)).toBe(0);
    expect(grossUpTotal(undefined, 20)).toBe(0);
  });
});
