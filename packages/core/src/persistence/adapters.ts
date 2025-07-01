import type { PersistenceAdapter, WorkflowPersistenceData } from '../types';

/**
 * LocalStorage persistence adapter
 * Perfect for client-side persistence across browser sessions
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  readonly name = 'localStorage';

  async save(key: string, data: WorkflowPersistenceData): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      throw new Error(`Failed to save to localStorage: ${error}`);
    }
  }

  async load(key: string): Promise<WorkflowPersistenceData | null> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      throw new Error(`Failed to load from localStorage: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      throw new Error(`Failed to remove from localStorage: ${error}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    return localStorage.getItem(key) !== null;
  }

  async list(pattern?: string): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (!pattern || key.includes(pattern))) {
        keys.push(key);
      }
    }
    return keys;
  }
}

/**
 * SessionStorage persistence adapter
 * Perfect for temporary persistence within a single browser session
 */
export class SessionStorageAdapter implements PersistenceAdapter {
  readonly name = 'sessionStorage';

  async save(key: string, data: WorkflowPersistenceData): Promise<void> {
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      throw new Error(`Failed to save to sessionStorage: ${error}`);
    }
  }

  async load(key: string): Promise<WorkflowPersistenceData | null> {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      throw new Error(`Failed to load from sessionStorage: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      throw new Error(`Failed to remove from sessionStorage: ${error}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    return sessionStorage.getItem(key) !== null;
  }

  async list(pattern?: string): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (!pattern || key.includes(pattern))) {
        keys.push(key);
      }
    }
    return keys;
  }
}

/**
 * In-Memory persistence adapter
 * Perfect for testing or temporary workflows
 */
export class MemoryAdapter implements PersistenceAdapter {
  readonly name = 'memory';
  private storage = new Map<string, WorkflowPersistenceData>();

  async save(key: string, data: WorkflowPersistenceData): Promise<void> {
    this.storage.set(key, { ...data });
  }

  async load(key: string): Promise<WorkflowPersistenceData | null> {
    const data = this.storage.get(key);
    return data ? { ...data } : null;
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async list(pattern?: string): Promise<string[]> {
    const keys = Array.from(this.storage.keys());
    return pattern ? keys.filter((key) => key.includes(pattern)) : keys;
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * Composite adapter that can use multiple adapters with fallback
 * Perfect for robust persistence with primary/backup strategies
 */
export class CompositeAdapter implements PersistenceAdapter {
  readonly name = 'composite';

  constructor(
    private primary: PersistenceAdapter,
    private fallbacks: PersistenceAdapter[] = []
  ) {}

  async save(key: string, data: WorkflowPersistenceData): Promise<void> {
    const adapters = [this.primary, ...this.fallbacks];

    for (const adapter of adapters) {
      try {
        await adapter.save(key, data);
        return; // Success, no need to try fallbacks
      } catch (error) {
        console.warn(`Failed to save with ${adapter.name}:`, error);
        // Continue to next adapter
      }
    }

    throw new Error('All persistence adapters failed to save');
  }

  async load(key: string): Promise<WorkflowPersistenceData | null> {
    const adapters = [this.primary, ...this.fallbacks];

    for (const adapter of adapters) {
      try {
        const result = await adapter.load(key);
        if (result) {
          return result;
        }
      } catch (error) {
        console.warn(`Failed to load with ${adapter.name}:`, error);
        // Continue to next adapter
      }
    }

    return null;
  }

  async remove(key: string): Promise<void> {
    const adapters = [this.primary, ...this.fallbacks];
    const errors: Error[] = [];

    for (const adapter of adapters) {
      try {
        await adapter.remove(key);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length === adapters.length) {
      throw new Error(`All adapters failed to remove: ${errors.map((e) => e.message).join(', ')}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const adapters = [this.primary, ...this.fallbacks];

    for (const adapter of adapters) {
      try {
        if (await adapter.exists(key)) {
          return true;
        }
      } catch (error) {
        console.warn(`Failed to check existence with ${adapter.name}:`, error);
      }
    }

    return false;
  }

  async list(pattern?: string): Promise<string[]> {
    try {
      return (await this.primary.list?.(pattern)) || [];
    } catch (error) {
      console.warn('Failed to list with primary adapter:', error);

      for (const fallback of this.fallbacks) {
        try {
          return (await fallback.list?.(pattern)) || [];
        } catch (fallbackError) {
          console.warn(`Failed to list with fallback ${fallback.name}:`, fallbackError);
        }
      }

      return [];
    }
  }
}
