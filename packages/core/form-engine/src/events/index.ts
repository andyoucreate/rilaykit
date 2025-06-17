import type {
  EventHistoryEntry,
  EventSubscriptionOptions,
  StreamlineEvents,
  UnsubscribeFunction,
} from '../types/index.js';

// Event middleware type
export type EventMiddleware = (
  event: string,
  payload: any,
  next: () => Promise<void>
) => Promise<void>;

// Event system interface
export interface StreamlineEventSystem {
  // Event subscription
  on<K extends keyof StreamlineEvents>(
    event: K,
    handler: (payload: StreamlineEvents[K]) => void | Promise<void>,
    options?: EventSubscriptionOptions
  ): UnsubscribeFunction;

  // Event emission
  emit<K extends keyof StreamlineEvents>(event: K, payload: StreamlineEvents[K]): Promise<void>;

  // Event middleware
  use(middleware: EventMiddleware): void;

  // Event debugging
  debug(enabled: boolean): void;
  getEventHistory(): EventHistoryEntry[];

  // Cleanup
  destroy(): void;
}

// Event subscription entry
interface EventSubscription {
  handler: (payload: any) => void | Promise<void>;
  options: EventSubscriptionOptions;
  id: string;
}

// Event system implementation
export class StreamlineEventSystemImpl implements StreamlineEventSystem {
  private subscriptions = new Map<string, EventSubscription[]>();
  private middlewares: EventMiddleware[] = [];
  private history: EventHistoryEntry[] = [];
  private debugEnabled = false;
  private maxHistorySize = 100;
  private subscriptionIdCounter = 0;

  on<K extends keyof StreamlineEvents>(
    event: K,
    handler: (payload: StreamlineEvents[K]) => void | Promise<void>,
    options: EventSubscriptionOptions = {}
  ): UnsubscribeFunction {
    const eventStr = event as string;
    const subscriptionId = `sub_${++this.subscriptionIdCounter}`;

    const subscription: EventSubscription = {
      handler,
      options,
      id: subscriptionId,
    };

    if (!this.subscriptions.has(eventStr)) {
      this.subscriptions.set(eventStr, []);
    }

    const eventSubscriptions = this.subscriptions.get(eventStr)!;

    // Insert subscription based on priority
    const priority = options.priority || 0;
    let insertIndex = eventSubscriptions.length;

    for (let i = 0; i < eventSubscriptions.length; i++) {
      const existingPriority = eventSubscriptions[i].options.priority || 0;
      if (priority > existingPriority) {
        insertIndex = i;
        break;
      }
    }

    eventSubscriptions.splice(insertIndex, 0, subscription);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(eventStr);
      if (subs) {
        const index = subs.findIndex((s) => s.id === subscriptionId);
        if (index !== -1) {
          subs.splice(index, 1);
        }
        if (subs.length === 0) {
          this.subscriptions.delete(eventStr);
        }
      }
    };
  }

  async emit<K extends keyof StreamlineEvents>(
    event: K,
    payload: StreamlineEvents[K]
  ): Promise<void> {
    const eventStr = event as string;
    const startTime = performance.now();

    if (this.debugEnabled) {
      console.log(`[Streamline Events] Emitting: ${eventStr}`, payload);
    }

    // Execute middleware chain
    let middlewareIndex = 0;

    const executeNext = async (): Promise<void> => {
      if (middlewareIndex < this.middlewares.length) {
        const middleware = this.middlewares[middlewareIndex++];
        await middleware(eventStr, payload, executeNext);
      } else {
        // Execute event handlers
        await this.executeHandlers(eventStr, payload);
      }
    };

    try {
      await executeNext();
    } catch (error) {
      console.error(`[Streamline Events] Error in event ${eventStr}:`, error);
      throw error;
    } finally {
      const duration = performance.now() - startTime;

      // Add to history
      this.addToHistory({
        timestamp: Date.now(),
        event: eventStr,
        payload,
        duration,
      });

      if (this.debugEnabled) {
        console.log(`[Streamline Events] Completed: ${eventStr} (${duration.toFixed(2)}ms)`);
      }
    }
  }

  private async executeHandlers(event: string, payload: any): Promise<void> {
    const subscriptions = this.subscriptions.get(event);
    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    const handlersToExecute = [...subscriptions];
    const onceHandlers: string[] = [];

    // Execute handlers
    const promises = handlersToExecute.map(async (subscription) => {
      try {
        await subscription.handler(payload);

        // Mark for removal if it's a once handler
        if (subscription.options.once) {
          onceHandlers.push(subscription.id);
        }
      } catch (error) {
        console.error(`[Streamline Events] Handler error for ${event}:`, error);
        throw error;
      }
    });

    await Promise.all(promises);

    // Remove once handlers
    if (onceHandlers.length > 0) {
      const remainingSubscriptions = subscriptions.filter((sub) => !onceHandlers.includes(sub.id));

      if (remainingSubscriptions.length === 0) {
        this.subscriptions.delete(event);
      } else {
        this.subscriptions.set(event, remainingSubscriptions);
      }
    }
  }

  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  debug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  getEventHistory(): EventHistoryEntry[] {
    return [...this.history];
  }

  private addToHistory(entry: EventHistoryEntry): void {
    this.history.push(entry);

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  destroy(): void {
    this.subscriptions.clear();
    this.middlewares.length = 0;
    this.history.length = 0;
  }
}

// Singleton instance
let globalEventSystem: StreamlineEventSystem | null = null;

export function getEventSystem(): StreamlineEventSystem {
  if (!globalEventSystem) {
    globalEventSystem = new StreamlineEventSystemImpl();
  }
  return globalEventSystem;
}

// Middleware factories
export const createLoggingMiddleware = (): EventMiddleware => {
  return async (event, payload, next) => {
    console.log(`[Streamline] Event: ${event}`, payload);
    const start = performance.now();
    await next();
    const duration = performance.now() - start;
    console.log(`[Streamline] Event ${event} completed in ${duration.toFixed(2)}ms`);
  };
};

export const createValidationMiddleware = (): EventMiddleware => {
  return async (event, payload, next) => {
    // Basic payload validation
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(`Invalid payload for event ${event}: expected object`);
    }

    await next();
  };
};

export const createTimingMiddleware = (): EventMiddleware => {
  const eventTimes = new Map<string, number[]>();

  return async (event, _payload, next) => {
    const start = performance.now();
    await next();
    const duration = performance.now() - start;

    if (!eventTimes.has(event)) {
      eventTimes.set(event, []);
    }

    const times = eventTimes.get(event)!;
    times.push(duration);

    // Keep only last 10 measurements
    if (times.length > 10) {
      times.shift();
    }

    // Log if event is taking too long
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    if (avgTime > 100) {
      // 100ms threshold
      console.warn(`[Streamline] Event ${event} is taking ${avgTime.toFixed(2)}ms on average`);
    }
  };
};
