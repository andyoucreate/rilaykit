// Core workflow builder
export { flow, resolveWorkflowConfig } from './builders/flow';
export type { StepDefinition } from './builders/flow';

// Step context (for after callbacks)
export type { StepContext, StepMetadata } from './context/step-context';
export { createStepContext } from './context/step-context';

// Components
export { Flow } from './components/Flow';
export type { FlowProps } from './components/Flow';
export { FlowBody } from './components/FlowBody';
export type { FlowBodyProps } from './components/FlowBody';
export { FlowBack, FlowNext, FlowSkip } from './components/FlowNav';
export type { FlowNavContext, FlowNavProps } from './components/FlowNav';
export { FlowProgress } from './components/FlowProgress';
export type { FlowProgressProps } from './components/FlowProgress';
export { useFlow, WorkflowProvider } from './components/WorkflowProvider';

// Schema layer (JSON flow definitions)
export * from './schema';

// Hooks
export * from './hooks';

// Stores (Zustand)
export * from './stores';

// Persistence system
export * from './persistence';

// Component types
export type { WorkflowContextValue } from './components/WorkflowProvider';

// Utility functions
export { combineWorkflowDataForConditions, flattenObject } from './utils/dataFlattening';
export { resolveAllowSkip } from './utils/resolveAllowSkip';
