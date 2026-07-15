import { ConfigurationError } from '../errors';
import type {
  ConsoleMonitoringAdapter,
  MonitoringAdapter,
  MonitoringEvent,
  RemoteMonitoringAdapter,
} from '../types';

/**
 * Console monitoring adapter
 * Logs events to the browser console
 */
export class ConsoleAdapter implements ConsoleMonitoringAdapter {
  readonly name = 'console';
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  async send(events: MonitoringEvent[]): Promise<void> {
    for (const event of events) {
      this.logEvent(event);
    }
  }

  private logEvent(event: MonitoringEvent): void {
    const logData = {
      id: event.id,
      type: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
      source: event.source,
      severity: event.severity,
      data: event.data,
      metrics: event.metrics,
    };

    switch (event.severity) {
      case 'critical':
      case 'high':
        if (this.shouldLog('error')) {
          console.error(`[Rilay Monitor] ${event.type}:`, logData);
        }
        break;
      case 'medium':
        if (this.shouldLog('warn')) {
          console.warn(`[Rilay Monitor] ${event.type}:`, logData);
        }
        break;
      default:
        if (this.shouldLog('info')) {
          console.info(`[Rilay Monitor] ${event.type}:`, logData);
        }
        break;
    }

    // Always log performance warnings
    if (event.type === 'performance_warning' && this.shouldLog('warn')) {
      const perfEvent = event as any;
      console.warn(`[Rilay Performance Warning] ${perfEvent.data.message}`, {
        threshold: perfEvent.threshold,
        actual: perfEvent.actualValue,
        recommendation: perfEvent.recommendation,
      });
    }
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }
}

/**
 * Tracks the delivery outcome for a single send() call. `remaining` counts its
 * not-yet-delivered events; `settled` guards against double resolve/reject.
 */
interface SendGroup {
  remaining: number;
  settled: boolean;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

/** A single queued event paired with the send() group that owns its outcome. */
interface QueuedEvent {
  readonly event: MonitoringEvent;
  readonly owner: SendGroup;
}

/** Creates a manually-settled promise. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Remote monitoring adapter
 * Sends events to a remote endpoint
 */
export class RemoteAdapter implements RemoteMonitoringAdapter {
  readonly name = 'remote';
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly headers: Record<string, string>;
  readonly batchSize: number;
  readonly retryAttempts: number;

  private eventQueue: QueuedEvent[] = [];
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null;

