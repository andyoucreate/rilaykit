import { type MonitoringEvent, RemoteAdapter } from '@rilaykit/core';
/**
 * Round-4 Bug 7 — RemoteAdapter concurrent drain must not produce a
 * false-FAILURE. When an early network batch fails but a later batch (covering
 * other callers' events) succeeds, only the genuinely-undelivered caller may
 * reject; callers whose events were delivered must fulfill. No event may be
 * sent twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENDPOINT = 'https://monitor.example.com/ingest';

const base: MonitoringEvent = {
  id: 'evt',
  type: 'form_submission',
  timestamp: 1_700_000_000_000,
  source: 'form:x',
  data: {},
  severity: 'low',
};
const eventA: MonitoringEvent = { ...base, id: 'evt-A' };
const eventB: MonitoringEvent = { ...base, id: 'evt-B' };
const eventC: MonitoringEvent = { ...base, id: 'evt-C' };

function okResponse(): Response {
  return { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
}

describe('RemoteAdapter concurrent drain (Bug 7)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects only the genuinely-undelivered caller and never sends an event twice', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const networkError = new Error('Network down');
    // 1st network attempt fails, every later attempt succeeds.
    fetchMock.mockRejectedValueOnce(networkError).mockResolvedValue(okResponse());

    const adapter = new RemoteAdapter({ endpoint: ENDPOINT, retryAttempts: 1 });

    const settle = (p: Promise<void>) =>
      p.then(
        () => 'fulfilled' as const,
        (e: unknown) => e
      );

    // The first send starts a drain that takes eventA into batch #1 alone; B and
    // C queue behind it and are delivered by the recovery batch #2.
    const pA = settle(adapter.send([eventA]));
    const pB = settle(adapter.send([eventB]));
    const pC = settle(adapter.send([eventC]));

    const [rA, rB, rC] = await Promise.all([pA, pB, pC]);

    // A's only attempt failed → genuine rejection.
    expect(rA).toBe(networkError);
    // B and C were delivered by the recovery drain → must fulfill, not reject.
    expect(rB).toBe('fulfilled');
    expect(rC).toBe('fulfilled');

    // No event delivered more than once.
    const sentIds = fetchMock.mock.calls
      .flatMap((call) => JSON.parse((call[1] as RequestInit).body as string).events)
      .map((e: MonitoringEvent) => e.id);
    expect(sentIds.filter((id) => id === 'evt-B')).toHaveLength(1);
    expect(sentIds.filter((id) => id === 'evt-C')).toHaveLength(1);
    expect(sentIds.filter((id) => id === 'evt-A')).toHaveLength(1);

    consoleErrorSpy.mockRestore();
  });
});
