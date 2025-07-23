/**
 * @fileoverview Main exports for Rilay workflows persistence system
 *
 * This module provides a complete persistence solution for workflows,
 * including adapters, utilities, and React hooks.
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

// React hooks
export { usePersistence } from '../hooks/usePersistence';
export type { UsePersistenceProps } from '../hooks/usePersistence';
