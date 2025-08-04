/**
 * @fileoverview Tests for LocalStorage persistence adapter
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter } from '../../../src/persistence/adapters/localStorage';
import type { PersistedWorkflowData } from '../../../src/persistence/types';
import { WorkflowPersistenceError } from '../../../src/persistence/types';

// Mock localStorage
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    // Helper to reset the store
    _resetStore: () => {
      store = {};
    },
    // Helper to get the store
    _getStore: () => store,
  };
};

let mockLocalStorage = createMockLocalStorage();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  const testKey = 'test-workflow';
  const testData: PersistedWorkflowData = {
    workflowId: 'test-workflow',
    currentStepIndex: 1,
    allData: { step1: { name: 'John' } },
    stepData: { email: 'john@example.com' },
    visitedSteps: ['step1'],
    lastSaved: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock localStorage for each test
    mockLocalStorage = createMockLocalStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    adapter = new LocalStorageAdapter();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(() => new LocalStorageAdapter()).not.toThrow();
    });

    it('should initialize with custom config', () => {
      const customAdapter = new LocalStorageAdapter({
        keyPrefix: 'custom_',
        compress: true,
        maxAge: 60000,
      });

      expect(customAdapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should handle gracefully when localStorage is not available', async () => {
      // Create a fresh mock that throws on access
      const brokenMockStorage = {
        ...mockLocalStorage,
        setItem: vi.fn(() => {
          throw new Error('localStorage not available');
        }),
        getItem: vi.fn(() => {
          throw new Error('localStorage not available');
        }),
        removeItem: vi.fn(() => {
          throw new Error('localStorage not available');
        }),
      };

      Object.defineProperty(window, 'localStorage', {
        value: brokenMockStorage,
        writable: true,
      });

      // Should not throw error but handle gracefully
      const adapter = new LocalStorageAdapter();
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);

      // Operations should not throw but should handle gracefully
      await expect(adapter.save(testKey, testData)).resolves.toBeUndefined();
      await expect(adapter.load(testKey)).resolves.toBeNull();
      await expect(adapter.remove(testKey)).resolves.toBeUndefined();
      expect(await adapter.exists(testKey)).toBe(false);
    });
  });

  describe('save', () => {
    it('should save data to localStorage', async () => {
      await adapter.save(testKey, testData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `rilay_workflow_${testKey}`,
        expect.any(String)
      );
    });

    it('should save data with custom prefix', async () => {
      const customAdapter = new LocalStorageAdapter({ keyPrefix: 'custom_' });
      await customAdapter.save(testKey, testData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `custom_${testKey}`,
        expect.any(String)
      );
    });

    it('should handle quota exceeded error', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';

      // Mock setItem to always throw QuotaExceededError (even on retry)
      mockLocalStorage.setItem.mockImplementation(() => {
        throw quotaError;
      });

      await expect(adapter.save(testKey, testData)).rejects.toThrow(WorkflowPersistenceError);
    });

    it('should handle other save errors', async () => {
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      await expect(adapter.save(testKey, testData)).rejects.toThrow(WorkflowPersistenceError);
    });
  });

  describe('load', () => {
    it('should load saved data', async () => {
      await adapter.save(testKey, testData);
      const loaded = await adapter.load(testKey);

      expect(loaded).toMatchObject({
        workflowId: testData.workflowId,
        currentStepIndex: testData.currentStepIndex,
        allData: testData.allData,
        stepData: testData.stepData,
        visitedSteps: testData.visitedSteps,
      });
    });

    it('should return null for non-existent data', async () => {
      const loaded = await adapter.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('should handle corrupted data', async () => {
      const store = mockLocalStorage._getStore();
      store[`rilay_workflow_${testKey}`] = 'invalid-json';

      await expect(adapter.load(testKey)).rejects.toThrow(WorkflowPersistenceError);
    });

    it('should handle expired data', async () => {
      const expiredAdapter = new LocalStorageAdapter({ maxAge: 1 });
      await expiredAdapter.save(testKey, testData);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const loaded = await expiredAdapter.load(testKey);
      expect(loaded).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove data from localStorage', async () => {
      await adapter.save(testKey, testData);
      await adapter.remove(testKey);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(`rilay_workflow_${testKey}`);
    });

    it('should handle remove errors gracefully', async () => {
      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('Remove error');
      });

      await expect(adapter.remove(testKey)).rejects.toThrow(WorkflowPersistenceError);
    });
  });

  describe('exists', () => {
    it('should return true for existing data', async () => {
      await adapter.save(testKey, testData);
      const exists = await adapter.exists(testKey);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent data', async () => {
      const exists = await adapter.exists('non-existent');
      expect(exists).toBe(false);
    });

    it('should return false for expired data', async () => {
      const expiredAdapter = new LocalStorageAdapter({ maxAge: 1 });
      await expiredAdapter.save(testKey, testData);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const exists = await expiredAdapter.exists(testKey);
      expect(exists).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('should list all workflow keys', async () => {
      await adapter.save('workflow1', testData);
      await adapter.save('workflow2', { ...testData, workflowId: 'workflow2' });

      const keys = await adapter.listKeys();
      expect(keys).toContain('workflow1');
      expect(keys).toContain('workflow2');
    });

    it('should only list valid keys', async () => {
      await adapter.save('valid', testData);
      const store = mockLocalStorage._getStore();
      store.rilay_workflow_invalid = 'corrupted-data';

      const keys = await adapter.listKeys();
      expect(keys).toContain('valid');
      expect(keys).not.toContain('invalid');
    });
  });

  describe('clear', () => {
    it('should clear all workflow data', async () => {
      await adapter.save('workflow1', testData);
      await adapter.save('workflow2', { ...testData, workflowId: 'workflow2' });

      await adapter.clear();

      const keys = await adapter.listKeys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('data compression', () => {
    it('should compress data when enabled', async () => {
      const compressedAdapter = new LocalStorageAdapter({ compress: true });

      await compressedAdapter.save(testKey, testData);
      const loaded = await compressedAdapter.load(testKey);

      expect(loaded).toMatchObject({
        workflowId: testData.workflowId,
        currentStepIndex: testData.currentStepIndex,
      });
    });

    it('should handle compression errors gracefully', async () => {
      const compressedAdapter = new LocalStorageAdapter({ compress: true });

      // Mock btoa to throw error
      const originalBtoa = global.btoa;
      global.btoa = vi.fn(() => {
        throw new Error('Compression error');
      });

      await expect(compressedAdapter.save(testKey, testData)).rejects.toThrow(
        WorkflowPersistenceError
      );

      global.btoa = originalBtoa;
    });
  });
});
