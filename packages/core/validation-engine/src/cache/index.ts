import type { FieldId, FormId, ValidationResult } from '@streamline/form-engine';

/**
 * LRU Cache entry
 */
interface CacheEntry {
  key: string;
  value: ValidationResult;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache configuration options
 */
export interface ValidationCacheOptions {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
  maxAge?: number; // Maximum age in milliseconds
}

/**
 * Validation cache implementing LRU eviction policy
 */
export class ValidationCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly maxAge: number;

  constructor(options: ValidationCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.maxAge = options.maxAge ?? 30 * 60 * 1000; // 30 minutes default
  }

  /**
   * Generate cache key from form, field, and value
   */
  generateKey(formId: FormId, fieldId: FieldId, value: any): string {
    const valueKey = this.serializeValue(value);
    return `${formId}:${fieldId}:${valueKey}`;
  }

  /**
   * Get cached validation result
   */
  get(key: string): ValidationResult | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (this.isExpired(entry, now)) {
      this.delete(key);
      return null;
    }

    // Update access statistics
    entry.lastAccessed = now;
    entry.accessCount++;

    // Move to end of access order (most recently used)
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set validation result in cache
   */
  set(key: string, value: ValidationResult): void {
    const now = Date.now();

    // If key already exists, update it
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.timestamp = now;
      entry.lastAccessed = now;
      entry.accessCount++;
      this.updateAccessOrder(key);
      return;
    }

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Add new entry
    const entry: CacheEntry = {
      key,
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);

    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.length = 0;
  }

  /**
   * Clear cache entries for a specific form
   */
  clearForm(formId: FormId): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${formId}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  /**
   * Clear cache entries for a specific field
   */
  clearField(formId: FormId, fieldId: FieldId): void {
    const prefix = `${formId}:${fieldId}:`;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry, now)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if cache has a key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (this.isExpired(entry, Date.now())) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let totalAccessCount = 0;
    let oldestEntry = now;
    let newestEntry = 0;

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry, now)) {
        expiredEntries++;
      } else {
        validEntries++;
      }

      totalAccessCount += entry.accessCount;
      oldestEntry = Math.min(oldestEntry, entry.timestamp);
      newestEntry = Math.max(newestEntry, entry.timestamp);
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      validEntries,
      expiredEntries,
      hitRate: totalAccessCount > 0 ? validEntries / totalAccessCount : 0,
      oldestEntry: oldestEntry === now ? null : oldestEntry,
      newestEntry: newestEntry || null,
      averageAccessCount: validEntries > 0 ? totalAccessCount / validEntries : 0,
    };
  }

  /**
   * Get all cache keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entries for a form (for debugging)
   */
  getFormEntries(formId: FormId): CacheEntry[] {
    const entries: CacheEntry[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${formId}:`)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  private serializeValue(value: any): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value) || typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object]';
      }
    }

    return String(value);
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    const age = now - entry.timestamp;
    const timeSinceLastAccess = now - entry.lastAccessed;

    return age > this.maxAge || timeSinceLastAccess > this.ttl;
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    // Find the least recently used entry that's not recently accessed
    let keyToEvict = this.accessOrder[0];

    // Try to evict expired entries first
    const now = Date.now();
    for (const key of this.accessOrder) {
      const entry = this.cache.get(key);
      if (entry && this.isExpired(entry, now)) {
        keyToEvict = key;
        break;
      }
    }

    this.delete(keyToEvict);
  }
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  validEntries: number;
  expiredEntries: number;
  hitRate: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  averageAccessCount: number;
}

/**
 * Global cache instance
 */
let globalCache: ValidationCache | null = null;

/**
 * Get the global validation cache instance
 */
export function getValidationCache(): ValidationCache {
  if (!globalCache) {
    globalCache = new ValidationCache();
  }
  return globalCache;
}

/**
 * Create a new validation cache instance
 */
export function createValidationCache(options?: ValidationCacheOptions): ValidationCache {
  return new ValidationCache(options);
}
