// Core workflow builder
export { flow, resolveWorkflowConfig } from './builders/flow';
export type { StepDefinition } from './builders/flow';

// Step context (for after callbacks)
export type { StepContext, StepMetadata } from './context/step-context';
export { createStepContext } from './context/step-context';

// Components
export { FlowRoot as Flow } from './components/Flow';
export type { FlowProps } from './components/Flow';
export { FlowBody } from './components/FlowBody';
export type { FlowBodyProps } from './components/FlowBody';
export { WorkflowNextButton } from './components/WorkflowNextButton';
export { WorkflowPreviousButton } from './components/WorkflowPreviousButton';
export { useWorkflowContext, WorkflowProvider } from './components/WorkflowProvider';
export { WorkflowSkipButton } from './components/WorkflowSkipButton';
export { WorkflowStepper } from './components/WorkflowStepper';

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
