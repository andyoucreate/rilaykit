/**
 * @fileoverview Browser-side flush timer behavior of RilayMonitor.
 *
 * Real browser timers are plain numbers with no `.unref`, so the server-side
 * unref of the flush interval must be guarded and never throw when the timer
 * handle lacks the method. Vitest's jsdom environment still hands out Node
 * Timeout objects, so the browser handle shape is reproduced by stubbing
 * `setInterval` to return a number.
 */

import { RilayMonitor } from '@rilaykit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BROWSER_TIMER_HANDLE = 42;

function getFlushTimer(monitor: RilayMonitor): unknown {
  return (monitor as unknown as { flushTimer?: unknown }).flushTimer;
}

describe('RilayMonitor flush timer (browser)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when the timer handle has no unref (browser number timers)', () => {
    vi.stubGlobal('setInterval', () => BROWSER_TIMER_HANDLE);
    vi.stubGlobal('clearInterval', () => undefined);

    let monitor: RilayMonitor | undefined;
    expect(() => {
      monitor = new RilayMonitor({ enabled: true, flushInterval: 5000 });
    }).not.toThrow();

    expect(monitor ? getFlushTimer(monitor) : undefined).toBe(BROWSER_TIMER_HANDLE);
  });
});
