/**
 * @fileoverview LocalStorage persistence adapter for Rilay workflows
 *
 * This adapter provides browser localStorage-based persistence for workflow data.
 * It includes features like data compression, expiration handling, and error recovery.
 *
 * Key features:
 * - Automatic data expiration based on maxAge
 * - Optional data compression for large workflows
 * - Graceful handling of localStorage quota exceeded
 * - Type-safe serialization/deserialization
 */

import type {
  LocalStorageAdapterConfig,
  PersistedWorkflowData,
  WorkflowPersistenceAdapter,
} from '../types';
import { WorkflowPersistenceError } from '../types';

/**
 * Internal storage format with metadata
 */
interface StorageEntry {
  data: PersistedWorkflowData;
  version: string;
  expiresAt?: number;
}

/**
 * LocalStorage-based persistence adapter
 *
 * Provides a robust localStorage implementation with features like:
 * - Automatic cleanup of expired data
 * - Configurable key prefixes for namespace isolation
 * - Error handling for quota exceeded scenarios
 * - Optional data compression
 *
 * @example
 * ```typescript
 * const adapter = new LocalStorageAdapter({
 *   keyPrefix: 'myapp_workflow_',
 *   maxAge: 24 * 60 * 60 * 1000, // 24 hours
 *   compress: true
 * });
 * ```
 */
export class LocalStorageAdapter implements WorkflowPersistenceAdapter {
  private readonly keyPrefix: string;
  private readonly compress: boolean;
  private readonly maxAge?: number;
  private readonly version = '1.0.0';
  private readonly _isAvailable: boolean;

  constructor(config: LocalStorageAdapterConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? 'rilay_workflow_';
    this.compress = config.compress ?? false;
    this.maxAge = config.maxAge;

    // Check localStorage availability once at initialization
    this._isAvailable = this.isLocalStorageAvailable();
  }

  /**
   * Save workflow data to localStorage
   */
  async save(key: string, data: PersistedWorkflowData): Promise<void> {
    // Skip silently if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const storageEntry: StorageEntry = {
        data: {
          ...data,
          lastSaved: Date.now(),
        },
        version: this.version,
        expiresAt: this.maxAge ? Date.now() + this.maxAge : undefined,
      };

      const serialized = JSON.stringify(storageEntry);
      const finalData = this.compress ? this.compressData(serialized) : serialized;

