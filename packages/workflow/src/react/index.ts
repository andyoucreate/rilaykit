'use client';

// Compound components
export { Flow } from '../components/Flow';
export type { FlowProps } from '../components/Flow';
export { FlowBody } from '../components/FlowBody';
export type { FlowBodyProps } from '../components/FlowBody';
export { FlowBack, FlowNext, FlowSkip } from '../components/FlowNav';
export type { FlowNavContext, FlowNavProps } from '../components/FlowNav';
export { FlowProgress } from '../components/FlowProgress';
export type { FlowProgressProps } from '../components/FlowProgress';
export { useFlow, WorkflowProvider } from '../components/WorkflowProvider';
export type { WorkflowContextValue } from '../components/WorkflowProvider';
// The lifecycle channel type for the `onComplete(data, meta)` second argument.
export type { WorkflowCompletionMeta } from '../hooks/workflow-state';

// React context + selector/action hooks (createWorkflowStore is also re-exported
// from the isomorphic entry; harmless here for client-only consumers)
export * from '../stores';

// Custom hooks (usePersistence, useStep, useFlowSteps, condition/analytics hooks…)
export * from '../hooks';
