import type { ConditionalBehavior, StepConfig, WorkflowConfig } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import {
  type ConditionEvaluationResult,
  useConditionEvaluation,
  useMultipleConditionEvaluation,
} from './useConditionEvaluation';
import type { WorkflowState } from './useWorkflowState';

export interface UseWorkflowConditionsProps {
  workflowConfig: WorkflowConfig;
  workflowState: WorkflowState;
  currentStep: StepConfig;
}

export interface UseWorkflowConditionsReturn {
  stepConditions: ConditionEvaluationResult;
  fieldConditions: Record<string, ConditionEvaluationResult>;
  allStepConditions: Record<number, ConditionEvaluationResult>;
  isStepVisible: (stepIndex: number) => boolean;
  isStepSkippable: (stepIndex: number) => boolean;
  isStepDisabled: (stepIndex: number) => boolean;
  isFieldVisible: (fieldId: string) => boolean;
  isFieldDisabled: (fieldId: string) => boolean;
  isFieldRequired: (fieldId: string) => boolean;
  isFieldReadonly: (fieldId: string) => boolean;
}

/**
 * Hook to manage conditional behaviors for workflow steps and fields
 *
 * This hook evaluates conditions for steps and form fields within a workflow,
 * providing convenient methods to check step and field states based on conditions.
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
  const stepConditions = useConditionEvaluation(currentStep?.conditions, conditionData, {
    visible: true,
    disabled: false,
    required: false, // For steps, "required" means "not skippable"
    readonly: false,
  });

  // Pre-evaluate all steps conditions to avoid hook violations in callbacks
  const allStepConditions = useMemo(() => {
    const results: Record<number, ConditionEvaluationResult> = {};

    workflowConfig.steps.forEach((step, index) => {
      if (step.conditions) {
        // We can't use hooks here, so we'll need a different approach
        // For now, we'll create a basic evaluation structure
        results[index] = {
          visible: true,
          disabled: false,
          required: false, // For steps, this controls if step can be skipped
          readonly: false,
        };
      } else {
        results[index] = {
          visible: true,
          disabled: false,
          required: false,
          readonly: false,
        };
      }
    });

    return results;
  }, [workflowConfig.steps]);

  // Evaluate field-level conditions for the current step form
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

  const isStepDisabled = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return true;

      const stepCondition = allStepConditions[stepIndex];
      return stepCondition?.disabled ?? false;
    },
    [allStepConditions, workflowConfig.steps.length]
  );

  const isStepSkippable = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex < 0 || stepIndex >= workflowConfig.steps.length) return false;

      const step = workflowConfig.steps[stepIndex];
      const stepCondition = allStepConditions[stepIndex];

      // Si l'étape est marquée comme "required" par les conditions, elle n'est pas skippable
      if (stepCondition?.required) return false;

      // Check allowSkip property
      return step?.allowSkip === true;
    },
    [allStepConditions, workflowConfig.steps]
  );

  // Helper functions for field-level conditions
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
    isStepDisabled,
    isFieldVisible,
    isFieldDisabled,
    isFieldRequired,
    isFieldReadonly,
  };
}
