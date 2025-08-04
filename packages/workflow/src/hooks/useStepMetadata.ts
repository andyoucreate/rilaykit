import { useMemo } from 'react';
import { useWorkflowContext } from '../components/WorkflowProvider';

/**
 * Hook return type for step metadata access
 */
export interface UseStepMetadataReturn {
  /**
   * Metadata for the current step
   */
  current: Record<string, any> | undefined;

  /**
   * Get metadata for a specific step by ID
   * @param stepId - The ID of the step to get metadata for
   * @returns The metadata object or undefined if step not found
   */
  getByStepId: (stepId: string) => Record<string, any> | undefined;

  /**
   * Get metadata for a specific step by index
   * @param stepIndex - The index of the step to get metadata for
   * @returns The metadata object or undefined if step not found
   */
  getByStepIndex: (stepIndex: number) => Record<string, any> | undefined;

  /**
   * Check if current step has specific metadata key
   * @param key - The metadata key to check for
   * @returns True if the key exists in current step metadata
   */
  hasCurrentKey: (key: string) => boolean;

  /**
   * Get specific metadata value from current step
   * @param key - The metadata key to retrieve
   * @param defaultValue - Default value if key doesn't exist
   * @returns The metadata value or default value
   */
  getCurrentValue: <T = any>(key: string, defaultValue?: T) => T;

  /**
   * Get all steps with their metadata
   * @returns Array of objects containing step info and metadata
   */
  getAllStepsMetadata: () => Array<{
    id: string;
    title: string;
    index: number;
    metadata: Record<string, any> | undefined;
  }>;

  /**
   * Find steps by metadata criteria
   * @param predicate - Function to test each step's metadata
   * @returns Array of step IDs that match the criteria
   */
  findStepsByMetadata: (
    predicate: (
      metadata: Record<string, any> | undefined,
      stepId: string,
      stepIndex: number
    ) => boolean
  ) => string[];
}

/**
 * Hook to access and work with step metadata in workflows
 *
 * This hook provides convenient methods to access metadata for the current step
 * or any other step in the workflow. It's useful for UI customization, analytics,
 * business logic, and integration scenarios.
 *
 * @returns Object containing metadata access methods and current step metadata
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const {
 *     current,
 *     getCurrentValue,
 *     hasCurrentKey,
 *     getByStepId,
 *     findStepsByMetadata
 *   } = useStepMetadata();
 *
 *   // Access current step metadata
 *   const stepIcon = getCurrentValue('icon', 'default-icon');
 *   const hasAnalytics = hasCurrentKey('analytics');
 *
 *   // Find steps with specific metadata
 *   const importantSteps = findStepsByMetadata(
 *     (metadata) => metadata?.priority === 'high'
 *   );
 *
 *   // Get metadata from specific step
 *   const paymentStepMeta = getByStepId('payment-step');
 *
 *   return (
 *     <div>
 *       <Icon name={stepIcon} />
 *       {hasAnalytics && <AnalyticsTracker />}
 *       <p>Important steps: {importantSteps.length}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useStepMetadata(): UseStepMetadataReturn {
  const { workflowConfig, currentStep } = useWorkflowContext();

  // Memoize current step metadata
  const current = useMemo(() => {
    return currentStep?.metadata;
  }, [currentStep?.metadata]);

  // Memoize step lookup functions
  const getByStepId = useMemo(() => {
    return (stepId: string): Record<string, any> | undefined => {
      const step = workflowConfig.steps.find((s) => s.id === stepId);
      return step?.metadata;
    };
  }, [workflowConfig.steps]);

  const getByStepIndex = useMemo(() => {
    return (stepIndex: number): Record<string, any> | undefined => {
      const step = workflowConfig.steps[stepIndex];
      return step?.metadata;
    };
  }, [workflowConfig.steps]);

  // Helper functions for current step
  const hasCurrentKey = useMemo(() => {
    return (key: string): boolean => {
      return current ? key in current : false;
    };
  }, [current]);

  const getCurrentValue = useMemo(() => {
    return <T = any>(key: string, defaultValue?: T): T => {
      if (current && key in current) {
        return current[key] as T;
      }
      return defaultValue as T;
    };
  }, [current]);

  // Get all steps with metadata
  const getAllStepsMetadata = useMemo(() => {
    return (): Array<{
      id: string;
      title: string;
      index: number;
      metadata: Record<string, any> | undefined;
    }> => {
      return workflowConfig.steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        index,
        metadata: step.metadata,
      }));
    };
  }, [workflowConfig.steps]);

  // Find steps by metadata predicate
  const findStepsByMetadata = useMemo(() => {
    return (
      predicate: (
        metadata: Record<string, any> | undefined,
        stepId: string,
        stepIndex: number
      ) => boolean
    ): string[] => {
      return workflowConfig.steps
        .map((step, index) => ({ step, index }))
        .filter(({ step, index }) => predicate(step.metadata, step.id, index))
        .map(({ step }) => step.id);
    };
  }, [workflowConfig.steps]);

  return {
    current,
    getByStepId,
    getByStepIndex,
    hasCurrentKey,
    getCurrentValue,
    getAllStepsMetadata,
    findStepsByMetadata,
  };
}