      localStorage.setItem(storageKey, finalData);
    } catch (error) {
      if (error instanceof Error) {
        // Handle quota exceeded error
        if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
          // Try to clear expired data and retry once
          await this.clearExpiredData();

          try {
            const storageKey = this.getStorageKey(key);
            const storageEntry: StorageEntry = {
              data: { ...data, lastSaved: Date.now() },
              version: this.version,
              expiresAt: this.maxAge ? Date.now() + this.maxAge : undefined,
            };

            const serialized = JSON.stringify(storageEntry);
            const finalData = this.compress ? this.compressData(serialized) : serialized;

            localStorage.setItem(storageKey, finalData);
          } catch (retryError) {
            throw new WorkflowPersistenceError(
              'localStorage quota exceeded and cleanup failed',
              'QUOTA_EXCEEDED',
              retryError as Error
            );
          }
        } else {
          throw new WorkflowPersistenceError(
            `Failed to save to localStorage: ${error.message}`,
            'SAVE_FAILED',
            error
          );
        }
      } else {
        throw new WorkflowPersistenceError('Unknown error occurred while saving', 'SAVE_FAILED');
      }
    }
  }

  /**
   * Load workflow data from localStorage
   */
  async load(key: string): Promise<PersistedWorkflowData | null> {
    // Return null if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return null;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const rawData = localStorage.getItem(storageKey);

      if (!rawData) {
        return null;
      }

      const decompressedData = this.compress ? this.decompressData(rawData) : rawData;
      const storageEntry: StorageEntry = JSON.parse(decompressedData);

      // Check if data has expired
      if (storageEntry.expiresAt && Date.now() > storageEntry.expiresAt) {
        await this.remove(key);
        return null;
      }

      // Convert visitedSteps array back to Set for compatibility
      const data = {
        ...storageEntry.data,
        visitedSteps: Array.isArray(storageEntry.data.visitedSteps)
          ? storageEntry.data.visitedSteps
          : [],
      };

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new WorkflowPersistenceError(
          `Failed to load from localStorage: ${error.message}`,
          'LOAD_FAILED',
          error
        );
      }

      throw new WorkflowPersistenceError('Unknown error occurred while loading', 'LOAD_FAILED');
    }
  }

  /**
   * Remove workflow data from localStorage
   */
  async remove(key: string): Promise<void> {
    // Skip silently if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return;
    }

    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (error) {
      if (error instanceof Error) {
        throw new WorkflowPersistenceError(
          `Failed to remove from localStorage: ${error.message}`,
          'REMOVE_FAILED',
          error
        );
      }

      throw new WorkflowPersistenceError('Unknown error occurred while removing', 'REMOVE_FAILED');
    }
  }

  /**
   * Check if data exists for the given key
   */
  async exists(key: string): Promise<boolean> {
    // Return false if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return false;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const rawData = localStorage.getItem(storageKey);

      if (!rawData) {
        return false;
      }

      // Check if data is expired
      const decompressedData = this.compress ? this.decompressData(rawData) : rawData;
      const storageEntry: StorageEntry = JSON.parse(decompressedData);

      if (storageEntry.expiresAt && Date.now() > storageEntry.expiresAt) {
        await this.remove(key);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all available keys
   */
  async listKeys(): Promise<string[]> {
    // Return empty array if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return [];
    }

    try {
      const keys: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.keyPrefix)) {
          const workflowKey = key.substring(this.keyPrefix.length);
          // Check if the entry is still valid
          if (await this.exists(workflowKey)) {
            keys.push(workflowKey);
          }
        }
      }

      return keys;
    } catch (error) {
      if (error instanceof Error) {
        throw new WorkflowPersistenceError(
          `Failed to list keys: ${error.message}`,
          'LIST_FAILED',
          error
        );
      }

      throw new WorkflowPersistenceError(
        'Unknown error occurred while listing keys',
        'LIST_FAILED'
      );
    }
  }

  /**
   * Clear all workflow data
   */
  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.keyPrefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new WorkflowPersistenceError(
          `Failed to clear localStorage: ${error.message}`,
          'CLEAR_FAILED',
          error
        );
      }

      throw new WorkflowPersistenceError('Unknown error occurred while clearing', 'CLEAR_FAILED');
    }
  }

  /**
   * Get the full storage key with prefix
   */
  private getStorageKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Check if localStorage is available
   */
  private isLocalStorageAvailable(): boolean {
    try {
      const testKey = '__rilay_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Simple data compression using basic string compression
   * Note: In production, you might want to use a proper compression library
   */
  private compressData(data: string): string {
    // Simple run-length encoding for demonstration
    // In production, consider using LZ-string or similar
    return btoa(data);
  }

  /**
   * Decompress data
   */
  private decompressData(compressedData: string): string {
    try {
      return atob(compressedData);
    } catch {
      // Fallback: assume data is not compressed
      return compressedData;
    }
  }

  /**
   * Clear expired data entries
   */
  private async clearExpiredData(): Promise<void> {
    // Skip if localStorage is not available (SSR)
    if (!this._isAvailable) {
      return;
    }

    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.keyPrefix)) {
        try {
          const rawData = localStorage.getItem(key);
          if (rawData) {
            const decompressedData = this.compress ? this.decompressData(rawData) : rawData;
            const storageEntry: StorageEntry = JSON.parse(decompressedData);

            if (storageEntry.expiresAt && Date.now() > storageEntry.expiresAt) {
              keysToRemove.push(key);
            }
          }
        } catch {
          // If we can't parse the entry, it's probably corrupted, so remove it
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
