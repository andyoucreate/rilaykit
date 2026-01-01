import type { ConditionConfig, ConditionalBehavior, FieldConditions } from '@rilaykit/core';
import { type ConditionBuilder, evaluateCondition } from '@rilaykit/core';
import { useMemo, useRef } from 'react';
import { useFormStoreApi, useFieldConditions as useFieldConditionsFromStore } from '../stores';

/**
 * Cache entry for lazy condition evaluation
 */
interface ConditionCacheEntry {
  result: FieldConditions;
  valuesHash: string;
}

/**
 * Default field conditions (stable reference)
 */
const DEFAULT_CONDITIONS: FieldConditions = {
  visible: true,
  disabled: false,
  required: false,
  readonly: false,
};

/**
 * Creates a simple hash of the form values for cache invalidation
 * Only includes values that might be relevant (shallow comparison)
 */
function createValuesHash(values: Record<string, unknown>): string {
  try {
    return JSON.stringify(values);
  } catch {
    return String(Date.now());
  }
}

/**
 * Safely evaluates a condition
 */
function evaluateConditionSafe(
  condition: ConditionConfig | ConditionBuilder | undefined,
  formData: Record<string, unknown>
): boolean | undefined {
  if (!condition) return undefined;

  try {
    if (typeof condition === 'object' && 'build' in condition) {
      return evaluateCondition((condition as ConditionBuilder).build(), formData);
    }
    return evaluateCondition(condition as ConditionConfig, formData);
  } catch (error) {
    console.warn('Error evaluating condition:', error);
    return undefined;
  }
}

/**
 * Evaluates conditions for a field
 */
function evaluateFieldConditions(
  conditions: ConditionalBehavior | undefined,
  formData: Record<string, unknown>
): FieldConditions {
  if (!conditions) {
    return DEFAULT_CONDITIONS;
  }

  const visibleResult = evaluateConditionSafe(conditions.visible, formData);
  const disabledResult = evaluateConditionSafe(conditions.disabled, formData);
  const requiredResult = evaluateConditionSafe(conditions.required, formData);
  const readonlyResult = evaluateConditionSafe(conditions.readonly, formData);

  return {
    visible: visibleResult ?? true,
    disabled: disabledResult ?? false,
    required: requiredResult ?? false,
    readonly: readonlyResult ?? false,
  };
}

export interface UseFieldConditionsLazyOptions {
  /**
   * The field's conditional behavior configuration
   */
  conditions?: ConditionalBehavior;
  
  /**
   * Whether to skip evaluation (e.g., if field has no conditions)
   */
  skip?: boolean;
}

/**
 * Lazy condition evaluation hook with caching
 * 
 * This hook:
 * 1. Only evaluates conditions when called
 * 2. Caches the result based on form values hash
 * 3. Returns cached result if values haven't changed
 * 
 * @param fieldId - The field ID
 * @param options - Configuration options
 * @returns The evaluated field conditions
 * 
 * @example
 * ```tsx
 * const conditions = useFieldConditionsLazy('myField', {
 *   conditions: fieldConfig.conditions
 * });
 * 
 * if (!conditions.visible) return null;
 * ```
 */
export function useFieldConditionsLazy(
  fieldId: string,
  options: UseFieldConditionsLazyOptions = {}
): FieldConditions {
  const { conditions, skip = false } = options;
  const store = useFormStoreApi();
  
  // Use the store's conditions as primary source (for sync with provider)
  const storeConditions = useFieldConditionsFromStore(fieldId);
  
  // Cache for lazy evaluation
  const cacheRef = useRef<ConditionCacheEntry | null>(null);
  
  // If skip is true or no conditions, use store conditions or defaults
  if (skip || !conditions) {
    return storeConditions;
  }
  
  // Get current form values
  const formValues = store.getState().values;
  const valuesHash = createValuesHash(formValues);
  
  // Check cache
  if (cacheRef.current?.valuesHash === valuesHash) {
    return cacheRef.current.result;
  }
  
  // Evaluate conditions
  const result = evaluateFieldConditions(conditions, formValues);
  
  // Update cache
  cacheRef.current = {
    result,
    valuesHash,
  };
  
  return result;
}

/**
 * Hook to create a lazy condition evaluator function
 * 
 * This is useful when you need to evaluate conditions for multiple fields
 * on-demand, without triggering re-renders.
 * 
 * @returns A function that evaluates conditions for a given field
 */
export function useConditionEvaluator() {
  const store = useFormStoreApi();
  
  // Cache for all fields
  const cacheRef = useRef<Map<string, ConditionCacheEntry>>(new Map());
  const lastValuesHashRef = useRef<string>('');
  
  return useMemo(() => {
    return function evaluateForField(
      fieldId: string,
      conditions?: ConditionalBehavior
    ): FieldConditions {
      if (!conditions) {
        return DEFAULT_CONDITIONS;
      }
      
      const formValues = store.getState().values;
      const valuesHash = createValuesHash(formValues);
      
      // Clear cache if form values changed
      if (lastValuesHashRef.current !== valuesHash) {
        cacheRef.current.clear();
        lastValuesHashRef.current = valuesHash;
      }
      
      // Check cache
      const cached = cacheRef.current.get(fieldId);
      if (cached) {
        return cached.result;
      }
      
      // Evaluate and cache
      const result = evaluateFieldConditions(conditions, formValues);
      cacheRef.current.set(fieldId, { result, valuesHash });
      
      return result;
    };
  }, [store]);
}

/**
 * Hook that provides both current conditions and a way to force re-evaluation
 */
export function useFieldConditionsWithRefresh(
  fieldId: string,
  conditions?: ConditionalBehavior
): {
  conditions: FieldConditions;
  refresh: () => FieldConditions;
} {
  const store = useFormStoreApi();
  const storeConditions = useFieldConditionsFromStore(fieldId);
  
  const refresh = useMemo(() => {
    return () => {
      if (!conditions) {
        return storeConditions;
      }
      const formValues = store.getState().values;
      return evaluateFieldConditions(conditions, formValues);
    };
  }, [store, conditions, storeConditions]);
  
  return {
    conditions: storeConditions,
    refresh,
  };
}

