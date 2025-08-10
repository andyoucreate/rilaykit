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

  describe('Event Tracking Performance', () => {
    it('should handle high-frequency event tracking efficiently', async () => {
      const eventCount = 10000;
      const startTime = performance.now();

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
            duration: Math.random() * 50,
            renderCount: Math.floor(i / 100) + 1,
          },
          'low'
        );
      }

      const trackingTime = performance.now() - startTime;

      // Should handle 10k events in less than 1 second
      expect(trackingTime).toBeLessThan(1000);

      // Performance should be linear (less than 0.1ms per event)
      expect(trackingTime / eventCount).toBeLessThan(0.1);
    });

    it('should efficiently batch and flush events', async () => {
      const eventCount = 5000;

      // Track events
      for (let i = 0; i < eventCount; i++) {
        monitor.track(
          'form_validation',
          'test_form',
          { fieldCount: 10, validationErrors: i % 3 },
          {
            timestamp: Date.now(),
            duration: Math.random() * 20,
          }
        );
      }

      const flushStartTime = performance.now();
      await monitor.flush();
      const flushTime = performance.now() - flushStartTime;

      // Flushing should be efficient (less than 500ms for 5k events)
      expect(flushTime).toBeLessThan(500);

      // Check that events were stored (LocalStorageAdapter has max limit)
      const storedEvents = localStorageAdapter.getStoredEvents();
      expect(storedEvents.length).toBeGreaterThan(0);
      expect(storedEvents.length).toBeLessThanOrEqual(eventCount);
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

      expect(metrics).toBeDefined();
      expect(metrics!.duration).toBeGreaterThan(45); // Allow some variance
      expect(metrics!.duration).toBeLessThan(100);
      expect(metrics!.timestamp).toBeGreaterThan(0);
    });

    it('should handle concurrent performance measurements', () => {
      const profiler = monitor.getProfiler();
      const concurrentMeasurements = 100;

      const startTime = performance.now();

      // Start multiple measurements
      for (let i = 0; i < concurrentMeasurements; i++) {
        profiler.start(`test_${i}`);
      }

      // End measurements in different order
      const results: (PerformanceMetrics | null)[] = [];
      for (let i = concurrentMeasurements - 1; i >= 0; i--) {
        results.push(profiler.end(`test_${i}`));
      }

      const totalTime = performance.now() - startTime;

      // Should handle concurrent measurements efficiently
      expect(totalTime).toBeLessThan(100);

      // All measurements should succeed
      expect(results.every((result) => result !== null)).toBe(true);
      expect(results.length).toBe(concurrentMeasurements);
    });
  });

  describe('Memory Performance Tests', () => {
    it('should not cause memory leaks with continuous monitoring', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const eventCount = 1000;

      // Generate events continuously
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < eventCount; i++) {
          monitor.track('component_update', `field_${i % 50}`, {
            fieldId: `field_${i % 50}`,
            changeCount: cycle * eventCount + i,
          });
        }

        // Flush periodically
        await monitor.flush();

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (less than 5MB for 10k events)
      if (initialMemory > 0) {
        expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
      }
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

  describe('Adapter Performance Tests', () => {
    it('should handle adapter failures gracefully without performance impact', async () => {
      const failingAdapter = {
        name: 'failing_adapter',
        send: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      monitor.addAdapter(failingAdapter);

      const startTime = performance.now();

      // Track events that will fail to send
      for (let i = 0; i < 100; i++) {
        monitor.track('component_render', 'test_component', { renderCount: i });
      }

      await monitor.flush();

      const totalTime = performance.now() - startTime;

      // Should handle failures quickly without blocking
      expect(totalTime).toBeLessThan(1000);

      // Should have attempted to send to failing adapter
      expect(failingAdapter.send).toHaveBeenCalled();
    });
  });

  describe('Sample Rate Performance', () => {
    it('should efficiently apply sample rate filtering', () => {
      const config: MonitoringConfig = {
        enabled: true,
        sampleRate: 0.1, // Only track 10% of events
      };

      const sampledMonitor = new RilayMonitor(config);
      const adapter = new LocalStorageAdapter();
      sampledMonitor.addAdapter(adapter);

      const eventCount = 1000;
      const startTime = performance.now();

      // Track many events
      for (let i = 0; i < eventCount; i++) {
        sampledMonitor.track('component_update', 'test_component', { updateCount: i });
      }

      const trackingTime = performance.now() - startTime;

      sampledMonitor.flush();
      const storedEvents = adapter.getStoredEvents();

      // Should be much faster due to sampling
      expect(trackingTime).toBeLessThan(100);

      // Should have tracked approximately 10% of events (with some variance)
      expect(storedEvents.length).toBeLessThan(eventCount * 0.2);
      expect(storedEvents.length).toBeGreaterThan(eventCount * 0.05);

      sampledMonitor.destroy();
    });
  });
});
