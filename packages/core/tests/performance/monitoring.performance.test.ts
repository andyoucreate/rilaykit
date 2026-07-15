import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RilayMonitor, destroyGlobalMonitoring } from '../../src/monitoring';
import { ConsoleAdapter, LocalStorageAdapter } from '../../src/monitoring/adapters';
import type { MonitoringConfig, MonitoringEvent, PerformanceMetrics } from '../../src/types';

describe('Monitoring Performance Tests', () => {
  let monitor: RilayMonitor;
  let consoleAdapter: ConsoleAdapter;
  let localStorageAdapter: LocalStorageAdapter;

  beforeEach(() => {
    // Clear any existing global monitor
    destroyGlobalMonitoring();

    consoleAdapter = new ConsoleAdapter('error'); // Only log errors to reduce noise
    localStorageAdapter = new LocalStorageAdapter();

    const config: MonitoringConfig = {
      enabled: true,
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableMemoryTracking: true,
      bufferSize: 1000,
      flushInterval: 0, // Manual flush for testing
      sampleRate: 1.0,
      performanceThresholds: {
        componentRenderTime: 50,
        formValidationTime: 100,
        workflowNavigationTime: 200,
        memoryUsage: 10 * 1024 * 1024, // 10MB
        reRenderCount: 10,
      },
    };

    monitor = new RilayMonitor(config);
    monitor.addAdapter(consoleAdapter);
    monitor.addAdapter(localStorageAdapter);
  });

  afterEach(async () => {
    await monitor.destroy();
    localStorageAdapter.clearStoredEvents();
    await destroyGlobalMonitoring();
  });

  describe('Event Tracking at Scale', () => {
    it('should track 10k high-frequency events and retain the most recent ones', async () => {
      const eventCount = 10000;

      // Generate many events quickly
      for (let i = 0; i < eventCount; i++) {
        monitor.track(
          'component_render',
          `component_${i % 100}`, // Simulate 100 different components
          {
            componentId: `component_${i % 100}`,
            renderCount: Math.floor(i / 100) + 1,
          },
          {
            timestamp: Date.now(),
            duration: i % 50, // deterministic, always under the 50ms threshold
            renderCount: Math.floor(i / 100) + 1,
          },
          'low'
        );
      }

      await monitor.flush();

      // bufferSize is 1000, so the buffer auto-flushed 10 times; the adapter
      // caps retention at its own 1000-event window of the MOST RECENT events.
      const storedEvents = localStorageAdapter.getStoredEvents();
      expect(storedEvents.length).toBe(1000);

      // The retained window is exactly events 9000..9999, in order.
      storedEvents.forEach((event, index) => {
        const originalIndex = eventCount - 1000 + index;
        expect(event.type).toBe('component_render');
        expect(event.source).toBe(`component_${originalIndex % 100}`);
        expect(event.data.renderCount).toBe(Math.floor(originalIndex / 100) + 1);
      });
    });

    it('should batch and flush 5k events into the adapter', async () => {
      const eventCount = 5000;

      // Track events
      for (let i = 0; i < eventCount; i++) {
        monitor.track(
          'form_validation',
          'test_form',
          { fieldCount: 10, validationErrors: i % 3 },
          {
            timestamp: Date.now(),
            duration: i % 20, // deterministic, always under the 100ms threshold
          }
        );
      }

      await monitor.flush();

      // The adapter retains its 1000-event cap: the LAST 1000 of the 5000 events.
      const storedEvents = localStorageAdapter.getStoredEvents();
      expect(storedEvents.length).toBe(1000);
      expect(storedEvents.length).toBeLessThanOrEqual(eventCount);

      storedEvents.forEach((event, index) => {
        const originalIndex = eventCount - 1000 + index;
        expect(event.type).toBe('form_validation');
        expect(event.source).toBe('test_form');
        expect(event.data.fieldCount).toBe(10);
        expect(event.data.validationErrors).toBe(originalIndex % 3);
      });
    });
  });

  describe('Performance Profiler Tests', () => {
    it('should accurately measure performance metrics', async () => {
      const profiler = monitor.getProfiler();
      const testLabel = 'performance_test';

      profiler.start(testLabel);

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));

      const metrics = profiler.end(testLabel);

      // The profiler must report AT LEAST the elapsed work; no upper bound is
      // asserted because that would only measure how fast the machine is.
      expect(metrics).toBeDefined();
      expect(metrics!.duration).toBeGreaterThan(45); // Allow some variance
      expect(metrics!.timestamp).toBeGreaterThan(0);

      // A label can only be ended once: the entry is consumed.
      expect(profiler.end(testLabel)).toBeNull();
    });

    it('should keep 100 interleaved measurements isolated and out-of-order safe', () => {
      const profiler = monitor.getProfiler();
      const concurrentMeasurements = 100;

      // Start multiple measurements
      for (let i = 0; i < concurrentMeasurements; i++) {
        profiler.start(`test_${i}`);
      }

      // End measurements in different order
      const results: (PerformanceMetrics | null)[] = [];
      for (let i = concurrentMeasurements - 1; i >= 0; i--) {
        results.push(profiler.end(`test_${i}`));
      }

      // All measurements resolve, each exactly once, independent of end order
      expect(results.length).toBe(concurrentMeasurements);
      expect(results.every((result) => result !== null)).toBe(true);
      for (const result of results) {
        expect(result!.duration).toBeGreaterThanOrEqual(0);
        expect(result!.timestamp).toBeGreaterThan(0);
      }

      // Every label was consumed: re-ending yields null for all 100
      for (let i = 0; i < concurrentMeasurements; i++) {
        expect(profiler.end(`test_${i}`)).toBeNull();
      }
    });
  });

  describe('Retention Bounds', () => {
    it('should retain a bounded window across 10k continuously-tracked events', async () => {
      const eventCount = 1000;
      const cycles = 10;

      // Generate events continuously
      for (let cycle = 0; cycle < cycles; cycle++) {
        for (let i = 0; i < eventCount; i++) {
          monitor.track('component_update', `field_${i % 50}`, {
            fieldId: `field_${i % 50}`,
            changeCount: cycle * eventCount + i,
          });
        }

        // Flush periodically
        await monitor.flush();

        // Retention never exceeds the adapter's 1000-event cap, no matter how
        // many cycles are pushed through it — the buffer does not grow.
        expect(localStorageAdapter.getStoredEvents().length).toBe(1000);
      }

      // After 10k events the adapter holds exactly the last 1000, and the
      // monitor's own buffer was fully drained.
      const storedEvents = localStorageAdapter.getStoredEvents();
      expect(storedEvents.length).toBe(1000);

      const totalTracked = cycles * eventCount;
      storedEvents.forEach((event, index) => {
        const originalIndex = totalTracked - 1000 + index;
        expect(event.type).toBe('component_update');
        expect(event.data.changeCount).toBe(originalIndex);
        expect(event.data.fieldId).toBe(`field_${(originalIndex % eventCount) % 50}`);
      });
    });

    it('should efficiently manage event buffer size', () => {
      const config: MonitoringConfig = {
        enabled: true,
        bufferSize: 100,
        flushInterval: 0,
      };

      const smallBufferMonitor = new RilayMonitor(config);
      const adapter = new LocalStorageAdapter();
      smallBufferMonitor.addAdapter(adapter);

      // Track more events than buffer size
      for (let i = 0; i < 250; i++) {
        smallBufferMonitor.track('component_render', 'test_component', { renderCount: i });
      }

      // Should have auto-flushed when buffer was full
      const storedEvents = adapter.getStoredEvents();
      expect(storedEvents.length).toBeGreaterThanOrEqual(200); // Should have flushed at least twice

      smallBufferMonitor.destroy();
    });
  });

  describe('Performance Threshold Detection', () => {
    it('should detect performance warnings efficiently', () => {
      const warnings: MonitoringEvent[] = [];

      const config: MonitoringConfig = {
        enabled: true,
        performanceThresholds: {
          componentRenderTime: 10, // Very low threshold for testing
          formValidationTime: 20,
        },
        onEvent: (event) => {
          if (event.type === 'performance_warning') {
            warnings.push(event);
          }
        },
      };

      const thresholdMonitor = new RilayMonitor(config);

      // Track events that should trigger warnings
      thresholdMonitor.track(
        'component_render',
        'slow_component',
        { componentId: 'slow_component' },
        {
          timestamp: Date.now(),
          duration: 25, // Exceeds threshold
        }
      );

      thresholdMonitor.track(
        'form_validation',
        'slow_form',
        { formId: 'slow_form' },
        {
          timestamp: Date.now(),
          duration: 30, // Exceeds threshold
        }
      );

      // Should have generated performance warnings
      expect(warnings.length).toBe(2);
      expect(warnings[0].type).toBe('performance_warning');
      expect(warnings[1].type).toBe('performance_warning');

      thresholdMonitor.destroy();
    });
  });

  describe('Adapter Failure Isolation', () => {
    it('should isolate a failing adapter so healthy adapters still receive every event', async () => {
      const failingAdapter = {
        name: 'failing_adapter',
        send: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      monitor.addAdapter(failingAdapter);

      // Track events that will fail to send
      for (let i = 0; i < 100; i++) {
        monitor.track('component_render', 'test_component', { renderCount: i });
      }

      await expect(monitor.flush()).resolves.toBeUndefined();

      // The failing adapter was offered the whole batch, exactly once
      expect(failingAdapter.send).toHaveBeenCalledTimes(1);
      expect(failingAdapter.send.mock.calls[0][0]).toHaveLength(100);

      // ...and its rejection did not stop the healthy adapter from storing them
      const storedEvents = localStorageAdapter.getStoredEvents();
      expect(storedEvents.length).toBe(100);
      storedEvents.forEach((event, index) => {
        expect(event.type).toBe('component_render');
        expect(event.source).toBe('test_component');
        expect(event.data.renderCount).toBe(index);
      });
    });
  });

  describe('Sample Rate Filtering', () => {
    it('keeps exactly the events the sampler admits and drops the rest', () => {
      const config: MonitoringConfig = {
        enabled: true,
        sampleRate: 0.1, // Only track 10% of events
      };

      // Construct BEFORE stubbing: the session id also consumes Math.random(),
      // which would otherwise offset the deterministic sampler sequence below.
      const sampledMonitor = new RilayMonitor(config);
      const adapter = new LocalStorageAdapter();
      sampledMonitor.addAdapter(adapter);

      // The sampler keeps an event when `Math.random() <= sampleRate`. Real
      // randomness made this assertion probabilistic (~5σ) and it flaked, so we
      // drive it deterministically: exactly every 10th event is admitted.
      let sample = 0;
      const randomSpy = vi
        .spyOn(Math, 'random')
        .mockImplementation(() => (sample++ % 10 === 0 ? 0.05 : 0.5));

      const eventCount = 1000;
      for (let i = 0; i < eventCount; i++) {
        sampledMonitor.track('component_update', 'test_component', { updateCount: i });
      }

      sampledMonitor.flush();
      const storedEvents = adapter.getStoredEvents();
      randomSpy.mockRestore();

      // Exactly the admitted events survive — identity, not just a count.
      expect(storedEvents.map((event) => event.data.updateCount)).toEqual(
        Array.from({ length: 100 }, (_, k) => k * 10)
      );
      for (const event of storedEvents) {
        expect(event.type).toBe('component_update');
        expect(event.source).toBe('test_component');
      }

      sampledMonitor.destroy();
    });
  });
});
