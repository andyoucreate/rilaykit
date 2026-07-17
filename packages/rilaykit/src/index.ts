// =============================================================================
// rilaykit — ISOMORPHIC entry (safe in a React Server Component).
//
// Re-exports only the isomorphic surfaces of core / forms / workflow / agent.
// React components and hooks (Form, Flow, WorkflowProvider, Catalog, Part, the
// field/flow hooks…) live behind `rilaykit/react`, which carries the
// `'use client'` boundary — mirroring each package's own main/react split.
// =============================================================================

// @rilaykit/core — isomorphic surface
export * from '@rilaykit/core';

// @rilaykit/forms — isomorphic surface (builders, vanilla store, utils, schema)
export * from '@rilaykit/forms';

// @rilaykit/workflow — isomorphic surface, selective to avoid conflicts with forms
export {
  // Builder
  flow,
  resolveWorkflowConfig,
  // Schema layer (JSON flow definitions)
  compileFlow,
  isFlowSchema,
  validateFlowSchema,
  // Persistence (adapters, utilities — the usePersistence hook is on /react)
  LocalStorageAdapter,
  WorkflowPersistenceError,
  debounce,
  generateStorageKey,
  mergePersistedState,
  persistedToWorkflowState,
  validatePersistedData,
  workflowStateToPersisted,
  // Utils
  combineWorkflowDataForConditions,
  flattenObject,
  resolveAllowSkip,
} from '@rilaykit/workflow';
export type {
  StepDefinition,
  StepContext,
  StepMetadata,
  AfterValidationHandler,
  AllowSkipPredicate,
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaResult,
  FlowSchemaStep,
  WorkflowStore,
  WorkflowStoreState,
  LocalStorageAdapterConfig,
  PersistedWorkflowData,
  PersistenceOptions,
  UsePersistenceReturn,
  WorkflowPersistenceAdapter,
} from '@rilaykit/workflow';

// @rilaykit/agent — isomorphic surface (Part types/guards, uiTools, manifest,
// parsePartialJson, ComponentNode, emission errors). React components (Catalog,
// Part, Parts) live behind `rilaykit/react`.
export * from '@rilaykit/agent';

// =============================================================================
// Enhanced ril — overrides @rilaykit/core's ril with .form() and .flow()
// =============================================================================
export { ril, type RilayKit } from './create-ril';
