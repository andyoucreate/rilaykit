import type { ConditionalBehavior, FormConfiguration } from '@rilaykit/core';
import { useCallback, useMemo } from 'react';
import {
  type ConditionEvaluationResult,
  useMultipleConditionEvaluation,
} from './useConditionEvaluation';

export interface UseFormConditionsProps {
  formConfig: FormConfiguration;
  formValues: Record<string, any>;
}

export interface UseFormConditionsReturn {
  fieldConditions: Record<string, ConditionEvaluationResult>;
  hasConditionalFields: boolean;
  getFieldCondition: (fieldId: string) => ConditionEvaluationResult | undefined;
  isFieldVisible: (fieldId: string) => boolean;
  isFieldDisabled: (fieldId: string) => boolean;
  isFieldRequired: (fieldId: string) => boolean;
  isFieldReadonly: (fieldId: string) => boolean;
}

/**
 * Hook to manage conditional behaviors for form fields
 *
 * This hook evaluates conditions for all form fields and provides
 * convenient methods to check field states.
 *
 * @param props - Configuration for form conditions
 * @returns Object containing field conditions and helper methods
 *
 * @example
 * ```tsx
 * const {
 *   fieldConditions,
 *   isFieldVisible,
 *   isFieldDisabled
 * } = useFormConditions({
 *   formConfig,
 *   formValues
 * });
 *
 * // Check if a field should be visible
 * if (!isFieldVisible('phoneField')) {
 *   return null;
 * }
 * ```
 */
export function useFormConditions({
  formConfig,
  formValues,
}: UseFormConditionsProps): UseFormConditionsReturn {
  // Create field conditions map for evaluation - memoize to avoid recreating on every render
  const fieldsWithConditions = useMemo(() => {
    const conditionsMap: Record<string, ConditionalBehavior | undefined> = {};
    for (const field of formConfig.allFields) {
      if (field.conditions) {
        conditionsMap[field.id] = field.conditions;
      }
    }
    return conditionsMap;
  }, [formConfig.allFields]);

  // Check if form has any conditional fields - memoize for performance
  const hasConditionalFields = useMemo(() => {
    return Object.keys(fieldsWithConditions).length > 0;
  }, [fieldsWithConditions]);

  // Evaluate conditions for all fields - only if there are conditional fields
  const fieldConditions = useMultipleConditionEvaluation(
    hasConditionalFields ? fieldsWithConditions : {},
    hasConditionalFields ? formValues : {}
  );

  // Helper function to get condition result for a specific field
  const getFieldCondition = useCallback(
    (fieldId: string): ConditionEvaluationResult | undefined => {
      return fieldConditions[fieldId];
    },
    [fieldConditions]
  );

  // Helper function to check if field is visible
  const isFieldVisible = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition ? condition.visible : true;
    },
    [fieldConditions]
  );

  // Helper function to check if field is disabled
  const isFieldDisabled = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition ? condition.disabled : false;
    },
    [fieldConditions]
  );

  // Helper function to check if field is required
  const isFieldRequired = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition ? condition.required : false;
    },
    [fieldConditions]
  );

  // Helper function to check if field is readonly
  const isFieldReadonly = useCallback(
    (fieldId: string): boolean => {
      const condition = fieldConditions[fieldId];
      return condition ? condition.readonly : false;
    },
    [fieldConditions]
  );

  return useMemo(
    () => ({
      fieldConditions,
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    }),
    [
      fieldConditions,
      hasConditionalFields,
      getFieldCondition,
      isFieldVisible,
      isFieldDisabled,
      isFieldRequired,
      isFieldReadonly,
    ]
  );
}
