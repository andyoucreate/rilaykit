/**
 * Utility functions for handling nested data structures in workflows
 * and making them compatible with condition evaluation
 */

/**
 * Flattens a nested object into a flat object with dot-notation keys
 *
 * @param obj - The nested object to flatten
 * @param prefix - The prefix to use for keys (used internally for recursion)
 * @returns A flattened object with dot-notation keys
 *
 * @example
 * ```typescript
 * const nested = {
 *   products: { requestedProducts: ['health'] },
 *   user: { profile: { name: 'John' } }
 * };
 *
 * const flat = flattenObject(nested);
 * // Result: {
 * //   'products.requestedProducts': ['health'],
 * //   'user.profile.name': 'John'
 * // }
 * ```
 */
export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const key in obj) {
    if (key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        // Recursively flatten nested objects, but preserve arrays and dates
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Keep primitive values, arrays, dates, and null as-is
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
}

/**
 * Combines workflow data from different sources and flattens them for condition evaluation
 *
 * @param allData - Global workflow data (usually from defaultValues)
 * @param stepData - Step-specific data
 * @returns Combined and flattened data ready for condition evaluation
 */
export function combineWorkflowDataForConditions(
  allData: Record<string, any>,
  stepData: Record<string, any>
): Record<string, any> {
  // First, combine the data with stepData taking precedence
  const combined = {
    ...allData,
    ...stepData,
  };

  // Then flatten the combined data to make it compatible with dot-notation conditions
  const flattened = flattenObject(combined);

  // Also include the original nested structure for backward compatibility
  return {
    ...combined,
    ...flattened,
  };
}

/**
 * Extracts step-specific data from a nested workflow data structure
 *
 * @param workflowData - The complete workflow data
 * @param stepId - The ID of the step to extract data for
 * @returns The data specific to the given step
 */
export function extractStepData(
  workflowData: Record<string, any>,
  stepId: string
): Record<string, any> {
  return workflowData[stepId] || {};
}

/**
 * Merges step data back into the workflow data structure
 *
 * @param workflowData - The existing workflow data
 * @param stepId - The ID of the step
 * @param stepData - The data to merge for this step
 * @returns Updated workflow data with the step data merged
 */
export function mergeStepData(
  workflowData: Record<string, any>,
  stepId: string,
  stepData: Record<string, any>
): Record<string, any> {
  return {
    ...workflowData,
    [stepId]: {
      ...(workflowData[stepId] || {}),
      ...stepData,
    },
  };
}
