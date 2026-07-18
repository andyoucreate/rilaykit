/**
 * @fileoverview Behavioral tests for the DevelopmentAdapter monitoring adapter.
 *
 * Pins the exact aggregate output the adapter computes: the average/max
 * durations and per-type breakdown of its performance summary, and the counts
 * per source of its error summary. The adapter writes to `console` directly
 * (monitoring is a sanctioned console location), so we assert through console
 * spies.
 */

import { DevelopmentAdapter, type MonitoringEvent } from '@rilaykit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function perfEvent(id: string, type: MonitoringEvent['type'], duration: number): MonitoringEvent {
  return {
    id,
    type,
    timestamp: 0,
    source: 'form:contact',
    data: {},
    severity: 'low',
    metrics: { timestamp: 0, duration },
  };
}

describe('DevelopmentAdapter', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let groupSpy: ReturnType<typeof vi.spyOn>;
  let groupEndSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes the exact average, max, and per-type durations', async () => {
    const adapter = new DevelopmentAdapter();
    // Durations 10 and 30 of the same type -> avg 20.00, max 30.00, 2 events.
    await adapter.send([
      perfEvent('1', 'component_render', 10),
      perfEvent('2', 'component_render', 30),
    ]);

    expect(groupSpy).toHaveBeenCalledWith('[Rilay Performance Summary]');
    expect(infoSpy).toHaveBeenCalledWith('Average duration: 20.00ms');
    expect(infoSpy).toHaveBeenCalledWith('Max duration: 30.00ms');
    expect(infoSpy).toHaveBeenCalledWith('component_render: 20.00ms avg (2 events)');
    expect(groupEndSpy).toHaveBeenCalled();
  });

  it('breaks the per-type average down across distinct event types', async () => {
    const adapter = new DevelopmentAdapter();
    // form_validation: (40 + 60) / 2 = 50.00 avg (2 events)
    // workflow_navigation: 100 / 1 = 100.00 avg (1 event)
    await adapter.send([
      perfEvent('1', 'form_validation', 40),
      perfEvent('2', 'form_validation', 60),
      perfEvent('3', 'workflow_navigation', 100),
    ]);

    expect(infoSpy).toHaveBeenCalledWith('Average duration: 66.67ms');
    expect(infoSpy).toHaveBeenCalledWith('Max duration: 100.00ms');
    expect(infoSpy).toHaveBeenCalledWith('form_validation: 50.00ms avg (2 events)');
    expect(infoSpy).toHaveBeenCalledWith('workflow_navigation: 100.00ms avg (1 events)');
  });

  it('does not emit a performance summary when no event carries metrics', async () => {
    const adapter = new DevelopmentAdapter();
    await adapter.send([
      {
        id: '1',
        type: 'error',
        timestamp: 0,
        source: 'form:contact',
        data: {},
        severity: 'high',
      },
    ]);

    expect(groupSpy).not.toHaveBeenCalledWith('[Rilay Performance Summary]');
  });

  it('computes the exact error counts grouped by source', async () => {
    const adapter = new DevelopmentAdapter();
    const errorFrom = (id: string, source: string): MonitoringEvent => ({
      id,
      type: 'error',
      timestamp: 0,
      source,
      data: {},
      severity: 'high',
    });

    // 3 errors total: 2 from "validation", 1 from "navigation".
    await adapter.send([
      errorFrom('1', 'validation'),
      errorFrom('2', 'validation'),
      errorFrom('3', 'navigation'),
    ]);

    expect(groupSpy).toHaveBeenCalledWith('[Rilay Error Summary]');
    expect(errorSpy).toHaveBeenCalledWith('3 errors detected');
    expect(errorSpy).toHaveBeenCalledWith('validation: 2 errors');
    expect(errorSpy).toHaveBeenCalledWith('navigation: 1 errors');
  });
});
