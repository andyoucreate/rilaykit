import type { WorkflowConfig } from '@rilaykit/core';
import type React from 'react';
import { useMemo } from 'react';
import { flow } from '../builders/flow';
import type { WorkflowProviderProps } from './WorkflowProvider';
import { WorkflowProvider } from './WorkflowProvider';

export type WorkflowProps = Omit<WorkflowProviderProps, 'children' | 'workflowConfig'> & {
  children: React.ReactNode;
  workflowConfig: WorkflowConfig | flow;
};

/**
 * A wrapper component for the Rilay workflow system.
 * It simplifies the API by wrapping the WorkflowProvider and providing a clean,
 * component-based interface for building workflows.
 * Accepts both WorkflowConfig and flow builder instances.
 */
export function Workflow({ children, workflowConfig, ...props }: WorkflowProps) {
  // Auto-build if it's a flow builder
  const resolvedWorkflowConfig = useMemo(() => {
    if (workflowConfig instanceof flow) {
      return workflowConfig.build();
    }

    return workflowConfig;
  }, [workflowConfig]);

  return (
    <WorkflowProvider {...props} workflowConfig={resolvedWorkflowConfig}>
      {children}
    </WorkflowProvider>
  );
}

export default Workflow;
