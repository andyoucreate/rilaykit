/**
 * @fileoverview Main exports for Rilay workflows persistence system
 *
 * ISOMORPHIC: adapters, utilities, and types — safe in a server component. The
 * React `usePersistence` hook (and its `UsePersistenceProps`) live in ../hooks,
 * re-exported from the `/react` entry.
 */

// Core types and interfaces
export type {
  LocalStorageAdapterConfig,
  PersistedWorkflowData,
  PersistenceOptions,
  UsePersistenceReturn,
  WorkflowPersistenceAdapter,
} from './types';

export { WorkflowPersistenceError } from './types';

// Adapters
export { LocalStorageAdapter } from './adapters/localStorage';

// Utilities
export {
  debounce,
  generateStorageKey,
  mergePersistedState,
  persistedToWorkflowState,
  validatePersistedData,
  workflowStateToPersisted,
} from './utils';
