import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../../src/persistence/adapters/localStorage';
import type { PersistedWorkflowData } from '../../src/persistence/types';

/**
 * Round 42: auto-persistence used a bare JSON.stringify/parse, so a save→load
 * round trip silently corrupted non-JSON-safe field VALUES — a Date became an ISO
 * string, NaN/Infinity/-0 became null/0, and a BigInt made the save reject. A
 * tagged replacer/reviver now preserves them.
 */
describe('Round 42: LocalStorageAdapter preserves special scalar values across save→load', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new LocalStorageAdapter();
  });

  function makeData(fields: Record<string, unknown>): PersistedWorkflowData {
    return {
      currentStepIndex: 0,
      allData: { step: fields },
      stepData: {},
      visitedSteps: [],
      lastSaved: 0,
    };
  }

  it('a Date survives as a Date (not an ISO string)', async () => {
    const when = new Date('2020-06-15T10:00:00.000Z');
    await adapter.save('k', makeData({ when }));
    const loaded = await adapter.load('k');
    const got = (loaded?.allData.step as { when: unknown }).when;
    expect(got).toBeInstanceOf(Date);
    expect((got as Date).getTime()).toBe(when.getTime());
  });

  it('NaN / Infinity / -Infinity / -0 survive (not null / 0)', async () => {
    await adapter.save(
      'k',
      makeData({ nan: Number.NaN, inf: Number.POSITIVE_INFINITY, ninf: Number.NEGATIVE_INFINITY, nz: -0 })
    );
    const step = (await adapter.load('k'))?.allData.step as Record<string, number>;
    expect(Number.isNaN(step.nan)).toBe(true);
    expect(step.inf).toBe(Number.POSITIVE_INFINITY);
    expect(step.ninf).toBe(Number.NEGATIVE_INFINITY);
    expect(Object.is(step.nz, -0)).toBe(true);
  });

  it('a BigInt survives (the save does not reject)', async () => {
    await expect(adapter.save('k', makeData({ big: 10n }))).resolves.toBeUndefined();
    const step = (await adapter.load('k'))?.allData.step as { big: bigint };
    expect(step.big).toBe(10n);
  });

  it('ordinary JSON-safe values are unchanged', async () => {
    await adapter.save('k', makeData({ s: 'hi', n: 42, b: true, arr: [1, 2], nested: { x: null } }));
    const step = (await adapter.load('k'))?.allData.step;
    expect(step).toEqual({ s: 'hi', n: 42, b: true, arr: [1, 2], nested: { x: null } });
  });
});
