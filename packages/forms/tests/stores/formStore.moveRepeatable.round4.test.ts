import type { RepeatableFieldConfig } from '@rilaykit/core';
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFormStore } from '../../src/stores/formStore';

function itemsConfig(): RepeatableFieldConfig {
  return {
    id: 'items',
    rows: [
      {
        kind: 'fields' as const,
        id: 'row-items',
        fields: [{ id: 'name', componentId: 'text', props: { label: 'Name' } }],
      },
    ],
    allFields: [{ id: 'name', componentId: 'text', props: { label: 'Name' } }],
    defaultValue: { name: '' },
  };
}

describe('_moveRepeatableItem marks the form dirty (round-4, Bug 8)', () => {
  it('sets isDirty=true after reordering, like append/insert/remove', () => {
    const store = createFormStore({});
    act(() => {
      store.getState()._setRepeatableConfig('items', itemsConfig());
      // Seed 3 items from defaults; _reset leaves isDirty=false.
      store.getState()._reset({ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
    });

    expect(store.getState().isDirty).toBe(false);
    expect(store.getState()._repeatableOrder.items).toHaveLength(3);

    act(() => {
      store.getState()._moveRepeatableItem('items', 0, 2);
    });

    expect(store.getState().isDirty).toBe(true);
  });
});
