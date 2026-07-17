import {
  type ConditionBuilder,
  type ConditionConfig,
  type ConditionalBehavior,
  evaluateCondition,
  getLogger,
} from '@rilaykit/core';
import { useMemo, useRef } from 'react';

const log = getLogger('forms:conditions');

/**
 * Value-equality over two evaluated-condition maps: same field ids, and the
 * same four booleans for each. Used to keep the result's REFERENCE stable across
 * recomputes that changed nothing observable.
 */
function sameConditionResults(
  a: Record<string, ConditionEvaluationResult>,
  b: Record<string, ConditionEvaluationResult>
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const x = a[key];
    const y = b[key];
    if (
      !y ||
      x.visible !== y.visible ||
      x.disabled !== y.disabled ||
      x.required !== y.required ||
      x.readonly !== y.readonly
    ) {
      return false;
    }
  }
  return true;
}

export interface ConditionEvaluationResult {
  visible: boolean;
  disabled: boolean;
  required: boolean;
  readonly: boolean;
}

/**
 * Hook to evaluate conditional behaviors based on form data
 *
 * @param conditions - The conditional behavior configuration
 * @param formData - Current form data to evaluate against
 * @param defaultState - Default state when no conditions are provided
 * @returns Evaluated condition results
 */
export function useConditionEvaluation(
  conditions?: ConditionalBehavior,
  formData: Record<string, any> = {},
  defaultState: Partial<ConditionEvaluationResult> = {}
): ConditionEvaluationResult {
  return useMemo(() => {
    if (!conditions) {
      return {
        visible: defaultState.visible ?? true,
        disabled: defaultState.disabled ?? false,
        required: defaultState.required ?? false,
        readonly: defaultState.readonly ?? false,
      };
    }

    const evaluateConditionSafe = (condition: ConditionConfig | ConditionBuilder): boolean => {
      try {
        // If it's a ConditionBuilder, convert to ConditionConfig first
        if (condition && typeof condition === 'object' && 'build' in condition) {
          return evaluateCondition(condition.build(), formData);
        }
        // If it's already a ConditionConfig
        return evaluateCondition(condition as ConditionConfig, formData);
      } catch (error) {
        log.warn('Error evaluating condition:', error);
        return false;
      }
    };

    return {
      visible: conditions.visible
        ? evaluateConditionSafe(conditions.visible)
        : (defaultState.visible ?? true),
      disabled: conditions.disabled
        ? evaluateConditionSafe(conditions.disabled)
        : (defaultState.disabled ?? false),
      required: conditions.required
        ? evaluateConditionSafe(conditions.required)
        : (defaultState.required ?? false),
      readonly: conditions.readonly
        ? evaluateConditionSafe(conditions.readonly)
        : (defaultState.readonly ?? false),
    };
  }, [conditions, formData, defaultState]);
}

/**
 * Hook to evaluate conditions for multiple fields at once
 *
 * @param fieldsWithConditions - Map of field IDs to their conditional behaviors
 * @param formData - Current form data
 * @returns Map of field IDs to their evaluated conditions
 */
export function useMultipleConditionEvaluation(
  fieldsWithConditions: Record<string, ConditionalBehavior | undefined>,
  formData: Record<string, any> = {}
): Record<string, ConditionEvaluationResult> {
  const computed = useMemo(() => {
    const results: Record<string, ConditionEvaluationResult> = {};

    for (const [fieldId, conditions] of Object.entries(fieldsWithConditions)) {
      results[fieldId] = {
        visible: true,
        disabled: false,
        required: false,
        readonly: false,
      };

      if (conditions) {
        const evaluateConditionSafe = (condition: ConditionConfig | ConditionBuilder): boolean => {
          try {
            if (condition && typeof condition === 'object' && 'build' in condition) {
              return evaluateCondition(condition.build(), formData);
            }
            return evaluateCondition(condition as ConditionConfig, formData);
          } catch (error) {
            log.warn(`Error evaluating condition for field ${fieldId}:`, error);
            return false;
          }
        };

        results[fieldId] = {
          visible: conditions.visible ? evaluateConditionSafe(conditions.visible) : true,
          disabled: conditions.disabled ? evaluateConditionSafe(conditions.disabled) : false,
          required: conditions.required ? evaluateConditionSafe(conditions.required) : false,
          readonly: conditions.readonly ? evaluateConditionSafe(conditions.readonly) : false,
        };
      }
    }

    return results;
  }, [fieldsWithConditions, formData]);

  // Stabilize identity across value-equal recomputes. The memo above recomputes
  // on every `formData` change (i.e. every keystroke), but the EVALUATED
  // conditions usually do not change. Returning a fresh object each time churns
  // the form context's `conditionsHelpers` and re-renders EVERY field, defeating
  // granular subscription isolation — the exact reason the no-conditions path
  // uses frozen singletons. Keep the previous reference when nothing observable
  // changed; the `!==` short-circuit skips the compare when the memo was cached.
  const stableRef = useRef(computed);
  if (stableRef.current !== computed && !sameConditionResults(stableRef.current, computed)) {
    stableRef.current = computed;
  }
  return stableRef.current;
}
