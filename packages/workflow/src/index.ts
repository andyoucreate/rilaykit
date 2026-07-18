// =============================================================================
// @rilaykit/workflow — ISOMORPHIC entry (safe in a React Server Component).
// Compound components (Flow, WorkflowProvider…), the React hooks, and the store
// selector/action hooks live behind `@rilaykit/workflow/react`, which carries
// the `'use client'` boundary. Nothing here imports React.
// =============================================================================

// Core workflow builder
export { flow, resolveWorkflowConfig } from './builders/flow';
export type { StepDefinition } from './builders/flow';

// Step context (for after callbacks)
export type { StepContext, StepMetadata } from './context/step-context';
export { createStepContext } from './context/step-context';

// Schema layer (JSON flow definitions)
export * from './schema';

// Vanilla store factory + types (imported from the vanilla file, NOT the ./stores
// barrel, which also re-exports the client-only hooks)
export * from './stores/workflowStore';

// Persistence system (adapters, utilities, types — the React usePersistence hook
// is on the /react entry)
export * from './persistence';

// Utility functions
export { combineWorkflowDataForConditions, flattenObject } from './utils/dataFlattening';
export { resolveAllowSkip } from './utils/resolveAllowSkip';
