import type { ValidationError } from '../types';

/**
 * Utility for merging partial configurations into existing objects
 * Eliminates repetitive object spread operations
 */
export function mergeInto<T>(target: T, partial: Partial<T>): T {
  return { ...target, ...partial };
}

/**
 * Validates uniqueness of identifiers and throws descriptive errors
 */
export function ensureUnique(ids: string[], entityName: string): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate ${entityName} IDs: ${duplicates.join(', ')}`);
  }
}

/**
 * Validates required fields exist in configurations
 */
export function validateRequired<T>(
  items: T[],
  requiredFields: (keyof T)[],
  entityName: string
): void {
  const missing = items.filter((item) => requiredFields.some((field) => !item[field]));

  if (missing.length > 0) {
    throw new Error(`Missing required fields in ${entityName}: ${requiredFields.join(', ')}`);
  }
}

/**
 * Auto-generates IDs when not provided
 */
export class IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const current = this.counters.get(prefix) || 0;
    this.counters.set(prefix, current + 1);
    return `${prefix}-${current + 1}`;
  }

  reset(prefix?: string): void {
    if (prefix) {
      this.counters.delete(prefix);
    } else {
      this.counters.clear();
    }
  }
}

/**
 * Validation error builder for consistent error handling
 */
export class ValidationErrorBuilder {
  private errors: ValidationError[] = [];

  add(code: string, message: string, path?: string[]): this {
    this.errors.push({ code, message, path });
    return this;
  }

  addIf(condition: boolean, code: string, message: string, path?: string[]): this {
    if (condition) {
      this.add(code, message, path);
    }
    return this;
  }

  build(): ValidationError[] {
    return [...this.errors];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  clear(): this {
    this.errors = [];
    return this;
  }
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  hasValue: (value: any) => value !== undefined && value !== null && value !== '',

  isArray: (value: any) => Array.isArray(value),

  arrayMinLength: (value: any[], min: number) => value.length >= min,

  arrayMaxLength: (value: any[], max: number) => value.length <= max,
};

/**
 * Polymorphic helper for handling single items or arrays
 */
export function normalizeToArray<T>(input: T | T[]): T[] {
  return Array.isArray(input) ? input : [input];
}

/**
 * Deep clone utility for configuration objects
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * Generic configuration merger with type safety
 */
export function configureObject<T>(target: T, updates: Partial<T>, allowedKeys?: (keyof T)[]): T {
  const result = { ...target };

  for (const key in updates) {
    if (allowedKeys && !allowedKeys.includes(key)) {
      continue;
    }

    if (updates[key] !== undefined) {
      result[key] = updates[key] as T[Extract<keyof T, string>];
    }
  }

  return result;
}
