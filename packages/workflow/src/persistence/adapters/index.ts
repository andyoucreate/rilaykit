/**
 * @fileoverview Persistence adapters for Rilay workflows
 *
 * This module exports all available persistence adapters that implement
 * the WorkflowPersistenceAdapter interface. Each adapter provides a different
 * storage strategy for workflow data persistence.
 */
export { LocalStorageAdapter } from './localStorage';

// Re-export configuration types for convenience
export type { LocalStorageAdapterConfig, WorkflowPersistenceAdapter } from '../types';