  constructor(config: {
    endpoint: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batchSize?: number;
    retryAttempts?: number;
  }) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.headers,
    };
    this.batchSize = config.batchSize || 50;
    this.retryAttempts = config.retryAttempts || 3;
  }

  /**
   * Queues the caller's events and returns a promise that settles according to
   * the delivery outcome of THIS caller's events specifically.
   *
   * Each send() owns a deferred whose fate is decided per queued event: it
   * resolves only once all of its events have been delivered, and rejects only
   * if one of its events actually failed to send. Because the outcome is tracked
   * per batch of network work, a caller whose events are delivered by a later
   * (recovery) network batch fulfills even if an earlier batch — carrying a
   * different caller's events — failed. No false-success, no false-failure, and
   * no event is ever sent twice.
   */
  async send(events: MonitoringEvent[]): Promise<void> {
    if (events.length === 0) return;

    const owner: SendGroup = { remaining: events.length, settled: false, ...deferred() };
    for (const event of events) {
      this.eventQueue.push({ event, owner });
    }

    this.drain();
    return owner.promise;
  }

  async flush(): Promise<void> {
    this.drain();
    await this.processingPromise;
  }

  /**
   * Ensures a single processing loop is running. New events pushed while the
   * loop is active are picked up by the loop's own iteration, so at most one
   * loop runs at a time and every queued event is attempted exactly once.
   */
  private drain(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processingPromise = this.processQueue().finally(() => {
      this.isProcessing = false;
      this.processingPromise = null;
    });
  }

  configure(config: Record<string, any>): void {
    if (config.headers) {
      Object.assign(this.headers, config.headers);
    }
  }

  private async processQueue(): Promise<void> {
    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.splice(0, this.batchSize);
      const events = batch.map((entry) => entry.event);
      try {
        await this.sendBatch(events);
        this.settleBatch(batch, null);
      } catch (error) {
        this.settleBatch(batch, error as Error);
      }
    }
  }

  /**
   * Resolves/rejects the deferreds owning the events in a completed network
   * batch. On success each owner's outstanding count decrements and the owner
   * resolves once all of its events are delivered; on failure the owner rejects
   * immediately (its events are not retried beyond sendBatch's own attempts).
   */
  private settleBatch(batch: QueuedEvent[], error: Error | null): void {
    for (const { owner } of batch) {
      if (owner.settled) continue;

      if (error) {
        owner.settled = true;
        owner.reject(error);
        continue;
      }

      owner.remaining -= 1;
      if (owner.remaining <= 0) {
        owner.settled = true;
        owner.resolve();
      }
    }
  }

  private async sendBatch(events: MonitoringEvent[]): Promise<void> {
    const payload = {
      events,
      timestamp: Date.now(),
      source: 'rilay-monitoring',
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new ConfigurationError(`HTTP ${response.status}: ${response.statusText}`, {
            endpoint: this.endpoint,
            status: response.status,
          });
        }

        // Success - exit retry loop
        return;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof Error && error.message.includes('HTTP 4')) {
          break;
        }

        // Wait before retrying (exponential backoff)
        // Note: Using Math.pow instead of ** operator for SWC compatibility
        if (attempt < this.retryAttempts) {
          // biome-ignore lint/style/useExponentiationOperator: SWC compatibility
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    // All retries failed
    console.error('Failed to send monitoring events to remote endpoint:', lastError);
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Local storage adapter for offline support — buffers MONITORING events.
 *
 * Named for what it stores, not just where: `@rilaykit/workflow` exports a
 * `LocalStorageAdapter` of its own that persists workflow STATE. Two different
 * classes cannot share one name in the `rilaykit` all-in-one package, which
 * re-exports both.
 */
export class LocalStorageMonitoringAdapter implements MonitoringAdapter {
  readonly name = 'localStorage';
  private readonly storageKey = 'rilay_monitoring_events';
  private readonly maxEvents: number;

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents;
  }

  async send(events: MonitoringEvent[]): Promise<void> {
    try {
      const existingEvents = this.getStoredEvents();
      const allEvents = [...existingEvents, ...events];

      // Keep only the most recent events
      const recentEvents = allEvents.slice(-this.maxEvents);

      localStorage.setItem(this.storageKey, JSON.stringify(recentEvents));
    } catch (error) {
      console.error('Failed to store monitoring events:', error);
    }
  }

  async flush(): Promise<void> {
    // LocalStorage is synchronous, nothing to flush
  }

  getStoredEvents(): MonitoringEvent[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to retrieve stored monitoring events:', error);
      return [];
    }
  }

  clearStoredEvents(): void {
    localStorage.removeItem(this.storageKey);
  }

  getEventCount(): number {
    return this.getStoredEvents().length;
  }
}

/**
 * Development adapter that provides detailed logging
 */
export class DevelopmentAdapter implements MonitoringAdapter {
  readonly name = 'development';
  private readonly console = new ConsoleAdapter('debug');

  async send(events: MonitoringEvent[]): Promise<void> {
    await this.console.send(events);

    // Additional development features
    this.logPerformanceSummary(events);
    this.logErrorSummary(events);
  }

  private logPerformanceSummary(events: MonitoringEvent[]): void {
    const performanceEvents = events.filter((e) => e.metrics);

    if (performanceEvents.length === 0) return;

    console.group('[Rilay Performance Summary]');

    const avgDuration =
      performanceEvents.reduce((sum, e) => sum + (e.metrics?.duration || 0), 0) /
      performanceEvents.length;
    const maxDuration = Math.max(...performanceEvents.map((e) => e.metrics?.duration || 0));

    console.info(`Average duration: ${avgDuration.toFixed(2)}ms`);
    console.info(`Max duration: ${maxDuration.toFixed(2)}ms`);

    // Group by type
    const byType: Record<string, MonitoringEvent[]> = {};
    for (const event of performanceEvents) {
      if (!byType[event.type]) byType[event.type] = [];
      byType[event.type].push(event);
    }

    for (const [type, typeEvents] of Object.entries(byType)) {
      const typeAvg =
        typeEvents.reduce((sum, e) => sum + (e.metrics?.duration || 0), 0) / typeEvents.length;
      console.info(`${type}: ${typeAvg.toFixed(2)}ms avg (${typeEvents.length} events)`);
    }

    console.groupEnd();
  }

  private logErrorSummary(events: MonitoringEvent[]): void {
    const errorEvents = events.filter((e) => e.type === 'error');

    if (errorEvents.length === 0) return;

    console.group('[Rilay Error Summary]');
    console.error(`${errorEvents.length} errors detected`);

    const errorsBySource: Record<string, number> = {};
    for (const event of errorEvents) {
      errorsBySource[event.source] = (errorsBySource[event.source] || 0) + 1;
    }

    for (const [source, count] of Object.entries(errorsBySource)) {
      console.error(`${source}: ${count} errors`);
    }

    console.groupEnd();
  }
}
