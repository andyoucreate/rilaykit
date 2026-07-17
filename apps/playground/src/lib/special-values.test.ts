import { describe, expect, it } from 'vitest';
import { SPECIAL_VALUES, inspect } from './special-values';

/**
 * `inspect` produces the demo's ✅/❌ verdicts, so the pass/fail signal itself must
 * be proven — a faithful round trip reports every value preserved, and the corrupt
 * shapes a plain JSON round trip yields (Date→string, NaN/Infinity→null, BigInt→
 * number) report every value NOT preserved. Otherwise a broken operator could flip
 * a checkmark with nothing failing.
 */
describe('inspect', () => {
  it('reports every value preserved for a faithful round trip', () => {
    const rows = inspect({
      when: SPECIAL_VALUES.when,
      nan: SPECIAL_VALUES.nan,
      infinity: SPECIAL_VALUES.infinity,
      big: SPECIAL_VALUES.big,
    });

    expect(rows.map((row) => [row.label, row.preserved])).toEqual([
      ['Date', true],
      ['NaN', true],
      ['Infinity', true],
      ['BigInt', true],
    ]);
    expect(rows.find((row) => row.label === 'Date')?.loaded).toBe(
      `Date(${SPECIAL_VALUES.when.toISOString()})`
    );
    expect(rows.find((row) => row.label === 'BigInt')?.loaded).toBe(`${SPECIAL_VALUES.big}n`);
  });

  it('reports every value NOT preserved for the shapes a plain JSON round trip yields', () => {
    const rows = inspect({
      when: SPECIAL_VALUES.when.toISOString(), // Date → ISO string
      nan: null, // NaN → null
      infinity: null, // Infinity → null
      big: 9007199254740992, // BigInt → number (also loses the last digit)
    });

    expect(rows.every((row) => row.preserved === false)).toBe(true);
    expect(rows.find((row) => row.label === 'Date')?.loaded).toBe(
      `string: ${SPECIAL_VALUES.when.toISOString()}`
    );
    expect(rows.find((row) => row.label === 'BigInt')?.loaded).toBe('number: 9007199254740992');
  });
});
