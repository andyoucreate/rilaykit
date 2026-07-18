/**
 * @fileoverview Behavioral tests for the RemoteAdapter monitoring adapter.
 *
 * Pins the adapter's real network behavior: the exact request it issues on the
 * happy path, and its retry/failure semantics (no retry on 4xx, full retry on
 * 5xx, and rethrow of the last error).
 */

import { ConfigurationError, type MonitoringEvent, RemoteAdapter } from '@rilaykit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENDPOINT = 'https://monitor.example.com/ingest';

const event: MonitoringEvent = {
  id: 'evt-1',
  type: 'form_submission',
  timestamp: 1_700_000_000_000,
  source: 'form:contact',
  data: { fieldCount: 3 },
  severity: 'low',
};

function okResponse(): Response {
  return { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
}

function errorResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText } as unknown as Response;
}

describe('RemoteAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('POSTs the batch to the configured endpoint exactly once', async () => {
      fetchMock.mockResolvedValue(okResponse());
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT });

      await expect(adapter.send([event])).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(ENDPOINT);
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

      const parsedBody = JSON.parse(init.body as string);
      expect(parsedBody.events).toEqual([event]);
      expect(parsedBody.source).toBe('rilay-monitoring');
      expect(typeof parsedBody.timestamp).toBe('number');
    });

    it('includes the Bearer auth header when an apiKey is configured', async () => {
      fetchMock.mockResolvedValue(okResponse());
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT, apiKey: 'secret-key' });

      await adapter.send([event]);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
    });
  });

  describe('failure paths', () => {
    it('does NOT retry on a 4xx response and rethrows a ConfigurationError', async () => {
      fetchMock.mockResolvedValue(errorResponse(400, 'Bad Request'));
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT, retryAttempts: 3 });

      const error = await adapter.send([event]).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).code).toBe('CONFIGURATION');
      expect((error as ConfigurationError).message).toBe('HTTP 400: Bad Request');
      // 4xx short-circuits the retry loop after the first attempt.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a 5xx response up to retryAttempts times, then rethrows', async () => {
      vi.useFakeTimers();
      // Silence the sanctioned monitoring console.error emitted after all retries.
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValue(errorResponse(500, 'Internal Server Error'));
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT, retryAttempts: 3 });

      const resultPromise = adapter.send([event]).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await resultPromise;

      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).message).toBe('HTTP 500: Internal Server Error');
      // Attempts 1, 2 and 3 all fire for a retryable (non-4xx) error.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('retries a rejected fetch (network error) up to retryAttempts times', async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const networkError = new Error('Network down');
      fetchMock.mockRejectedValue(networkError);
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT, retryAttempts: 2 });

      const resultPromise = adapter.send([event]).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await resultPromise;

      expect(error).toBe(networkError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrent send (Bug 3)', () => {
    const eventA: MonitoringEvent = { ...event, id: 'evt-A', source: 'form:A' };
    const eventB: MonitoringEvent = { ...event, id: 'evt-B', source: 'form:B' };

    it('does not strand a concurrent send and reflects the real (failed) outcome for both callers', async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const networkError = new Error('Network down');
      fetchMock.mockRejectedValue(networkError);
      const adapter = new RemoteAdapter({ endpoint: ENDPOINT, retryAttempts: 1 });

      // p1 starts the drain; p2 arrives concurrently while p1 is in-flight.
      const p1 = adapter.send([eventA]).then(
        () => 'resolved',
        (e: unknown) => e
      );
      const p2 = adapter.send([eventB]).then(
        () => 'resolved',
        (e: unknown) => e
      );

      await vi.runAllTimersAsync();
      const [r1, r2] = await Promise.all([p1, p2]);

      // Neither caller may get a false success.
      expect(r1).toBe(networkError);
      expect(r2).toBe(networkError);

      // Event B must actually be attempted (not silently stranded in the queue).
      const attemptedBodies = fetchMock.mock.calls.map(
        (call) => JSON.parse((call[1] as RequestInit).body as string).events
      );
      const attemptedIds = attemptedBodies.flat().map((e: MonitoringEvent) => e.id);
      expect(attemptedIds).toContain('evt-A');
      expect(attemptedIds).toContain('evt-B');

      consoleErrorSpy.mockRestore();
    });
  });
});
