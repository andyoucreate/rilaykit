/** The values whose persistence round trip the demo checks — the ones a plain
 *  JSON.stringify/parse silently corrupts. */
export const SPECIAL_VALUES = {
  when: new Date('2026-07-17T10:00:00.000Z'),
  nan: Number.NaN,
  infinity: Number.POSITIVE_INFINITY,
  big: 9007199254740993n,
} as const;

export interface Row {
  label: string;
  original: string;
  loaded: string;
  preserved: boolean;
}

/**
 * Compare a loaded record against {@link SPECIAL_VALUES}: for each value, describe
 * what came back and decide whether it survived its TYPE intact (a Date is still a
 * Date, NaN is still NaN, BigInt is still a bigint of the same value). The `preserved`
 * verdicts are the demo's ✅/❌ signal, so they are computed here and unit-tested.
 */
export function inspect(loaded: Record<string, unknown>): Row[] {
  const when = loaded.when;
  const big = loaded.big;
  return [
    {
      label: 'Date',
      original: SPECIAL_VALUES.when.toISOString(),
      loaded:
        when instanceof Date ? `Date(${when.toISOString()})` : `${typeof when}: ${String(when)}`,
      preserved: when instanceof Date && when.getTime() === SPECIAL_VALUES.when.getTime(),
    },
    {
      label: 'NaN',
      original: 'NaN',
      loaded: String(loaded.nan),
      preserved: Number.isNaN(loaded.nan),
    },
    {
      label: 'Infinity',
      original: 'Infinity',
      loaded: String(loaded.infinity),
      preserved: loaded.infinity === Number.POSITIVE_INFINITY,
    },
    {
      label: 'BigInt',
      original: `${SPECIAL_VALUES.big}n`,
      loaded: typeof big === 'bigint' ? `${big}n` : `${typeof big}: ${String(big)}`,
      preserved: typeof big === 'bigint' && big === SPECIAL_VALUES.big,
    },
  ];
}
