import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalStorageAdapter,
  MemoryAdapter,
  SessionStorageAdapter,
} from '../../src/persistence/adapters';
import type { WorkflowPersistenceData } from '../../src/types';

// Mock data for testing
const mockWorkflowData: WorkflowPersistenceData = {
  workflowId: 'test-workflow',
  currentStepIndex: 1,
  allData: { name: 'John', email: 'john@example.com' },
  metadata: {
    timestamp: Date.now(),
    version: '1.0.0',
    userId: 'user-123',
    sessionId: 'session-456',
  },
};

describe('Persistence Adapters', () => {
  describe('MemoryAdapter', () => {
    let adapter: MemoryAdapter;

    beforeEach(() => {
      adapter = new MemoryAdapter();
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('memory');
    });

    it('should save and load data correctly', async () => {
      const key = 'test-key';

      // Save data
      await adapter.save(key, mockWorkflowData);

      // Load data
      const loadedData = await adapter.load(key);
      expect(loadedData).toEqual(mockWorkflowData);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.load('non-existent');
      expect(result).toBeNull();
    });

    it('should check existence correctly', async () => {
      const key = 'test-key';

      expect(await adapter.exists(key)).toBe(false);

      await adapter.save(key, mockWorkflowData);
      expect(await adapter.exists(key)).toBe(true);
    });

    it('should remove data correctly', async () => {
      const key = 'test-key';

      await adapter.save(key, mockWorkflowData);
      expect(await adapter.exists(key)).toBe(true);

      await adapter.remove(key);
      expect(await adapter.exists(key)).toBe(false);
    });

    it('should list all keys', async () => {
      await adapter.save('key1', mockWorkflowData);
      await adapter.save('key2', mockWorkflowData);
      await adapter.save('key3', mockWorkflowData);

      const keys = await adapter.list();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should list keys with pattern matching', async () => {
      await adapter.save('workflow-1', mockWorkflowData);
      await adapter.save('workflow-2', mockWorkflowData);
      await adapter.save('form-1', mockWorkflowData);

      const workflowKeys = await adapter.list('workflow');
      expect(workflowKeys).toHaveLength(2);
      expect(workflowKeys).toContain('workflow-1');
      expect(workflowKeys).toContain('workflow-2');
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      // Save multiple items concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(
          adapter.save(`key-${i}`, { ...mockWorkflowData, workflowId: `workflow-${i}` })
        );
      }

      await Promise.all(promises);

      // Verify all items were saved
      const keys = await adapter.list();
      expect(keys).toHaveLength(10);
    });
  });

  describe('LocalStorageAdapter', () => {
    let adapter: LocalStorageAdapter;

    beforeEach(() => {
      // Mock localStorage
      const mockStorage: { [key: string]: string } = {};

      global.localStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
          }
        }),
        key: vi.fn((index: number) => Object.keys(mockStorage)[index] || null),
        get length() {
          return Object.keys(mockStorage).length;
        },
      };

      adapter = new LocalStorageAdapter();
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('localStorage');
    });

    it('should save and load data correctly', async () => {
      const key = 'test-key';

      await adapter.save(key, mockWorkflowData);

      const loadedData = await adapter.load(key);
      expect(loadedData).toEqual(mockWorkflowData);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.load('non-existent');
      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      // Manually set invalid JSON
      localStorage.setItem('invalid-json', 'invalid json');

      // The adapter should throw an error for invalid JSON
      await expect(adapter.load('invalid-json')).rejects.toThrow(
        'Failed to load from localStorage'
      );
    });

    it('should check existence correctly', async () => {
      const key = 'test-key';

      expect(await adapter.exists(key)).toBe(false);

      await adapter.save(key, mockWorkflowData);
      expect(await adapter.exists(key)).toBe(true);
    });

    it('should remove data correctly', async () => {
      const key = 'test-key';

      await adapter.save(key, mockWorkflowData);
      expect(await adapter.exists(key)).toBe(true);

      await adapter.remove(key);
      expect(await adapter.exists(key)).toBe(false);
    });

    it('should handle localStorage quota exceeded error', async () => {
      // Mock quota exceeded error
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      await expect(adapter.save('key', mockWorkflowData)).rejects.toThrow('QuotaExceededError');
    });
  });

  describe('SessionStorageAdapter', () => {
    let adapter: SessionStorageAdapter;

    beforeEach(() => {
      // Mock sessionStorage
      const mockStorage: { [key: string]: string } = {};

      global.sessionStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
          }
        }),
        key: vi.fn((index: number) => Object.keys(mockStorage)[index] || null),
        get length() {
          return Object.keys(mockStorage).length;
        },
      };

      adapter = new SessionStorageAdapter();
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('sessionStorage');
    });

    it('should save and load data correctly', async () => {
      const key = 'test-key';

      await adapter.save(key, mockWorkflowData);

      const loadedData = await adapter.load(key);
      expect(loadedData).toEqual(mockWorkflowData);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.load('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('Adapter Interface Compliance', () => {
    const adapters = [
      () => new MemoryAdapter(),
      () => new LocalStorageAdapter(),
      () => new SessionStorageAdapter(),
    ];

    const adapterNames = ['MemoryAdapter', 'LocalStorageAdapter', 'SessionStorageAdapter'];

    adapters.forEach((createAdapter, index) => {
      describe(`${adapterNames[index]} Interface Compliance`, () => {
        let adapter: any;

        beforeEach(() => {
          // Setup mocks for browser APIs if needed
          if (index === 1) {
            // LocalStorageAdapter
            const mockStorage: { [key: string]: string } = {};
            global.localStorage = {
              getItem: vi.fn((key: string) => mockStorage[key] || null),
              setItem: vi.fn((key: string, value: string) => {
                mockStorage[key] = value;
              }),
              removeItem: vi.fn((key: string) => {
                delete mockStorage[key];
              }),
              clear: vi.fn(),
              key: vi.fn(),
              get length() {
                return Object.keys(mockStorage).length;
              },
            };
          } else if (index === 2) {
            // SessionStorageAdapter
            const mockStorage: { [key: string]: string } = {};
            global.sessionStorage = {
              getItem: vi.fn((key: string) => mockStorage[key] || null),
              setItem: vi.fn((key: string, value: string) => {
                mockStorage[key] = value;
              }),
              removeItem: vi.fn((key: string) => {
                delete mockStorage[key];
              }),
              clear: vi.fn(),
              key: vi.fn(),
              get length() {
                return Object.keys(mockStorage).length;
              },
            };
          }

          adapter = createAdapter();
        });

        it('should have a name property', () => {
          expect(typeof adapter.name).toBe('string');
          expect(adapter.name.length).toBeGreaterThan(0);
        });

        it('should implement save method', () => {
          expect(typeof adapter.save).toBe('function');
        });

        it('should implement load method', () => {
          expect(typeof adapter.load).toBe('function');
        });

        it('should implement remove method', () => {
          expect(typeof adapter.remove).toBe('function');
        });

        it('should implement exists method', () => {
          expect(typeof adapter.exists).toBe('function');
        });

        it('should optionally implement list method', () => {
          if (adapter.list) {
            expect(typeof adapter.list).toBe('function');
          }
        });
      });
    });
  });
});
