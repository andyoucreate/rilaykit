import type { RepeatableFieldConfig } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import {
  buildCompositeKey,
  flattenRepeatableValues,
  parseCompositeKey,
  structureFormValues,
} from '../../src/utils/repeatable-data';

// =================================================================
// HELPERS
// =================================================================

function createRepeatableConfig(
  id: string,
  fieldIds: string[]
): RepeatableFieldConfig {
  return {
    id,
    rows: [
      {
        kind: 'fields' as const,
        id: `row-${id}`,
        fields: fieldIds.map((fid) => ({
          id: fid,
          componentId: 'text',
          props: { label: fid },
        })),
      },
    ],
    allFields: fieldIds.map((fid) => ({
      id: fid,
      componentId: 'text',
      props: { label: fid },
    })),
  };
}

// =================================================================
// TESTS
// =================================================================

describe('Composite Key Helpers', () => {
  describe('buildCompositeKey', () => {
    it('should build a composite key', () => {
      expect(buildCompositeKey('items', 'k0', 'name')).toBe('items[k0].name');
    });

    it('should handle various ID formats', () => {
      expect(buildCompositeKey('lineItems', 'k42', 'unitPrice')).toBe(
        'lineItems[k42].unitPrice'
      );
    });
  });

  describe('parseCompositeKey', () => {
    it('should parse a valid composite key', () => {
      const result = parseCompositeKey('items[k0].name');

      expect(result).toEqual({
        repeatableId: 'items',
        itemKey: 'k0',
        fieldId: 'name',
      });
    });

    it('should return null for non-composite keys', () => {
      expect(parseCompositeKey('simpleField')).toBeNull();
      expect(parseCompositeKey('field.with.dots')).toBeNull();
      expect(parseCompositeKey('')).toBeNull();
    });

    it('should handle field IDs with dots', () => {
      const result = parseCompositeKey('items[k0].address.street');

      expect(result).toEqual({
        repeatableId: 'items',
        itemKey: 'k0',
        fieldId: 'address.street',
      });
    });

    it('should roundtrip with buildCompositeKey', () => {
      const built = buildCompositeKey('contacts', 'k5', 'email');
      const parsed = parseCompositeKey(built);

      expect(parsed).toEqual({
        repeatableId: 'contacts',
        itemKey: 'k5',
        fieldId: 'email',
      });
    });
  });
});

describe('structureFormValues', () => {
  it('should convert flat composite keys to nested arrays', () => {
    const values = {
      customerName: 'John',
      'items[k0].name': 'Widget',
      'items[k0].qty': 2,
      'items[k1].name': 'Gadget',
      'items[k1].qty': 1,
    };

    const configs = { items: createRepeatableConfig('items', ['name', 'qty']) };
    const order = { items: ['k0', 'k1'] };

    const result = structureFormValues(values, configs, order);

    expect(result).toEqual({
      customerName: 'John',
      items: [
        { name: 'Widget', qty: 2 },
        { name: 'Gadget', qty: 1 },
      ],
    });
  });

  it('should preserve order from repeatableOrder', () => {
    const values = {
      'items[k2].name': 'C',
      'items[k0].name': 'A',
      'items[k1].name': 'B',
    };

    const configs = { items: createRepeatableConfig('items', ['name']) };
    const order = { items: ['k2', 'k0', 'k1'] };

    const result = structureFormValues(values, configs, order);

    expect(result.items).toEqual([{ name: 'C' }, { name: 'A' }, { name: 'B' }]);
  });

  it('should handle empty repeatable', () => {
    const values = { customerName: 'John' };
    const configs = { items: createRepeatableConfig('items', ['name']) };
    const order = { items: [] };

    const result = structureFormValues(values, configs, order);

    expect(result).toEqual({ customerName: 'John', items: [] });
  });

  it('should handle multiple repeatables', () => {
    const values = {
      'items[k0].name': 'Widget',
      'contacts[k0].email': 'john@example.com',
    };

    const configs = {
      items: createRepeatableConfig('items', ['name']),
      contacts: createRepeatableConfig('contacts', ['email']),
    };
    const order = { items: ['k0'], contacts: ['k0'] };

    const result = structureFormValues(values, configs, order);

    expect(result).toEqual({
      items: [{ name: 'Widget' }],
      contacts: [{ email: 'john@example.com' }],
    });
  });

  it('should not include orphan composite keys', () => {
    const values = {
      customerName: 'John',
      'items[k0].name': 'Widget',
      'items[k99].name': 'Orphan', // Not in order
    };

    const configs = { items: createRepeatableConfig('items', ['name']) };
    const order = { items: ['k0'] };

    const result = structureFormValues(values, configs, order);

    expect(result).toEqual({
      customerName: 'John',
      items: [{ name: 'Widget' }],
    });
  });
});

