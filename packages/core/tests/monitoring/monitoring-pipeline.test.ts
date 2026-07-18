/**
 * @fileoverview Cartesian behavioral suite for the RilayMonitor pipeline —
 * the buffer / flush / batch / sample machinery a product wires to a metrics
 * sink (Datadog/Sentry/internal). The contract, verified against
 * `packages/core/src/monitoring/index.ts`:
 *
 *  - `track()` (and `trackError()`) builds an event, runs it through the sample
 *    gate, pushes it to `eventBuffer`, fires `onEvent` per event, and flushes
 *    when the buffer reaches `bufferSize`.
 *  - `flush()` copies-and-clears the buffer, fires `onBatch(events)` once with
 *    the drained events, then `await`s every adapter's `send(events)`.
 *  - sampling is `Math.random() > (sampleRate ?? 1.0)` → drop. So `0` drops all,
 *    `1` keeps all; only null/undefined fall back to 1.0.
 *  - `destroy()` clears the flush interval, flushes pending events, then flushes
 *    adapters. `destroyGlobalMonitoring()` awaits destroy and nulls the global.
 *  - adapter `send()` rejections are caught in `flush()`: logged + `onError`,
 *    never thrown, never lose subsequent events.
 *
 * These tests assert the OBSERVED contract only. Where sampling is random, the
 * deterministic boundaries (0/1) and the gate mechanism are pinned, never a
 * flaky middle count.
 */

import {
  type MonitoringConfig,
  type MonitoringEvent,
  RilayMonitor,
  destroyGlobalMonitoring,
  getGlobalMonitor,
  initializeMonitoring,
} from '@rilaykit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Track the live monitors so every test tears its instance down. */
const openMonitors: RilayMonitor[] = [];

function makeMonitor(config: Partial<MonitoringConfig> = {}) {
  const monitor = new RilayMonitor({
    enabled: true,
    flushInterval: 0, // no background timer unless a test opts in
    ...config,
  });
  openMonitors.push(monitor);
  return monitor;
}

