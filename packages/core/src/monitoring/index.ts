import type {
  MonitoringAdapter,
  MonitoringConfig,
  MonitoringContext,
  MonitoringEvent,
  MonitoringEventType,
  PerformanceMetrics,
  PerformanceProfiler,
  PerformanceWarningEvent,
} from '../types';

// Generate unique IDs for events
let eventIdCounter = 0;
const generateEventId = (): string => `event_${Date.now()}_${++eventIdCounter}`;

// Generate session ID
const generateSessionId = (): string =>
  `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Core monitoring system for Rilay
 * Tracks performance metrics, events, and errors across forms and workflows
 */
export class RilayMonitor {
  private config: MonitoringConfig;
  private context: MonitoringContext;
  private adapters: MonitoringAdapter[] = [];
  private eventBuffer: MonitoringEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private profiler: PerformanceProfiler;

  constructor(config: MonitoringConfig, context?: Partial<MonitoringContext>) {
    this.config = {
      bufferSize: 100,
      flushInterval: 5000,
      sampleRate: 1.0,
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableMemoryTracking: false,
      ...config,
    };

    this.context = {
      sessionId: generateSessionId(),
      environment: 'production',
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location?.href : undefined,
      ...context,
    };

    this.profiler = new PerformanceProfilerImpl();

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Add a monitoring adapter
   */
  addAdapter(adapter: MonitoringAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Remove a monitoring adapter
   */
  removeAdapter(adapterName: string): void {
    this.adapters = this.adapters.filter((adapter) => adapter.name !== adapterName);
  }

  /**
   * Track a monitoring event
   */
  track(
    type: MonitoringEventType,
    source: string,
    data: Record<string, any>,
    metrics?: PerformanceMetrics,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): void {
    if (!this.config.enabled) return;

    // Apply sample rate
    if (Math.random() > (this.config.sampleRate || 1.0)) return;

    const event: MonitoringEvent = {
      id: generateEventId(),
      type,
      timestamp: Date.now(),
      source,
      data: {
        ...data,
        context: this.context,
      },
      metrics,
      severity,
    };

    // Check for performance warnings
    if (metrics && this.config.performanceThresholds) {
      this.checkPerformanceThresholds(event, metrics);
    }

    // Add to buffer
    this.eventBuffer.push(event);

    // Trigger immediate event callback
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (error) {
        console.error('Error in monitoring event callback:', error);
      }
    }

    // Flush if buffer is full
    if (this.eventBuffer.length >= (this.config.bufferSize || 100)) {
      this.flush();
    }
  }

  /**
   * Track an error
   */
  trackError(error: Error, source: string, context?: any): void {
    this.track(
      'error',
      source,
      {
        message: error.message,
        name: error.name,
        stack: error.stack,
        context,
      },
      undefined,
      'high'
    );
  }

  /**
   * Get the performance profiler
   */
  getProfiler(): PerformanceProfiler {
    return this.profiler;
  }

  /**
   * Update monitoring context
   */
  updateContext(updates: Partial<MonitoringContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Flush all buffered events
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    // Trigger batch callback
    if (this.config.onBatch) {
      try {
        this.config.onBatch(events);
      } catch (error) {
        console.error('Error in monitoring batch callback:', error);
      }
    }

    // Send to adapters
    await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          await adapter.send(events);
        } catch (error) {
          console.error(`Error sending events to adapter ${adapter.name}:`, error);
          if (this.config.onError) {
            this.config.onError(error as Error);
          }
        }
      })
    );
  }

  /**
   * Destroy the monitor and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();

    // Flush adapters
    await Promise.all(
      this.adapters.map(async (adapter) => {
        if (adapter.flush) {
          try {
            await adapter.flush();
          } catch (error) {
            console.error(`Error flushing adapter ${adapter.name}:`, error);
          }
        }
      })
    );
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
    }
  }

  private checkPerformanceThresholds(event: MonitoringEvent, metrics: PerformanceMetrics): void {
    const thresholds = this.config.performanceThresholds!;

    // Check component render time
    if (
      thresholds.componentRenderTime &&
      event.type === 'component_render' &&
      metrics.duration > thresholds.componentRenderTime
    ) {
      this.createPerformanceWarning(
        'Component render time exceeded threshold',
        thresholds.componentRenderTime,
        metrics.duration,
        'Consider memoizing component or optimizing render logic'
      );
    }

    // Check form validation time
    if (
      thresholds.formValidationTime &&
      event.type === 'form_validation' &&
      metrics.duration > thresholds.formValidationTime
    ) {
      this.createPerformanceWarning(
        'Form validation time exceeded threshold',
        thresholds.formValidationTime,
        metrics.duration,
        'Consider debouncing validation or optimizing validators'
      );
    }

    // Check workflow navigation time
    if (
      thresholds.workflowNavigationTime &&
      event.type === 'workflow_navigation' &&
      metrics.duration > thresholds.workflowNavigationTime
    ) {
      this.createPerformanceWarning(
        'Workflow navigation time exceeded threshold',
        thresholds.workflowNavigationTime,
        metrics.duration,
        'Consider optimizing step transitions or condition evaluation'
      );
    }

    // Check memory usage
    if (
      thresholds.memoryUsage &&
      metrics.memoryUsage &&
      metrics.memoryUsage > thresholds.memoryUsage
    ) {
      this.createPerformanceWarning(
        'Memory usage exceeded threshold',
        thresholds.memoryUsage,
        metrics.memoryUsage,
        'Check for memory leaks or optimize data structures'
      );
    }

    // Check re-render count
    if (
      thresholds.reRenderCount &&
      metrics.reRenderCount &&
      metrics.reRenderCount > thresholds.reRenderCount
    ) {
      this.createPerformanceWarning(
        'Component re-render count exceeded threshold',
        thresholds.reRenderCount,
        metrics.reRenderCount,
        'Consider using React.memo or optimizing dependencies'
      );
    }
  }

  private createPerformanceWarning(
    message: string,
    threshold: number,
    actualValue: number,
    recommendation: string
  ): void {
    const warningEvent: PerformanceWarningEvent = {
      id: generateEventId(),
      type: 'performance_warning',
      timestamp: Date.now(),
      source: 'rilay_monitor',
      data: {
        message,
        context: this.context,
      },
      threshold,
      actualValue,
      recommendation,
      severity: 'medium',
    };

    this.eventBuffer.push(warningEvent);

    // Trigger immediate callback for performance warnings
    if (this.config.onEvent) {
      try {
        this.config.onEvent(warningEvent);
      } catch (error) {
        console.error('Error in performance warning callback:', error);
      }
    }
  }
}

/**
 * Performance profiler implementation
 */
class PerformanceProfilerImpl implements PerformanceProfiler {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private startTimes: Map<string, number> = new Map();

  start(label: string, metadata: Record<string, any> = {}): void {
    this.startTimes.set(label, performance.now());

    // Initialize metrics
    this.metrics.set(label, {
      timestamp: Date.now(),
      duration: 0,
      renderCount: metadata.renderCount || 0,
      reRenderCount: metadata.reRenderCount || 0,
      memoryUsage: this.getMemoryUsage(),
    });
  }

  end(label: string): PerformanceMetrics | null {
    const startTime = this.startTimes.get(label);
    if (!startTime) return null;

    const duration = performance.now() - startTime;
    const existingMetrics = this.metrics.get(label);

    if (!existingMetrics) return null;

    const finalMetrics: PerformanceMetrics = {
      ...existingMetrics,
      duration,
      memoryUsage: this.getMemoryUsage(),
    };

    this.metrics.set(label, finalMetrics);
    this.startTimes.delete(label);

    return finalMetrics;
  }

  mark(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  }

  measure(name: string, startMark: string, endMark?: string): number {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, startMark, endMark);
      const entries = performance.getEntriesByName(name, 'measure');
      return entries.length > 0 ? entries[entries.length - 1].duration : 0;
    }
    return 0;
  }

  getMetrics(label: string): PerformanceMetrics | null {
    return this.metrics.get(label) || null;
  }

  getAllMetrics(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};
    this.metrics.forEach((metrics, label) => {
      result[label] = metrics;
    });
    return result;
  }

  clear(label?: string): void {
    if (label) {
      this.metrics.delete(label);
      this.startTimes.delete(label);
    } else {
      this.metrics.clear();
      this.startTimes.clear();
    }
  }

  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return undefined;
  }
}

// Global monitor instance
let globalMonitor: RilayMonitor | null = null;

/**
 * Initialize global monitoring
 */
export function initializeMonitoring(
  config: MonitoringConfig,
  context?: Partial<MonitoringContext>
): RilayMonitor {
  if (globalMonitor) {
    globalMonitor.destroy();
  }

  globalMonitor = new RilayMonitor(config, context);
  return globalMonitor;
}

/**
 * Get the global monitor instance
 */
export function getGlobalMonitor(): RilayMonitor | null {
  return globalMonitor;
}

/**
 * Destroy global monitoring
 */
export async function destroyGlobalMonitoring(): Promise<void> {
  if (globalMonitor) {
    await globalMonitor.destroy();
    globalMonitor = null;
  }
}

// RilayMonitor is already exported above
