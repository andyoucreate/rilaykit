import { afterEach, describe, expect, it, vi } from 'vitest';
import { RilayMonitor } from '../../src/monitoring';

/**
 * Round 41: the sample-rate threshold used `this.config.sampleRate || 1.0`, so a
 * `sampleRate` of 0 (track nothing) — being falsy — collapsed to 1.0 and tracked
 * EVERYTHING, the exact inverse of the intent. `?? 1.0` only falls back for
 * null/undefined.
 */
function trackedCount(config: { sampleRate?: number }, n: number): number {
  const captured: unknown[] = [];
  const monitor = new RilayMonitor({
    enabled: true,
    flushInterval: 0,
    onEvent: (e) => captured.push(e),
    ...config,
  });
  for (let i = 0; i < n; i++) monitor.track('form_submission', 'probe', {});
  return captured.length;
}

describe('Round 41: sampleRate is honored (0 drops all, undefined keeps all)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sampleRate=0 drops ALL events (was 100% kept with `|| 1.0`)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(trackedCount({ sampleRate: 0 }, 100)).toBe(0);
  });

  it('sampleRate=1.0 keeps ALL events', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(trackedCount({ sampleRate: 1.0 }, 50)).toBe(50);
  });

  it('an omitted sampleRate defaults to keeping all', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(trackedCount({}, 30)).toBe(30);
  });
});
