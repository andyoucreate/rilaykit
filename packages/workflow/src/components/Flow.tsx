import type { WorkflowConfig } from '@rilaykit/core';
import type React from 'react';
import { useMemo } from 'react';
import { flow } from '../builders/flow';
import type { WorkflowProviderProps } from './WorkflowProvider';
import { WorkflowProvider } from './WorkflowProvider';

export type FlowProps = Omit<
  WorkflowProviderProps,
  'children' | 'workflowConfig' | 'defaultValues' | 'onWorkflowComplete'
> & {
  of: WorkflowConfig | flow;
  defaults?: Record<string, unknown>;
  onComplete?: WorkflowProviderProps['onWorkflowComplete'];
  children: React.ReactNode;
};

/**
 * Root component of the Rilay flow system.
 * Wraps WorkflowProvider with the compound-friendly API:
 * `of` accepts a built WorkflowConfig or a flow builder instance,
 * `defaults` seeds initial values and `onComplete` fires on workflow completion.
 */
function FlowRoot({ children, of, defaults, onComplete, ...props }: FlowProps) {
  const resolvedConfig = useMemo(() => (of instanceof flow ? of.build() : of), [of]);

  return (
    <WorkflowProvider
      {...props}
      workflowConfig={resolvedConfig}
      defaultValues={defaults}
      onWorkflowComplete={onComplete}
    >
      {children}
    </WorkflowProvider>
  );
}

export { FlowRoot };
