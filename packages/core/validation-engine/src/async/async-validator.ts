import type { ValidationContext, ValidationResult } from '@streamline/form-engine';

/**
 * Async validator function type
 */
export type AsyncValidatorFunction = (
  value: any,
  context: ValidationContext
) => Promise<ValidationResult>;

/**
 * Debounced async validator options
 */
export interface DebouncedValidatorOptions {
  delay?: number;
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Async validator with debouncing support
 */
export class AsyncValidator {
  private pendingValidations = new Map<string, Promise<ValidationResult>>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private validator: AsyncValidatorFunction,
    private options: DebouncedValidatorOptions = {}
  ) {
    this.options = {
      delay: 300,
      leading: false,
      trailing: true,
      ...options,
    };
  }

  /**
   * Validate with debouncing
   */
  async validate(value: any, context: ValidationContext, key?: string): Promise<ValidationResult> {
    const validationKey = key || this.generateKey(value, context);

    // Cancel previous validation if exists
    this.cancelPending(validationKey);

    // Return existing promise if validation is already pending
    const existingPromise = this.pendingValidations.get(validationKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Create new validation promise
    const validationPromise = new Promise<ValidationResult>((resolve, reject) => {
      const executeValidation = async () => {
        try {
          // Create abort controller for this validation
          const abortController = new AbortController();
          this.abortControllers.set(validationKey, abortController);

          // Add abort signal to context
          const contextWithAbort = {
            ...context,
            abortSignal: abortController.signal,
          };

          const result = await this.validator(value, contextWithAbort);

          // Clean up
          this.abortControllers.delete(validationKey);
          this.pendingValidations.delete(validationKey);

          resolve(result);
        } catch (error) {
          // Clean up
          this.abortControllers.delete(validationKey);
          this.pendingValidations.delete(validationKey);

          if (error instanceof Error && error.name === 'AbortError') {
            // Return a cancelled result instead of rejecting
            resolve({
              isValid: true,
              errors: [],
              cancelled: true,
            } as AsyncValidationResult);
          } else {
            reject(error);
          }
        }
      };

      if (this.options.delay && this.options.delay > 0) {
        // Execute with debouncing
        const timeoutId = setTimeout(executeValidation, this.options.delay);
        this.timeouts.set(validationKey, timeoutId);
      } else {
        // Execute immediately
        executeValidation();
      }
    });

    this.pendingValidations.set(validationKey, validationPromise);
    return validationPromise;
  }

  /**
   * Cancel pending validation
   */
  cancel(key: string): void {
    this.cancelPending(key);
  }

  /**
   * Cancel all pending validations
   */
  cancelAll(): void {
    for (const key of this.pendingValidations.keys()) {
      this.cancelPending(key);
    }
  }

  /**
   * Get pending validation count
   */
  getPendingCount(): number {
    return this.pendingValidations.size;
  }

  /**
   * Check if validation is pending
   */
  isPending(key: string): boolean {
    return this.pendingValidations.has(key);
  }

  private generateKey(value: any, context: ValidationContext): string {
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const contextStr = JSON.stringify({
      formId: context.formId,
      fieldId: context.fieldId,
    });
    return `${contextStr}:${valueStr}`;
  }

  private cancelPending(key: string): void {
    // Cancel timeout
    const timeoutId = this.timeouts.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(key);
    }

    // Abort ongoing validation
    const abortController = this.abortControllers.get(key);
    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(key);
    }

    // Remove pending promise
    this.pendingValidations.delete(key);
  }
}

/**
 * Create a debounced async validator
 */
export function createAsyncValidator(
  validator: AsyncValidatorFunction,
  options?: DebouncedValidatorOptions
): AsyncValidator {
  return new AsyncValidator(validator, options);
}

/**
 * Create a debounced validator function
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  let pendingPromise: Promise<any> | null = null;

  return ((...args: any[]) => {
    // Cancel previous timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Return existing promise if one is pending
    if (pendingPromise) {
      return pendingPromise;
    }

    // Create new promise
    pendingPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...args);
          pendingPromise = null;
          resolve(result);
        } catch (error) {
          pendingPromise = null;
          reject(error);
        }
      }, delay);
    });

    return pendingPromise;
  }) as T;
}

/**
 * Async validator registry for managing async validators
 */
export class AsyncValidatorRegistry {
  private validators = new Map<string, AsyncValidator>();

  /**
   * Register an async validator
   */
  register(id: string, validator: AsyncValidator): void {
    this.validators.set(id, validator);
  }

  /**
   * Unregister an async validator
   */
  unregister(id: string): void {
    const validator = this.validators.get(id);
    if (validator) {
      validator.cancelAll();
      this.validators.delete(id);
    }
  }

  /**
   * Get an async validator
   */
  get(id: string): AsyncValidator | undefined {
    return this.validators.get(id);
  }

  /**
   * Cancel all validations for a specific validator
   */
  cancel(id: string): void {
    const validator = this.validators.get(id);
    if (validator) {
      validator.cancelAll();
    }
  }

  /**
   * Cancel all pending validations
   */
  cancelAll(): void {
    for (const validator of this.validators.values()) {
      validator.cancelAll();
    }
  }

  /**
   * Get total pending validations across all validators
   */
  getTotalPending(): number {
    let total = 0;
    for (const validator of this.validators.values()) {
      total += validator.getPendingCount();
    }
    return total;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalValidators: number;
    totalPending: number;
    validatorStats: Record<string, number>;
  } {
    const validatorStats: Record<string, number> = {};

    for (const [id, validator] of this.validators.entries()) {
      validatorStats[id] = validator.getPendingCount();
    }

    return {
      totalValidators: this.validators.size,
      totalPending: this.getTotalPending(),
      validatorStats,
    };
  }

  /**
   * Clear all validators
   */
  clear(): void {
    this.cancelAll();
    this.validators.clear();
  }
}

// Global registry instance
let globalRegistry: AsyncValidatorRegistry | null = null;

/**
 * Get the global async validator registry
 */
export function getAsyncValidatorRegistry(): AsyncValidatorRegistry {
  if (!globalRegistry) {
    globalRegistry = new AsyncValidatorRegistry();
  }
  return globalRegistry;
}

/**
 * Extended validation result with cancellation support
 */
export interface AsyncValidationResult extends ValidationResult {
  cancelled?: boolean;
}
