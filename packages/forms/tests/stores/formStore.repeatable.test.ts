import type { RepeatableFieldConfig } from '@rilaykit/core';
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFormStore } from '../../src/stores/formStore';

// =================================================================
// HELPERS
// =================================================================

function createItemsConfig(overrides?: Partial<RepeatableFieldConfig>): RepeatableFieldConfig {
  return {
    id: 'items',
    rows: [
      {
        kind: 'fields' as const,
        id: 'row-items',
        fields: [
          { id: 'name', componentId: 'text', props: { label: 'Name' } },
          { id: 'qty', componentId: 'number', props: { label: 'Qty' } },
        ],
      },
    ],
    allFields: [
      { id: 'name', componentId: 'text', props: { label: 'Name' } },
      { id: 'qty', componentId: 'number', props: { label: 'Qty' } },
    ],
    defaultValue: { name: '', qty: 1 },
    ...overrides,
  };
}

function setupStore(config?: RepeatableFieldConfig) {
  const store = createFormStore({ customerName: 'John' });
  const repeatableConfig = config ?? createItemsConfig();

  act(() => {
    store.getState()._setRepeatableConfig('items', repeatableConfig);
  });

  return store;
}

// =================================================================
// TESTS
// =================================================================

describe('FormStore — Repeatable Fields', () => {
  describe('_setRepeatableConfig', () => {
    it('should register a repeatable config', () => {
      const store = setupStore();
      const state = store.getState();

      expect(state._repeatableConfigs.items).toBeDefined();
      expect(state._repeatableConfigs.items.id).toBe('items');
    });
  });

  describe('_appendRepeatableItem', () => {
    it('should append an item with default values', () => {
      const store = setupStore();

      let key: string | null;
      act(() => {
        key = store.getState()._appendRepeatableItem('items');
      });

      const state = store.getState();
      expect(key!).toBe('k0');
      expect(state._repeatableOrder.items).toEqual(['k0']);
      expect(state._repeatableNextKey.items).toBe(1);
      expect(state.values['items[k0].name']).toBe('');
      expect(state.values['items[k0].qty']).toBe(1);
    });

    it('should append multiple items with incrementing keys', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
      });

      const state = store.getState();
      expect(state._repeatableOrder.items).toEqual(['k0', 'k1', 'k2']);
      expect(state._repeatableNextKey.items).toBe(3);
    });

    it('should use provided default value', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'Widget', qty: 5 });
      });

      const state = store.getState();
      expect(state.values['items[k0].name']).toBe('Widget');
      expect(state.values['items[k0].qty']).toBe(5);
    });

    it('should respect max constraint', () => {
      const store = setupStore(createItemsConfig({ max: 2 }));

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
      });

      let result: string | null;
      act(() => {
        result = store.getState()._appendRepeatableItem('items');
      });

      expect(result!).toBeNull();
      expect(store.getState()._repeatableOrder.items).toHaveLength(2);
    });

    it('should return null for unknown repeatable', () => {
      const store = setupStore();

      let result: string | null;
      act(() => {
        result = store.getState()._appendRepeatableItem('unknown');
      });

      expect(result!).toBeNull();
    });

    it('should mark form as dirty', () => {
      const store = setupStore();
      expect(store.getState().isDirty).toBe(false);

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      expect(store.getState().isDirty).toBe(true);
    });

    it('should preserve existing static values', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      expect(store.getState().values.customerName).toBe('John');
    });
  });

  describe('_removeRepeatableItem', () => {
    it('should remove an item by key', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
      });

      let success: boolean;
      act(() => {
        success = store.getState()._removeRepeatableItem('items', 'k0');
      });

      expect(success!).toBe(true);
      expect(store.getState()._repeatableOrder.items).toEqual(['k1']);
    });

    it('should clean up store entries for removed item', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._setValue('items[k0].name', 'Widget');
        store.getState()._setTouched('items[k0].name');
        store.getState()._setErrors('items[k0].name', [{ message: 'Error' }]);
      });

      act(() => {
        store.getState()._removeRepeatableItem('items', 'k0');
      });

      const state = store.getState();
      expect(state.values['items[k0].name']).toBeUndefined();
      expect(state.values['items[k0].qty']).toBeUndefined();
      expect(state.touched['items[k0].name']).toBeUndefined();
      expect(state.errors['items[k0].name']).toBeUndefined();
    });

    it('should respect min constraint', () => {
      const store = setupStore(createItemsConfig({ min: 1 }));

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      let success: boolean;
      act(() => {
        success = store.getState()._removeRepeatableItem('items', 'k0');
      });

      expect(success!).toBe(false);
      expect(store.getState()._repeatableOrder.items).toHaveLength(1);
    });

    it('should return false for unknown key', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      let success: boolean;
      act(() => {
        success = store.getState()._removeRepeatableItem('items', 'k99');
      });

      expect(success!).toBe(false);
    });

    it('should not re-key remaining items', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'A', qty: 1 });
        store.getState()._appendRepeatableItem('items', { name: 'B', qty: 2 });
        store.getState()._appendRepeatableItem('items', { name: 'C', qty: 3 });
      });

      // Remove middle item
      act(() => {
        store.getState()._removeRepeatableItem('items', 'k1');
      });

      const state = store.getState();
      expect(state._repeatableOrder.items).toEqual(['k0', 'k2']);
      // k0 values unchanged
      expect(state.values['items[k0].name']).toBe('A');
      // k2 values unchanged (not re-keyed to k1)
      expect(state.values['items[k2].name']).toBe('C');
    });
  });

  describe('_moveRepeatableItem', () => {
    it('should reorder items', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'A', qty: 1 });
        store.getState()._appendRepeatableItem('items', { name: 'B', qty: 2 });
        store.getState()._appendRepeatableItem('items', { name: 'C', qty: 3 });
      });

      act(() => {
        store.getState()._moveRepeatableItem('items', 0, 2);
      });

      expect(store.getState()._repeatableOrder.items).toEqual(['k1', 'k2', 'k0']);
    });

    it('should not change store values when moving', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'A', qty: 1 });
        store.getState()._appendRepeatableItem('items', { name: 'B', qty: 2 });
      });

      act(() => {
        store.getState()._moveRepeatableItem('items', 0, 1);
      });

      // Values are unchanged — only the order array changes
      expect(store.getState().values['items[k0].name']).toBe('A');
      expect(store.getState().values['items[k1].name']).toBe('B');
    });

    it('should ignore invalid indices', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
      });

      act(() => {
        store.getState()._moveRepeatableItem('items', -1, 0);
        store.getState()._moveRepeatableItem('items', 0, 5);
        store.getState()._moveRepeatableItem('items', 0, 0);
      });

      // Order unchanged
      expect(store.getState()._repeatableOrder.items).toEqual(['k0', 'k1']);
    });

    it('should ignore unknown repeatable', () => {
      const store = setupStore();

      act(() => {
        store.getState()._moveRepeatableItem('unknown', 0, 1);
      });

      // No crash
      expect(true).toBe(true);
    });
  });

  describe('_insertRepeatableItem', () => {
    it('should insert at specific index', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'A', qty: 1 });
        store.getState()._appendRepeatableItem('items', { name: 'C', qty: 3 });
      });

      act(() => {
        store.getState()._insertRepeatableItem('items', 1, { name: 'B', qty: 2 });
      });

      const state = store.getState();
      expect(state._repeatableOrder.items).toEqual(['k0', 'k2', 'k1']);
      expect(state.values['items[k2].name']).toBe('B');
    });

    it('should insert at beginning', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items', { name: 'B', qty: 2 });
      });

      act(() => {
        store.getState()._insertRepeatableItem('items', 0, { name: 'A', qty: 1 });
      });

      expect(store.getState()._repeatableOrder.items).toEqual(['k1', 'k0']);
    });

    it('should clamp index to valid range', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      act(() => {
        store.getState()._insertRepeatableItem('items', 100, { name: 'End', qty: 0 });
      });

      expect(store.getState()._repeatableOrder.items).toEqual(['k0', 'k1']);
    });

    it('should respect max constraint', () => {
      const store = setupStore(createItemsConfig({ max: 1 }));

      act(() => {
        store.getState()._appendRepeatableItem('items');
      });

      let key: string | null;
      act(() => {
        key = store.getState()._insertRepeatableItem('items', 0);
      });

      expect(key!).toBeNull();
    });
  });

  describe('_reset', () => {
    it('should clear repeatable order and next keys', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._appendRepeatableItem('items');
      });

      act(() => {
        store.getState()._reset();
      });

      const state = store.getState();
      expect(state._repeatableOrder).toEqual({});
      expect(state._repeatableNextKey).toEqual({});
    });

    it('should preserve repeatable configs after reset', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items');
        store.getState()._reset();
      });

      // Config should still be registered
      expect(store.getState()._repeatableConfigs.items).toBeDefined();
    });
  });

  describe('stable keys after operations', () => {
    it('should never reuse keys after delete + append', () => {
      const store = setupStore();

      act(() => {
        store.getState()._appendRepeatableItem('items'); // k0
        store.getState()._appendRepeatableItem('items'); // k1
        store.getState()._removeRepeatableItem('items', 'k0');
        store.getState()._removeRepeatableItem('items', 'k1');
        store.getState()._appendRepeatableItem('items'); // k2 — NOT k0
      });

      const state = store.getState();
      expect(state._repeatableOrder.items).toEqual(['k2']);
      expect(state._repeatableNextKey.items).toBe(3);
    });
  });
});
