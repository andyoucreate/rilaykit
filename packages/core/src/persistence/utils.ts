import type { PersistenceAdapter, PersistenceConfig } from '../types';
import { LocalStorageAdapter, MemoryAdapter, SessionStorageAdapter } from './adapters';

/**
 * Utility functions to create persistence configurations easily
 */
export const persistence = {
  /**
   * Create a localStorage-based persistence configuration
   */
  localStorage(options: Partial<PersistenceConfig> = {}): PersistenceConfig {
    return {
      adapter: new LocalStorageAdapter(),
      debounceMs: 1000,
      autoSave: true,
      saveOnStepChange: true,
      ...options,
    };
  },

  /**
   * Create a sessionStorage-based persistence configuration
   */
  sessionStorage(options: Partial<PersistenceConfig> = {}): PersistenceConfig {
    return {
      adapter: new SessionStorageAdapter(),
      debounceMs: 1000,
      autoSave: true,
      saveOnStepChange: true,
      ...options,
    };
  },

  /**
   * Create an in-memory persistence configuration (for testing)
   */
  memory(options: Partial<PersistenceConfig> = {}): PersistenceConfig {
    return {
      adapter: new MemoryAdapter(),
      debounceMs: 0, // No debounce for in-memory
      autoSave: true,
      saveOnStepChange: true,
      ...options,
    };
  },

  /**
   * Create a custom persistence configuration
   */
  custom(adapter: PersistenceAdapter, options: Partial<PersistenceConfig> = {}): PersistenceConfig {
    return {
      adapter,
      debounceMs: 1000,
      autoSave: true,
      saveOnStepChange: true,
      ...options,
    };
  },
};

/**
 * Utility to create persistence configurations with retry logic
 */
export function createResilientPersistence(
  primary: PersistenceAdapter,
  fallback?: PersistenceAdapter,
  options: Partial<PersistenceConfig> = {}
): PersistenceConfig {
  // If no fallback, use memory as fallback
  const finalFallback = fallback || new MemoryAdapter();

  // Create a composite adapter that tries primary first, then fallback
  const adapter: PersistenceAdapter = {
    name: `resilient-${primary.name}`,

    async save(key: string, data: any): Promise<void> {
      try {
        await primary.save(key, data);
      } catch (error) {
        console.warn('Primary persistence failed, using fallback:', error);
        await finalFallback.save(key, data);
      }
    },

    async load(key: string): Promise<any> {
      try {
        const result = await primary.load(key);
        if (result) return result;
      } catch (error) {
        console.warn('Primary persistence load failed, trying fallback:', error);
      }

      return await finalFallback.load(key);
    },

    async remove(key: string): Promise<void> {
      const errors: Error[] = [];

      try {
        await primary.remove(key);
      } catch (error) {
        errors.push(error as Error);
      }

      try {
        await finalFallback.remove(key);
      } catch (error) {
        errors.push(error as Error);
      }

      if (errors.length === 2) {
        throw new Error(`Both adapters failed: ${errors.map((e) => e.message).join(', ')}`);
      }
    },

    async exists(key: string): Promise<boolean> {
      try {
        if (await primary.exists(key)) return true;
      } catch (error) {
        console.warn('Primary persistence exists check failed:', error);
      }

      try {
        return await finalFallback.exists(key);
      } catch (error) {
        console.warn('Fallback persistence exists check failed:', error);
        return false;
      }
    },

    async list(pattern?: string): Promise<string[]> {
      try {
        return (await primary.list?.(pattern)) || [];
      } catch (error) {
        console.warn('Primary persistence list failed:', error);
        try {
          return (await finalFallback.list?.(pattern)) || [];
        } catch (fallbackError) {
          console.warn('Fallback persistence list failed:', fallbackError);
          return [];
        }
      }
    },
  };

  return {
    adapter,
    debounceMs: 1000,
    autoSave: true,
    saveOnStepChange: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    ...options,
  };
}