describe('flattenRepeatableValues', () => {
  it('should convert nested arrays to flat composite keys', () => {
    const data = {
      customerName: 'John',
      items: [
        { name: 'Widget', qty: 2 },
        { name: 'Gadget', qty: 1 },
      ],
    };

    const configs = { items: createRepeatableConfig('items', ['name', 'qty']) };

    const result = flattenRepeatableValues(data, configs);

    expect(result.values).toEqual({
      customerName: 'John',
      'items[k0].name': 'Widget',
      'items[k0].qty': 2,
      'items[k1].name': 'Gadget',
      'items[k1].qty': 1,
    });
    expect(result.order).toEqual({ items: ['k0', 'k1'] });
    expect(result.nextKeys).toEqual({ items: 2 });
  });

  it('should handle empty array', () => {
    const data = { items: [] };
    const configs = { items: createRepeatableConfig('items', ['name']) };

    const result = flattenRepeatableValues(data, configs);

    expect(result.values).toEqual({});
    expect(result.order).toEqual({ items: [] });
    expect(result.nextKeys).toEqual({ items: 0 });
  });

  it('should pass through non-repeatable fields', () => {
    const data = { name: 'John', age: 30 };
    const configs = { items: createRepeatableConfig('items', ['name']) };

    const result = flattenRepeatableValues(data, configs);

    expect(result.values).toEqual({ name: 'John', age: 30 });
    expect(result.order).toEqual({});
  });

  it('should handle multiple repeatables', () => {
    const data = {
      items: [{ name: 'Widget' }],
      contacts: [{ email: 'john@example.com' }],
    };

    const configs = {
      items: createRepeatableConfig('items', ['name']),
      contacts: createRepeatableConfig('contacts', ['email']),
    };

    const result = flattenRepeatableValues(data, configs);

    expect(result.values).toEqual({
      'items[k0].name': 'Widget',
      'contacts[k0].email': 'john@example.com',
    });
    expect(result.order).toEqual({ items: ['k0'], contacts: ['k0'] });
    expect(result.nextKeys).toEqual({ items: 1, contacts: 1 });
  });
});

describe('roundtrip: flatten ↔ structure', () => {
  it('should roundtrip correctly', () => {
    const original = {
      customerName: 'John',
      items: [
        { name: 'Widget', qty: 2 },
        { name: 'Gadget', qty: 1 },
      ],
    };

    const configs = { items: createRepeatableConfig('items', ['name', 'qty']) };

    // Flatten
    const flattened = flattenRepeatableValues(original, configs);

    // Structure back
    const structured = structureFormValues(flattened.values, configs, flattened.order);

    expect(structured).toEqual(original);
  });

  it('should roundtrip with multiple repeatables', () => {
    const original = {
      title: 'Order #1',
      items: [{ name: 'A' }, { name: 'B' }],
      contacts: [{ email: 'a@b.com' }],
    };

    const configs = {
      items: createRepeatableConfig('items', ['name']),
      contacts: createRepeatableConfig('contacts', ['email']),
    };

    const flattened = flattenRepeatableValues(original, configs);
    const structured = structureFormValues(flattened.values, configs, flattened.order);

    expect(structured).toEqual(original);
  });

  it('should roundtrip with empty data', () => {
    const original = { title: 'Empty', items: [] };
    const configs = { items: createRepeatableConfig('items', ['name']) };

    const flattened = flattenRepeatableValues(original, configs);
    const structured = structureFormValues(flattened.values, configs, flattened.order);

    expect(structured).toEqual(original);
  });
});
