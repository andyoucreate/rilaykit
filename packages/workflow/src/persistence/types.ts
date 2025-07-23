/**
 * @fileoverview Persistence system types for Rilay workflows
 *
 * This module defines the core interfaces and types for the workflow persistence system.
 * It provides a flexible adapter pattern allowing different persistence strategies:
 * - localStorage persistence
 * - API-based persistence
 * - Custom persistence implementations
 *
 * The system is designed to be type-safe and extensible while maintaining
 * a simple API for common use cases.
 */

import type { WorkflowState } from '../hooks/useWorkflowState';

/**
 * Persistent workflow data that gets saved/loaded
 */
export interface PersistedWorkflowData {
  /** Unique identifier for the workflow */
  workflowId: string;
  /** Current step index in the workflow */
  currentStepIndex: number;
  /** All collected data across steps */
  allData: Record<string, any>;
  /** Currently active step data */
  stepData: Record<string, any>;
  /** Set of visited step IDs */
  visitedSteps: string[];
  /** When this data was last saved */
  lastSaved: number;
  /** Optional metadata for custom persistence needs */
  metadata?: Record<string, any>;
}

/**
 * Options for persistence operations
 */
export interface PersistenceOptions {
  /** Whether to automatically persist on state changes */
  autoPersist?: boolean;
  /** Debounce delay in ms for auto-persistence (default: 500ms) */
  debounceMs?: number;
  /** Custom key for storage (overrides default) */
  storageKey?: string;
  /** Additional metadata to include in persisted data */
  metadata?: Record<string, any>;
}

/**
 * Core persistence adapter interface
 *
 * All persistence implementations must implement this interface.
 * It provides a consistent API regardless of the underlying storage mechanism.
 */
export interface WorkflowPersistenceAdapter {
  /**
   * Save workflow data
   * @param key - Unique identifier for the stored data
   * @param data - Workflow data to persist
   * @returns Promise that resolves when save is complete
   */
  save(key: string, data: PersistedWorkflowData): Promise<void>;

  /**
   * Load workflow data
   * @param key - Unique identifier for the stored data
   * @returns Promise that resolves to persisted data or null if not found
   */
  load(key: string): Promise<PersistedWorkflowData | null>;

  /**
   * Remove persisted workflow data
   * @param key - Unique identifier for the stored data
   * @returns Promise that resolves when deletion is complete
   */
  remove(key: string): Promise<void>;

  /**
   * Check if data exists for the given key
   * @param key - Unique identifier to check
   * @returns Promise that resolves to true if data exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * List all available keys (optional, for debugging/admin)
   * @returns Promise that resolves to array of available keys
   */
  listKeys?(): Promise<string[]>;

  /**
   * Clear all persisted data (optional, for cleanup)
   * @returns Promise that resolves when all data is cleared
   */
  clear?(): Promise<void>;
}

/**
 * Configuration for localStorage persistence adapter
 */
export interface LocalStorageAdapterConfig {
  /** Prefix for localStorage keys (default: 'rilay_workflow_') */
  keyPrefix?: string;
  /** Whether to compress data before storage */
  compress?: boolean;
  /** Maximum age in ms before data expires (optional) */
  maxAge?: number;
}

/**
 * Error types for persistence operations
 */
export class WorkflowPersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(`[WorkflowPersistence] ${message} (Code: ${code})`);
    this.name = 'WorkflowPersistenceError';
  }
}

/**
 * Persistence hook return type
 */
export interface UsePersistenceReturn {
  /** Whether persistence is currently saving */
  isPersisting: boolean;
  /** Last persistence error (if any) */
  persistenceError: WorkflowPersistenceError | null;
  /** Manually trigger a save operation */
  persistNow: () => Promise<void>;
  /** Load data from persistence */
  loadPersistedData: () => Promise<PersistedWorkflowData | null>;
  /** Clear persisted data */
  clearPersistedData: () => Promise<void>;
  /** Whether persisted data exists */
  hasPersistedData: () => Promise<boolean>;
}

/**
 * Workflow state with persistence integration
 */
export interface PersistedWorkflowState extends WorkflowState {
  /** Persistence status */
  persistence?: {
    /** Whether data is being persisted */
    isPersisting: boolean;
    /** Last successful save timestamp */
    lastSaved?: number;
    /** Current persistence error */
    error?: WorkflowPersistenceError;
  };
}
