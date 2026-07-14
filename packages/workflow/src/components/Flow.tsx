import type { WorkflowConfig } from '@rilaykit/core';
import type React from 'react';
import { useMemo } from 'react';
import { type flow, resolveWorkflowConfig } from '../builders/flow';
import { FlowBody } from './FlowBody';
import { FlowBack, FlowNext, FlowSkip } from './FlowNav';
import { FlowProgress } from './FlowProgress';
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
  const resolvedConfig = useMemo(() => resolveWorkflowConfig(of), [of]);

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

export const Flow = Object.assign(FlowRoot, {
  Body: FlowBody,
  Progress: FlowProgress,
  Next: FlowNext,
  Back: FlowBack,
  Skip: FlowSkip,
});

export default Flow;
