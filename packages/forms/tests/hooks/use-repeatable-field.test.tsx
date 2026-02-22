import type { FormConfiguration, RepeatableFieldConfig } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider } from '../../src/components/FormProvider';
import { useRepeatableField } from '../../src/hooks/use-repeatable-field';

// =================================================================
// HELPERS
// =================================================================

const MockInput = ({ value, onChange, props }: any) => (
  <input
    value={value || ''}
    onChange={(e: any) => onChange?.(e.target.value)}
    placeholder={props?.label}
  />
);

let rilConfig: any;
let formConfig: FormConfiguration;

function createWrapper(config: FormConfiguration, defaultValues?: Record<string, unknown>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <FormProvider formConfig={config} defaultValues={defaultValues}>
        {children}
      </FormProvider>
    );
  };
}

// =================================================================
// TESTS
// =================================================================

describe('useRepeatableField', () => {
  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text',
        renderer: MockInput,
        defaultProps: { label: '' },
      })
      .addComponent('number', {
        name: 'Number',
        renderer: MockInput,
        defaultProps: { label: '', min: 0 },
      });

    formConfig = form
      .create(rilConfig, 'test-form')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('items', (r) =>
        r
          .add(
            { id: 'name', type: 'text', props: { label: 'Name' } },
            { id: 'qty', type: 'number', props: { label: 'Qty' } }
          )
          .min(0)
          .max(5)
          .defaultValue({ name: '', qty: 1 })
      )
      .build();
  });

  describe('initial state', () => {
    it('should return empty items when no items exist', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      expect(result.current.items).toHaveLength(0);
      expect(result.current.count).toBe(0);
      expect(result.current.canAdd).toBe(true);
      expect(result.current.canRemove).toBe(false);
    });

    it('should return items when initialized with default values', () => {
      const wrapper = createWrapper(formConfig, {
        title: 'Order',
        items: [
          { name: 'Widget', qty: 2 },
          { name: 'Gadget', qty: 1 },
        ],
      });

      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.count).toBe(2);
    });

    it('should return items with min constraint pre-filled', () => {
      const minFormConfig = form
        .create(rilConfig, 'min-form')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .min(2)
            .defaultValue({ name: '' })
        )
        .build();

      const wrapper = createWrapper(minFormConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.canRemove).toBe(false); // At min
    });
  });

  describe('items structure', () => {
    it('should have scoped field IDs', () => {
      const wrapper = createWrapper(formConfig, {
        items: [{ name: 'Test', qty: 1 }],
      });

      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      const item = result.current.items[0];
      expect(item.key).toBe('k0');
      expect(item.index).toBe(0);
      expect(item.allFields).toHaveLength(2);
      expect(item.allFields[0].id).toBe('items[k0].name');
      expect(item.allFields[1].id).toBe('items[k0].qty');
    });

    it('should have scoped row field IDs', () => {
      const wrapper = createWrapper(formConfig, {
        items: [{ name: 'Test', qty: 1 }],
      });

      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      const item = result.current.items[0];
      expect(item.rows).toHaveLength(1);
      expect(item.rows[0].fields[0].id).toBe('items[k0].name');
      expect(item.rows[0].fields[1].id).toBe('items[k0].qty');
    });
  });

  describe('append', () => {
    it('should append a new item', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      act(() => {
        result.current.append();
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].key).toBe('k0');
      expect(result.current.count).toBe(1);
    });

    it('should append with custom default values', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      act(() => {
        result.current.append({ name: 'Custom', qty: 10 });
      });

      expect(result.current.items).toHaveLength(1);
    });

    it('should append multiple items with unique keys', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      act(() => {
        result.current.append();
        result.current.append();
        result.current.append();
      });

      expect(result.current.items).toHaveLength(3);
      expect(result.current.items[0].key).toBe('k0');
      expect(result.current.items[1].key).toBe('k1');
      expect(result.current.items[2].key).toBe('k2');
    });
  });

  describe('remove', () => {
    it('should remove an item by key', () => {
      const wrapper = createWrapper(formConfig, {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 2 },
        ],
      });

      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });
      expect(result.current.items).toHaveLength(2);

      act(() => {
        result.current.remove('k0');
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].key).toBe('k1');
    });
  });

  describe('move', () => {
    it('should reorder items', () => {
      const wrapper = createWrapper(formConfig, {
        items: [
          { name: 'A', qty: 1 },
          { name: 'B', qty: 2 },
          { name: 'C', qty: 3 },
        ],
      });

      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      act(() => {
        result.current.move(0, 2);
      });

      expect(result.current.items[0].key).toBe('k1');
      expect(result.current.items[1].key).toBe('k2');
      expect(result.current.items[2].key).toBe('k0');
    });
  });

  describe('canAdd / canRemove', () => {
    it('should reflect max constraint', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      // Add 5 items (max)
      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.append();
        }
      });

      expect(result.current.canAdd).toBe(false);
      expect(result.current.canRemove).toBe(true);
    });

    it('should reflect min constraint', () => {
      const minFormConfig = form
        .create(rilConfig, 'min-form')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .min(1)
            .max(3)
            .defaultValue({ name: '' })
        )
        .build();

      const wrapper = createWrapper(minFormConfig);
      const { result } = renderHook(() => useRepeatableField('items'), { wrapper });

      // Should have 1 item (min) pre-filled
      expect(result.current.canRemove).toBe(false);

      act(() => {
        result.current.append();
      });

      expect(result.current.canRemove).toBe(true);
    });
  });

  describe('unknown repeatable', () => {
    it('should return empty state for unknown repeatable ID', () => {
      const wrapper = createWrapper(formConfig);
      const { result } = renderHook(() => useRepeatableField('nonexistent'), { wrapper });

      expect(result.current.items).toHaveLength(0);
      expect(result.current.canAdd).toBe(false);
      expect(result.current.canRemove).toBe(false);
      expect(result.current.count).toBe(0);
    });
  });
});
