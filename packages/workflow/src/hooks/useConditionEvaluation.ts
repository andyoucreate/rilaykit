import type { ConditionConfig, ConditionalBehavior } from '@rilaykit/core';
import { type ConditionBuilder, evaluateCondition } from '@rilaykit/core';
import { useMemo } from 'react';

export interface ConditionEvaluationResult {
  visible: boolean;
  disabled: boolean;
  required: boolean;
  readonly: boolean;
}

/**
 * Hook to evaluate conditional behaviors based on workflow data
 *
 * @param conditions - The conditional behavior configuration
 * @param workflowData - Current workflow data to evaluate against
 * @param defaultState - Default state when no conditions are provided
 * @returns Evaluated condition results
 */
export function useConditionEvaluation(
  conditions?: ConditionalBehavior,
  workflowData: Record<string, any> = {},
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
        let conditionToEvaluate: ConditionConfig;

        // If it's a ConditionBuilder, convert to ConditionConfig first
        if (condition && typeof condition === 'object' && 'build' in condition) {
          conditionToEvaluate = condition.build();
        } else {
          conditionToEvaluate = condition as ConditionConfig;
        }

        return evaluateCondition(conditionToEvaluate, workflowData);
      } catch (error) {
        console.warn('Error evaluating condition:', error);
        return false;
      }
    };

    return {
      visible: conditions.visible ? evaluateConditionSafe(conditions.visible) : true,
      disabled: conditions.disabled ? evaluateConditionSafe(conditions.disabled) : false,
      required: conditions.required ? evaluateConditionSafe(conditions.required) : false,
      readonly: conditions.readonly ? evaluateConditionSafe(conditions.readonly) : false,
    };
  }, [conditions, workflowData, defaultState]);
}

/**
 * Hook to evaluate multiple field conditions at once
 *
 * @param fieldsWithConditions - Map of field IDs to their conditional behaviors
 * @param workflowData - Current workflow data to evaluate against
 * @returns Map of field IDs to their evaluated conditions
 */
export function useMultipleConditionEvaluation(
  fieldsWithConditions: Record<string, ConditionalBehavior | undefined>,
  workflowData: Record<string, any> = {}
): Record<string, ConditionEvaluationResult> {
  return useMemo(() => {
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
              return evaluateCondition(condition.build(), workflowData);
            }
            return evaluateCondition(condition as ConditionConfig, workflowData);
          } catch (error) {
            console.warn(`Error evaluating condition for field ${fieldId}:`, error);
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
  }, [fieldsWithConditions, workflowData]);
}

/**
 * Hook to evaluate multiple step conditions at once using numeric indices
 *
 * @param stepsWithConditions - Map of step indices to their conditional behaviors
 * @param workflowData - Current workflow data to evaluate against
 * @returns Map of step indices to their evaluated conditions
 */
export function useMultipleStepConditionEvaluation(
  stepsWithConditions: Record<number, ConditionalBehavior | undefined>,
  workflowData: Record<string, any> = {}
): Record<number, ConditionEvaluationResult> {
  return useMemo(() => {
    const results: Record<number, ConditionEvaluationResult> = {};

    for (const [stepIndexStr, conditions] of Object.entries(stepsWithConditions)) {
      const stepIndex = Number.parseInt(stepIndexStr, 10);
      results[stepIndex] = {
        visible: true,
        disabled: false,
        required: false,
        readonly: false,
      };

      if (conditions) {
        const evaluateConditionSafe = (condition: ConditionConfig | ConditionBuilder): boolean => {
          try {
            if (condition && typeof condition === 'object' && 'build' in condition) {
              return evaluateCondition(condition.build(), workflowData);
            }
            return evaluateCondition(condition as ConditionConfig, workflowData);
          } catch (error) {
            console.warn(`Error evaluating condition for step ${stepIndex}:`, error);
            return false;
          }
        };

        results[stepIndex] = {
          visible: conditions.visible ? evaluateConditionSafe(conditions.visible) : true,
          disabled: conditions.disabled ? evaluateConditionSafe(conditions.disabled) : false,
          required: conditions.required ? evaluateConditionSafe(conditions.required) : false,
          readonly: conditions.readonly ? evaluateConditionSafe(conditions.readonly) : false,
        };
      }
    }

    return results;
  }, [stepsWithConditions, workflowData]);
}
