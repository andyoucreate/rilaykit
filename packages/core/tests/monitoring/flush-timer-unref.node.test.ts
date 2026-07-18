// @vitest-environment node
/**
 * @fileoverview Server-side flush timer behavior of RilayMonitor.
 *
 * The periodic flush interval must be unref'd on Node: otherwise any
 * server-side `initializeMonitoring({ enabled: true })` (or standalone
 * RilayMonitor with a flush interval) keeps the event loop alive and
 * prevents the process from exiting.
 */

import {
  RilayMonitor,
  destroyGlobalMonitoring,
  getGlobalMonitor,
  initializeMonitoring,
} from '@rilaykit/core';
import { afterEach, describe, expect, it } from 'vitest';

function getFlushTimer(monitor: RilayMonitor): NodeJS.Timeout | undefined {
  return (monitor as unknown as { flushTimer?: NodeJS.Timeout }).flushTimer;
}

describe('RilayMonitor flush timer (Node)', () => {
  const monitors: RilayMonitor[] = [];

  afterEach(async () => {
    await Promise.all(monitors.splice(0).map(async (monitor) => monitor.destroy()));
    await destroyGlobalMonitoring();
  });

  it('unrefs the periodic flush interval so it never keeps the event loop alive', () => {
    const monitor = new RilayMonitor({ enabled: true, flushInterval: 5000 });
    monitors.push(monitor);

    const flushTimer = getFlushTimer(monitor);
    expect(flushTimer).toBeDefined();
    expect(flushTimer?.hasRef()).toBe(false);
  });

  it('unrefs the flush timer created through initializeMonitoring with defaults', () => {
    initializeMonitoring({ enabled: true });

    const monitor = getGlobalMonitor();
    expect(monitor).not.toBeNull();

    const flushTimer = monitor ? getFlushTimer(monitor) : undefined;
    expect(flushTimer).toBeDefined();
    expect(flushTimer?.hasRef()).toBe(false);
  });

  it('creates no flush timer when monitoring is disabled', () => {
    const monitor = new RilayMonitor({ enabled: false });
    monitors.push(monitor);

    expect(getFlushTimer(monitor)).toBeUndefined();
  });
});
