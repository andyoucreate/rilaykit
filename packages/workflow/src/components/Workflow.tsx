import type React from 'react';
import type { WorkflowProviderProps } from './WorkflowProvider';
import { WorkflowProvider } from './WorkflowProvider';

export type WorkflowProps = Omit<WorkflowProviderProps, 'children'> & {
  children: React.ReactNode;
};

/**
 * A wrapper component for the Rilay workflow system.
 * It simplifies the API by wrapping the WorkflowProvider and providing a clean,
 * component-based interface for building workflows.
 */
export function Workflow({ children, ...props }: WorkflowProps) {
  return <WorkflowProvider {...props}>{children}</WorkflowProvider>;
}

export default Workflow;
