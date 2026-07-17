/**
 * A line's price grossed up by a percentage tax rate, rounded to 2 decimals.
 * Empty or non-numeric inputs coerce to 0, so a blank field reads as zero rather
 * than NaN.
 */
export function grossUpTotal(price: unknown, taxRate: unknown): number {
  const p = Number(price) || 0;
  const t = Number(taxRate) || 0;
  return Number((p * (1 + t / 100)).toFixed(2));
}
