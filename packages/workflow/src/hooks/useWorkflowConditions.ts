import type { ConditionalBehavior, StepConfig, WorkflowConfig } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import {
  type ConditionEvaluationResult,
  useConditionEvaluation,
  useMultipleConditionEvaluation,
  useMultipleStepConditionEvaluation,
} from './useConditionEvaluation';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowConditionsProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  currentStep: StepConfig;
}

/**
 * Result of step condition evaluation - only relevant properties for workflow steps
 */
export interface StepConditionResult {
  visible: boolean;
  skippable: boolean;
}

export interface UseWorkflowConditionsReturn {
  stepConditions: StepConditionResult;
  fieldConditions: Record<string, ConditionEvaluationResult>;
  allStepConditions: Record<number, StepConditionResult>;
  isStepVisible: (stepIndex: number) => boolean;
  isStepSkippable: (stepIndex: number) => boolean;
  isFieldVisible: (fieldId: string) => boolean;
  isFieldDisabled: (fieldId: string) => boolean;
  isFieldRequired: (fieldId: string) => boolean;
  isFieldReadonly: (fieldId: string) => boolean;
}

/**
 * Converts full condition evaluation result to step-specific result
 */
function toStepConditionResult(
  fullResult: ConditionEvaluationResult,
  allowSkip?: boolean
): StepConditionResult {
  return {
    visible: fullResult.visible,
    // For steps: skippable if either allowSkip is true OR skippable condition is true
    // Note: fullResult.required now represents the skippable condition (mapped above)
    skippable: allowSkip === true || fullResult.required,
  };
}

/**
 * Hook to manage conditional behaviors for workflow steps and fields
 *
 * This hook evaluates conditions for steps and form fields within a workflow,
 * providing convenient methods to check step and field states based on conditions.
 *
 * Steps have different condition types than fields:
 * - Steps: visible, skippable
 * - Fields: visible, disabled, required, readonly
 */
export function useWorkflowConditions({
  workflowConfig,
  workflowState,
  currentStep,
}: UseWorkflowConditionsProps): UseWorkflowConditionsReturn {
  // Create combined data context for condition evaluation
  const conditionData = useMemo(
    () => ({
      ...workflowState.allData,
      ...workflowState.stepData,
    }),
    [workflowState.allData, workflowState.stepData]
  );

  // Evaluate current step-level conditions
  const currentStepConditions = useMemo(() => {
    if (!currentStep?.conditions) return undefined;

    // Transform StepConditionalBehavior to ConditionalBehavior
    // Map 'skippable' to 'required' (inverted logic)
    return {
      visible: currentStep.conditions.visible,
      required: currentStep.conditions.skippable, // skippable condition becomes required condition
    };
  }, [currentStep?.conditions]);

  const currentStepEvaluation = useConditionEvaluation(currentStepConditions, conditionData, {
    visible: true,
    disabled: false,
    required: false, // For steps, "required" means "not skippable"
    readonly: false,
  });

  const stepConditions = useMemo(
    () => toStepConditionResult(currentStepEvaluation, currentStep?.allowSkip),
    [currentStepEvaluation, currentStep?.allowSkip]
  );

  // Pre-evaluate all steps conditions - create conditions map first
  const allStepConditionsMap = useMemo(() => {
    const conditionsMap: Record<number, ConditionalBehavior | undefined> = {};
    workflowConfig.steps.forEach((step, index) => {
      if (step.conditions) {
        // Transform StepConditionalBehavior to ConditionalBehavior
        // Map 'skippable' to 'required' (inverted logic)
        conditionsMap[index] = {
          visible: step.conditions.visible,
          required: step.conditions.skippable, // skippable condition becomes required condition
        };
      }
    });
    return conditionsMap;
  }, [workflowConfig.steps]);

  // Evaluate all step conditions using specialized hook
  const allStepEvaluations = useMultipleStepConditionEvaluation(
    allStepConditionsMap,
    conditionData
  );

  // Convert to step-specific results
  const allStepConditions = useMemo(() => {
    const results: Record<number, StepConditionResult> = {};

    workflowConfig.steps.forEach((step, index) => {
      const evaluation = allStepEvaluations[index];

      if (evaluation) {
        results[index] = toStepConditionResult(evaluation, step.allowSkip);
      } else {
        // No conditions = visible and respects allowSkip setting
        results[index] = {
          visible: true,
          skippable: step.allowSkip === true,
        };
      }
    });

    return results;
  }, [workflowConfig.steps, allStepEvaluations]);

  // Evaluate field-level conditions for the current step form (uses full field conditions)
  const fieldsWithConditions = useMemo(() => {
    if (!currentStep?.formConfig?.allFields) return {};

    const conditionsMap: Record<string, ConditionalBehavior | undefined> = {};
    for (const field of currentStep.formConfig.allFields) {
      if (field.conditions) {
        conditionsMap[field.id] = field.conditions;
      }
    }
    return conditionsMap;
  }, [currentStep?.formConfig?.allFields]);

  const fieldConditions = useMultipleConditionEvaluation(fieldsWithConditions, conditionData);

  // Helper functions for step-level conditions
  const isStepVisible = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return false;

      const stepCondition = allStepConditions[stepIndex];
      return stepCondition?.visible ?? true;
    },
    [allStepConditions, workflowConfig.steps.length]
  );

  const isStepSkippable = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return false;

      const stepCondition = allStepConditions[stepIndex];
      return stepCondition?.skippable ?? false;
    },
    [allStepConditions, workflowConfig.steps.length]
  );

  // Helper functions for field-level conditions (use full field condition system)
  const isFieldVisible = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition?.visible ?? true;
    },
    [fieldConditions]
  );

  const isFieldDisabled = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition?.disabled ?? false;
    },
    [fieldConditions]
  );

  const isFieldRequired = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition?.required ?? false;
    },
    [fieldConditions]
  );

  const isFieldReadonly = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition?.readonly ?? false;
    },
    [fieldConditions]
  );

  return {
    stepConditions,
    fieldConditions,
    allStepConditions,
    isStepVisible,
    isStepSkippable,
    isFieldVisible,
    isFieldDisabled,
    isFieldRequired,
    isFieldReadonly,
  };
}