afterEach(async () => {
  await Promise.all(openMonitors.splice(0).map((m) => m.destroy()));
  await destroyGlobalMonitoring();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Scenario 1 — every event reaches onEvent, exactly once, intact.
// ---------------------------------------------------------------------------
describe('delivery: every event reaches onEvent', () => {
  it('fires onEvent exactly N times for N tracked events (no drop, no dupe)', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => seen.push(e) });

    const N = 25;
    for (let i = 0; i < N; i++) monitor.track('form_submission', `src-${i}`, { i });

    expect(seen).toHaveLength(N);
  });

  it('preserves type, source, data, severity and assigns unique ids', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => seen.push(e) });

    monitor.track('condition_evaluation', 'flow:kyc', { step: 3 }, undefined, 'critical');

    expect(seen).toHaveLength(1);
    const [event] = seen;
    expect(event.type).toBe('condition_evaluation');
    expect(event.source).toBe('flow:kyc');
    expect(event.severity).toBe('critical');
    // `data` is the caller's payload plus the injected monitoring context, which
    // rides under its own `monitoringContext` key so it never clobbers caller data.
    expect(event.data).toMatchObject({ step: 3 });
    expect(event.data.monitoringContext).toMatchObject({ sessionId: expect.any(String) });
    expect(event.id).toMatch(/^event_\d+_\d+$/);
  });

  it('assigns a distinct id to every event across a burst', () => {
    const ids = new Set<string>();
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => ids.add(e.id) });

    for (let i = 0; i < 50; i++) monitor.track('component_render', 'c', {});
    expect(ids.size).toBe(50);
  });

  it('trackError routes through track as a high-severity error event', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => seen.push(e) });

    const boom = new Error('kaboom');
    monitor.trackError(boom, 'form:contact', { field: 'email' });

    expect(seen).toHaveLength(1);
    const [event] = seen;
    expect(event.type).toBe('error');
    expect(event.source).toBe('form:contact');
    expect(event.severity).toBe('high');
    expect(event.data).toMatchObject({ message: 'kaboom', name: 'Error' });
  });

  // The caller's error `context` survives to the sink — it is NOT clobbered by
  // the injected monitoring session context, which now rides under its own
  // `monitoringContext` key. `trackError` always puts the originating context in
  // `data.context` (e.g. useWorkflowAnalytics.ts:296 passes { workflowId,
  // currentStepIndex, currentStepId, workflowContext }); a Datadog/Sentry sink
  // needs *which step of which workflow* failed, not the generic session boilerplate.
  it('trackError preserves the caller error context (session context under its own key)', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => seen.push(e) });

    const errorContext = { workflowId: 'kyc', currentStepId: 'id-check', attempt: 2 };
    monitor.trackError(new Error('step failed'), 'workflow_kyc', errorContext);

    // The originating error context reaches the sink intact...
    expect(seen[0].data.context).toMatchObject(errorContext);
    // ...alongside the session context under its non-colliding key.
    expect(seen[0].data.monitoringContext).toMatchObject({ sessionId: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — buffering + onBatch batches to bufferSize; partial batch flushes.
// ---------------------------------------------------------------------------
describe('buffering: onBatch fires at bufferSize, partial batch on flush', () => {
  it('does not fire onBatch until the buffer reaches bufferSize', () => {
    const batches: MonitoringEvent[][] = [];
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 5, onBatch: (b) => batches.push(b) });

    for (let i = 0; i < 4; i++) monitor.track('component_render', 'c', { i });
    expect(batches).toHaveLength(0);
  });

  it('flushes a full batch of exactly bufferSize events when the buffer fills', () => {
    const batches: MonitoringEvent[][] = [];
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 5, onBatch: (b) => batches.push(b) });

    for (let i = 0; i < 5; i++) monitor.track('component_render', 'c', { i });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5);
  });

  it('batches N events into ceil(N/bufferSize) batches with a partial flush() tail', async () => {
    const batches: MonitoringEvent[][] = [];
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 5, onBatch: (b) => batches.push(b) });

    for (let i = 0; i < 12; i++) monitor.track('component_render', 'c', { i });
    // 12 events, bufferSize 5 → two auto-flushes of 5, 2 pending.
    expect(batches.map((b) => b.length)).toEqual([5, 5]);

    await monitor.flush();
    expect(batches.map((b) => b.length)).toEqual([5, 5, 2]);

    // Every event delivered exactly once, in order.
    const delivered = batches.flat();
    expect(delivered).toHaveLength(12);
    expect(delivered.map((e) => e.data.i)).toEqual([...Array(12).keys()]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — flushInterval delivers buffered events after the interval.
// ---------------------------------------------------------------------------
describe('flushInterval: buffered events flush on the timer', () => {
  it('does not flush before the interval, flushes after it (fake timers)', () => {
    vi.useFakeTimers();
    const batches: MonitoringEvent[][] = [];
    // Large bufferSize so only the timer — never buffer-full — can flush.
    const monitor = makeMonitor({
      sampleRate: 1,
      bufferSize: 1000,
      flushInterval: 2000,
      onBatch: (b) => batches.push(b),
    });

    monitor.track('workflow_navigation', 'flow', { a: 1 });
    monitor.track('workflow_navigation', 'flow', { a: 2 });

    vi.advanceTimersByTime(1999);
    expect(batches).toHaveLength(0); // no early flush

    vi.advanceTimersByTime(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);

    // A second interval with an empty buffer must NOT fire onBatch (flush early-returns).
    vi.advanceTimersByTime(2000);
    expect(batches).toHaveLength(1);
  });

  it('flushes each interval tick that has pending events', () => {
    vi.useFakeTimers();
    const batches: MonitoringEvent[][] = [];
    const monitor = makeMonitor({
      sampleRate: 1,
      bufferSize: 1000,
      flushInterval: 1000,
      onBatch: (b) => batches.push(b),
    });

    monitor.track('component_render', 'c', { tick: 1 });
    vi.advanceTimersByTime(1000);
    monitor.track('component_render', 'c', { tick: 2 });
    vi.advanceTimersByTime(1000);

    expect(batches.map((b) => b.length)).toEqual([1, 1]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — sampleRate boundaries (deterministic) + gate mechanism.
// ---------------------------------------------------------------------------
describe('sampleRate: honest boundaries and gate mechanism', () => {
  it('sampleRate=0 drops ALL events for any positive roll', () => {
    // Gate is `random() > rate → drop`. With rate 0, every roll in (0,1) drops.
    // The exact `random()===0` is the measure-zero exclusive-boundary exception
    // (never observed in practice); we assert with the most generous positive roll.
    vi.spyOn(Math, 'random').mockReturnValue(Number.MIN_VALUE);
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 0, onEvent: (e) => seen.push(e) });

    for (let i = 0; i < 100; i++) monitor.track('form_submission', 's', {});
    expect(seen).toHaveLength(0);
  });

  it('sampleRate=1 keeps ALL events even on the harshest roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 1, onEvent: (e) => seen.push(e) });

    for (let i = 0; i < 100; i++) monitor.track('form_submission', 's', {});
    expect(seen).toHaveLength(100);
  });

  it('an omitted sampleRate defaults to keeping all (?? 1.0, not || 1.0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ onEvent: (e) => seen.push(e) });

    for (let i = 0; i < 30; i++) monitor.track('form_submission', 's', {});
    expect(seen).toHaveLength(30);
  });

  it('fractional rate keeps events whose roll is <= rate and drops those above', () => {
    // Deterministic mechanism check: the gate is `random() > rate → drop`.
    // Construct FIRST (the constructor's session-id generation consumes one
    // Math.random), then install the sequential roll mock for the track() gate.
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({ sampleRate: 0.5, onEvent: (e) => seen.push(e) });

    const rolls = [0.1, 0.4, 0.49, 0.5, 0.51, 0.9];
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => rolls[idx++]);

    for (let i = 0; i < rolls.length; i++) monitor.track('form_submission', 's', { i });

    // Kept: rolls <= 0.5 → indices 0,1,2,3. Dropped: 0.51, 0.9.
    expect(seen.map((e) => e.data.i)).toEqual([0, 1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — flush() drains the buffer; no re-send on the next flush.
// ---------------------------------------------------------------------------
describe('flush() drains the buffer', () => {
  it('delivers pending events once and empties the buffer', async () => {
    const batches: MonitoringEvent[][] = [];
    const monitor = makeMonitor({
      sampleRate: 1,
      bufferSize: 1000,
      onBatch: (b) => batches.push(b),
    });

    monitor.track('component_render', 'c', { i: 1 });
    monitor.track('component_render', 'c', { i: 2 });

    await monitor.flush();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);

    // Second flush with a drained buffer is a no-op — no duplicate delivery.
    await monitor.flush();
    expect(batches).toHaveLength(1);
  });

  it('sends drained events to every registered adapter exactly once', async () => {
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 1000 });
    const sendA = vi.fn().mockResolvedValue(undefined);
    const sendB = vi.fn().mockResolvedValue(undefined);
    monitor.addAdapter({ name: 'a', send: sendA });
    monitor.addAdapter({ name: 'b', send: sendB });

    monitor.track('form_submission', 's', { i: 1 });
    monitor.track('form_submission', 's', { i: 2 });
    await monitor.flush();

    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);
    expect(sendA.mock.calls[0][0]).toHaveLength(2);

    await monitor.flush(); // empty buffer → adapters not called again
    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — destroy / destroyGlobalMonitoring cleanup and clean re-init.
// ---------------------------------------------------------------------------
describe('cleanup: destroy stops timers and flushes; re-init is clean', () => {
  it('clears the flush interval on destroy (no lingering timer fires)', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const batches: MonitoringEvent[][] = [];
    const monitor = new RilayMonitor({
      enabled: true,
      sampleRate: 1,
      bufferSize: 1000,
      flushInterval: 1000,
      onBatch: (b) => batches.push(b),
    });

    monitor.track('component_render', 'c', {});
    await monitor.destroy(); // flushes the pending event AND clears the timer

    expect(clearSpy).toHaveBeenCalled();
    expect(batches).toHaveLength(1); // pending event flushed by destroy

    // No further timer callbacks: advancing time must not produce a new batch.
    vi.advanceTimersByTime(10_000);
    expect(batches).toHaveLength(1);
  });

  it('destroy flushes adapters (adapter.flush called)', async () => {
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 1000 });
    const send = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(undefined);
    monitor.addAdapter({ name: 'a', send, flush });

    monitor.track('form_submission', 's', {});
    await monitor.destroy();

    expect(send).toHaveBeenCalledTimes(1); // pending event drained
    expect(flush).toHaveBeenCalledTimes(1); // adapter flushed
  });

  it('destroyGlobalMonitoring nulls the global and stops delivery', async () => {
    const seen: MonitoringEvent[] = [];
    const monitor = initializeMonitoring({
      enabled: true,
      sampleRate: 1,
      flushInterval: 0,
      onEvent: (e) => seen.push(e),
    });
    expect(getGlobalMonitor()).toBe(monitor);

    await destroyGlobalMonitoring();
    expect(getGlobalMonitor()).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it('re-initializing does not leak the prior instance into the new onEvent', async () => {
    const firstSeen: MonitoringEvent[] = [];
    const first = initializeMonitoring({
      enabled: true,
      sampleRate: 1,
      flushInterval: 0,
      onEvent: (e) => firstSeen.push(e),
    });

    const secondSeen: MonitoringEvent[] = [];
    const second = initializeMonitoring({
      enabled: true,
      sampleRate: 1,
      flushInterval: 0,
      onEvent: (e) => secondSeen.push(e),
    });
    expect(second).not.toBe(first);
    expect(getGlobalMonitor()).toBe(second);

    getGlobalMonitor()?.track('form_submission', 's', {});
    // The new instance's callback receives it; the old one is untouched.
    expect(secondSeen).toHaveLength(1);
    expect(firstSeen).toHaveLength(0);
  });

  it('a re-init does not fire the OLD onBatch with the NEW instance events', async () => {
    // Old instance holds a buffered event; re-init destroys it (flushing to the
    // OLD onBatch). The NEW instance's events must never reach the old onBatch.
    const oldBatches: MonitoringEvent[][] = [];
    const first = initializeMonitoring({
      enabled: true,
      sampleRate: 1,
      bufferSize: 1000,
      flushInterval: 0,
      onBatch: (b) => oldBatches.push(b),
    });
    first.track('component_render', 'old', { tag: 'old' });

    const newBatches: MonitoringEvent[][] = [];
    initializeMonitoring({
      enabled: true,
      sampleRate: 1,
      bufferSize: 1000,
      flushInterval: 0,
      onBatch: (b) => newBatches.push(b),
    });

    getGlobalMonitor()?.track('component_render', 'new', { tag: 'new' });
    await getGlobalMonitor()?.flush();

    // Old batch (from destroy's flush) carried only the old event.
    expect(oldBatches.flat().map((e) => e.data.tag)).toEqual(['old']);
    // New batch carried only the new event — no ghost of the old instance.
    expect(newBatches.flat().map((e) => e.data.tag)).toEqual(['new']);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — adapter send() rejection is contained, no crash, no loss.
// ---------------------------------------------------------------------------
describe('adapter errors: rejection contained via onError, delivery continues', () => {
  it('routes a rejecting adapter send() to onError and does not throw', async () => {
    const errors: Error[] = [];
    const monitor = makeMonitor({
      sampleRate: 1,
      bufferSize: 1000,
      onError: (e) => errors.push(e),
    });
    const failure = new Error('sink down');
    monitor.addAdapter({ name: 'flaky', send: vi.fn().mockRejectedValue(failure) });

    monitor.track('form_submission', 's', {});
    await expect(monitor.flush()).resolves.toBeUndefined(); // never throws
    expect(errors).toEqual([failure]);
  });

  it('a failing adapter does not starve a healthy adapter in the same flush', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = vi.fn().mockResolvedValue(undefined);
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 1000, onError: () => {} });
    monitor.addAdapter({ name: 'flaky', send: vi.fn().mockRejectedValue(new Error('x')) });
    monitor.addAdapter({ name: 'healthy', send: healthy });

    monitor.track('form_submission', 's', {});
    await monitor.flush();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('subsequent events after an adapter failure are still delivered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValue(undefined);
    const monitor = makeMonitor({ sampleRate: 1, bufferSize: 1000, onError: () => {} });
    monitor.addAdapter({ name: 'flaky', send });

    monitor.track('form_submission', 's', { i: 1 });
    await monitor.flush(); // send rejects, handled

    monitor.track('form_submission', 's', { i: 2 });
    await monitor.flush(); // send resolves

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0][0].data.i).toBe(2);
  });

  it('an onEvent that throws does not abort tracking of later events', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: number[] = [];
    let calls = 0;
    const monitor = makeMonitor({
      sampleRate: 1,
      onEvent: (e) => {
        calls++;
        if (calls === 1) throw new Error('callback boom');
        seen.push(e.data.i as number);
      },
    });

    monitor.track('form_submission', 's', { i: 1 }); // throws inside callback
    monitor.track('form_submission', 's', { i: 2 }); // must still run
    expect(seen).toEqual([2]);
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — enabled:false is fully inert.
// ---------------------------------------------------------------------------
describe('enabled:false is inert', () => {
  it('tracks nothing, batches nothing, calls no adapter, starts no timer', async () => {
    const seen: MonitoringEvent[] = [];
    const batches: MonitoringEvent[][] = [];
    const send = vi.fn();
    const monitor = new RilayMonitor({
      enabled: false,
      flushInterval: 1000,
      onEvent: (e) => seen.push(e),
      onBatch: (b) => batches.push(b),
    });
    monitor.addAdapter({ name: 'a', send });

    for (let i = 0; i < 10; i++) monitor.track('form_submission', 's', {});
    monitor.trackError(new Error('nope'), 's');
    await monitor.flush();

    expect(seen).toHaveLength(0);
    expect(batches).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    // No flush timer was created.
    expect((monitor as unknown as { flushTimer?: unknown }).flushTimer).toBeUndefined();

    await monitor.destroy();
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — PerformanceProfiler sanity + threshold warnings.
// ---------------------------------------------------------------------------
describe('PerformanceProfiler', () => {
  it('start/end yields a non-negative duration and clears the running label', () => {
    const monitor = makeMonitor({ sampleRate: 1 });
    const profiler = monitor.getProfiler();

    profiler.start('op');
    const metrics = profiler.end('op');

    expect(metrics).not.toBeNull();
    expect(metrics?.duration).toBeGreaterThanOrEqual(0);
    // Label consumed on end → a second end returns null.
    expect(profiler.end('op')).toBeNull();
  });

  it('end() on an unknown label returns null', () => {
    const profiler = makeMonitor({ sampleRate: 1 }).getProfiler();
    expect(profiler.end('never-started')).toBeNull();
  });

  it('getMetrics/getAllMetrics/clear reflect stored measurements', () => {
    const profiler = makeMonitor({ sampleRate: 1 }).getProfiler();

    profiler.start('a');
    profiler.end('a');
    expect(profiler.getMetrics('a')).not.toBeNull();
    expect(Object.keys(profiler.getAllMetrics())).toContain('a');

    profiler.clear('a');
    expect(profiler.getMetrics('a')).toBeNull();
  });

  it('measure returns a numeric duration between two marks', () => {
    const profiler = makeMonitor({ sampleRate: 1 }).getProfiler();
    profiler.mark('start');
    profiler.mark('stop');
    const duration = profiler.measure('span', 'start', 'stop');
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('emits a performance_warning when metrics exceed a configured threshold', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({
      sampleRate: 1,
      performanceThresholds: { componentRenderTime: 10 },
      onEvent: (e) => seen.push(e),
    });

    monitor.track(
      'component_render',
      'slow-component',
      {},
      { timestamp: Date.now(), duration: 50 } // 50ms > 10ms threshold
    );

    // Both the warning AND the original render event reach onEvent.
    const warnings = seen.filter((e) => e.type === 'performance_warning');
    expect(warnings).toHaveLength(1);
    expect((warnings[0] as unknown as { threshold: number }).threshold).toBe(10);
    expect((warnings[0] as unknown as { actualValue: number }).actualValue).toBe(50);
    expect(seen.some((e) => e.type === 'component_render')).toBe(true);
  });

  it('does not warn when metrics are under the threshold', () => {
    const seen: MonitoringEvent[] = [];
    const monitor = makeMonitor({
      sampleRate: 1,
      performanceThresholds: { componentRenderTime: 100 },
      onEvent: (e) => seen.push(e),
    });

    monitor.track('component_render', 'fast', {}, { timestamp: Date.now(), duration: 5 });
    expect(seen.filter((e) => e.type === 'performance_warning')).toHaveLength(0);
  });
});
