import { beforeEach, describe, expect, it } from 'vitest';
import {
  IdGenerator,
  configureObject,
  deepClone,
  ensureUnique,
  mergeInto,
  normalizeToArray,
  validateRequired,
} from '../../src/utils/builderHelpers';

describe('Builder Helpers', () => {
  describe('mergeInto', () => {
    it('should merge partial configuration into target', () => {
      const target = {
        name: 'original',
        value: 42,
        flag: true,
      };

      const partial = {
        value: 100,
        newProp: 'added',
      };

      const result = mergeInto(target, partial);

      expect(result).toEqual({
        name: 'original',
        value: 100,
        flag: true,
        newProp: 'added',
      });
    });

    it('should not mutate original target', () => {
      const target = { value: 1 };
      const partial = { value: 2 };

      const result = mergeInto(target, partial);

      expect(target.value).toBe(1);
      expect(result.value).toBe(2);
      expect(result).not.toBe(target);
    });

    it('should handle empty partial', () => {
      const target = { a: 1, b: 2 };
      const result = mergeInto(target, {});

      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(target);
    });

    it('should handle undefined values in partial', () => {
      const target = { a: 1, b: 2 };
      const partial = { a: undefined, c: 3 };

      const result = mergeInto(target, partial);

      expect(result).toEqual({
        a: undefined,
        b: 2,
        c: 3,
      });
    });

    it('should handle nested objects by reference', () => {
      const nested = { inner: 'value' };
      const target = { nested };
      const partial = { other: 'prop' } as any;

      const result = mergeInto(target, partial);

      expect(result.nested).toBe(nested); // Same reference
      expect(result).toEqual({
        nested: { inner: 'value' },
        other: 'prop',
      });
    });
  });

  describe('ensureUnique', () => {
    it('should pass when all IDs are unique', () => {
      const ids = ['id1', 'id2', 'id3'];

      expect(() => {
        ensureUnique(ids, 'test');
      }).not.toThrow();
    });

    it('should throw when duplicate IDs exist', () => {
      const ids = ['id1', 'id2', 'id1', 'id3'];

      expect(() => {
        ensureUnique(ids, 'field');
      }).toThrow('Duplicate field IDs: id1');
    });

    it('should throw with multiple duplicates', () => {
      const ids = ['a', 'b', 'a', 'c', 'b', 'd'];

      expect(() => {
        ensureUnique(ids, 'item');
      }).toThrow(/Duplicate item IDs: a, b/);
    });

    it('should handle empty array', () => {
      expect(() => {
        ensureUnique([], 'test');
      }).not.toThrow();
    });

    it('should handle single item', () => {
      expect(() => {
        ensureUnique(['single'], 'test');
      }).not.toThrow();
    });

    it('should be case sensitive', () => {
      const ids = ['id1', 'ID1'];

      expect(() => {
        ensureUnique(ids, 'test');
      }).not.toThrow();
    });
  });

  describe('validateRequired', () => {
    interface TestItem {
      id?: string;
      name?: string;
      type?: string;
      required?: boolean;
    }

    it('should pass when all items have required fields', () => {
      const items: TestItem[] = [
        { id: 'item1', name: 'First', type: 'A', required: true },
        { id: 'item2', name: 'Second', type: 'B', required: false },
      ];

      expect(() => {
        validateRequired(items, ['id', 'name'], 'item');
      }).not.toThrow();
    });

    it('should throw when items are missing required fields', () => {
      const items: TestItem[] = [
        { id: 'item1', name: 'First' }, // missing type
        { id: 'item2', type: 'B' }, // missing name
      ];

      expect(() => {
        validateRequired(items, ['id', 'name', 'type'], 'field');
      }).toThrow('Missing required fields in field: id, name, type');
    });

    it('should handle items with falsy values correctly', () => {
      const items = [
        { id: '', name: 'test', type: 'A', required: false },
        { id: 'valid', name: '', type: 'B', required: 0 as any },
      ];

      // Empty string and 0 are falsy, so they should be considered "missing"
      expect(() => {
        validateRequired(items, ['id', 'name', 'type', 'required'], 'field');
      }).toThrow('Missing required fields in field');
    });

    it('should handle empty items array', () => {
      expect(() => {
        validateRequired([], ['id'], 'test');
      }).not.toThrow();
    });

    it('should handle empty required fields array', () => {
      const items = [{ id: 'test' }, { name: 'test2' }];

      expect(() => {
        validateRequired(items, [], 'test');
      }).not.toThrow();
    });

    it('should handle null and undefined values', () => {
      const items = [
        { id: 'valid', name: null, type: undefined },
        { id: undefined, name: 'valid', type: 'test' },
      ];

      expect(() => {
        validateRequired(items, ['id', 'name', 'type'], 'field');
      }).toThrow('Missing required fields in field');
    });
  });

  describe('IdGenerator', () => {
    let generator: IdGenerator;

    beforeEach(() => {
      generator = new IdGenerator();
    });

    it('should generate sequential IDs with prefix', () => {
      expect(generator.next('field')).toBe('field-1');
      expect(generator.next('field')).toBe('field-2');
      expect(generator.next('field')).toBe('field-3');
    });

    it('should handle different prefixes independently', () => {
      expect(generator.next('field')).toBe('field-1');
      expect(generator.next('step')).toBe('step-1');
      expect(generator.next('field')).toBe('field-2');
      expect(generator.next('step')).toBe('step-2');
    });

    it('should reset specific prefix counter', () => {
      generator.next('test');
      generator.next('test');
      generator.next('other');

      generator.reset('test');

      expect(generator.next('test')).toBe('test-1');
      expect(generator.next('other')).toBe('other-2'); // Should not be reset
    });

    it('should reset all counters when no prefix provided', () => {
      generator.next('first');
      generator.next('second');
      generator.next('first');

      generator.reset();

      expect(generator.next('first')).toBe('first-1');
      expect(generator.next('second')).toBe('second-1');
    });

    it('should handle edge case prefixes', () => {
      expect(generator.next('')).toBe('-1');
      expect(generator.next('prefix-with-dashes')).toBe('prefix-with-dashes-1');
      expect(generator.next('123')).toBe('123-1');
    });

    it('should maintain state across multiple operations', () => {
      const ids = [];
      for (let i = 0; i < 10; i++) {
        ids.push(generator.next('batch'));
      }

      expect(ids).toEqual([
        'batch-1',
        'batch-2',
        'batch-3',
        'batch-4',
        'batch-5',
        'batch-6',
        'batch-7',
        'batch-8',
        'batch-9',
        'batch-10',
      ]);
    });
  });

  describe('normalizeToArray', () => {
    it('should convert single item to array', () => {
      expect(normalizeToArray('single')).toEqual(['single']);
      expect(normalizeToArray(42)).toEqual([42]);
      expect(normalizeToArray({ key: 'value' })).toEqual([{ key: 'value' }]);
      expect(normalizeToArray(null)).toEqual([null]);
      expect(normalizeToArray(undefined)).toEqual([undefined]);
    });

    it('should return array unchanged', () => {
      const arr = ['item1', 'item2'];
      expect(normalizeToArray(arr)).toEqual(arr);
      expect(normalizeToArray(arr)).toBe(arr); // Should return same reference
    });

    it('should handle empty array', () => {
      expect(normalizeToArray([])).toEqual([]);
    });

    it('should handle nested arrays', () => {
      const nestedArray = [
        ['a', 'b'],
        ['c', 'd'],
      ];
      expect(normalizeToArray(nestedArray)).toEqual(nestedArray);
      expect(normalizeToArray(nestedArray)).toBe(nestedArray);
    });

    it('should preserve object references', () => {
      const obj = { test: true };
      const result = normalizeToArray(obj);

      expect(result[0]).toBe(obj);
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('string')).toBe('string');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('should clone Date objects', () => {
      const date = new Date('2023-01-01');
      const cloned = deepClone(date);

      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
      expect(cloned instanceof Date).toBe(true);
    });

    it('should clone arrays', () => {
      const arr = [1, 'two', { three: 3 }];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[2]).not.toBe(arr[2]); // Deep clone
    });

    it('should clone objects', () => {
      const obj = {
        num: 42,
        str: 'test',
        nested: {
          deep: {
            value: 'deep',
          },
        },
        arr: [1, 2, { inner: true }],
      };

      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.nested).not.toBe(obj.nested);
      expect(cloned.nested.deep).not.toBe(obj.nested.deep);
      expect(cloned.arr).not.toBe(obj.arr);
      expect(cloned.arr[2]).not.toBe(obj.arr[2]);
    });

    it('should handle complex nested structures', () => {
      const complex = {
        users: [
          { id: 1, profile: { name: 'John', age: 30 } },
          { id: 2, profile: { name: 'Jane', age: 25 } },
        ],
        settings: {
          theme: 'dark',
          features: {
            notifications: true,
            analytics: false,
          },
        },
        timestamps: [new Date('2023-01-01'), new Date('2023-01-02')],
      };

      const cloned = deepClone(complex);

      expect(cloned).toEqual(complex);
      expect(cloned.users[0].profile).not.toBe(complex.users[0].profile);
      expect(cloned.settings.features).not.toBe(complex.settings.features);
      expect(cloned.timestamps[0]).not.toBe(complex.timestamps[0]);
    });

    it('should throw on circular references', () => {
      const original: any = { name: 'test' };
      original.circular = original;

      expect(() => {
        deepClone(original);
      }).toThrow(); // Should throw RangeError: Maximum call stack size exceeded
    });

    it('should handle empty objects and arrays', () => {
      expect(deepClone({})).toEqual({});
      expect(deepClone([])).toEqual([]);

      const emptyObj = deepClone({});
      const emptyArr = deepClone([]);

      expect(emptyObj).not.toBe({});
      expect(emptyArr).not.toBe([]);
    });
  });

  describe('configureObject', () => {
    it('should merge updates into target', () => {
      const target = { a: 1, b: 2, c: 3 };
      const updates = { a: 10, d: 40 };

      const result = configureObject(target, updates);

      expect(result).toEqual({ a: 10, b: 2, c: 3, d: 40 });
    });

    it('should respect allowedKeys filter', () => {
      const target = { a: 1, b: 2, c: 3 };
      const updates = { a: 10, b: 20, d: 40 };
      const allowedKeys = ['a', 'd'];

      const result = configureObject(target, updates, allowedKeys as any);

      expect(result).toEqual({ a: 10, b: 2, c: 3, d: 40 }); // b not updated, d added
    });

    it('should not mutate original target', () => {
      const target = { value: 1 };
      const updates = { value: 2 };

      const result = configureObject(target, updates);

      expect(target.value).toBe(1);
      expect(result.value).toBe(2);
      expect(result).not.toBe(target);
    });

    it('should ignore undefined updates', () => {
      const target = { a: 1, b: 2 };
      const updates = { a: undefined, c: 3 };

      const result = configureObject(target, updates);

      expect(result).toEqual({ a: 1, b: 2, c: 3 }); // a not updated due to undefined
    });

    it('should handle allowedKeys with non-existent target keys', () => {
      const target = { a: 1, b: 2 };
      const updates = { a: 10, c: 30 };
      const allowedKeys = ['a', 'b', 'c'];

      const result = configureObject(target, updates, allowedKeys as any);

      expect(result).toEqual({ a: 10, b: 2, c: 30 }); // All keys preserved/added
    });

    it('should handle empty updates', () => {
      const target = { a: 1, b: 2 };
      const result = configureObject(target, {});

      expect(result).toEqual(target);
      expect(result).not.toBe(target);
    });

    it('should handle empty allowedKeys', () => {
      const target = { a: 1, b: 2 };
      const updates = { a: 10, c: 30 };

      const result = configureObject(target, updates, []);

      expect(result).toEqual({ a: 1, b: 2 }); // No updates applied
    });

    it('should handle complex nested objects by reference', () => {
      const nested = { deep: { value: 'test' } };
      const target = { nested, other: 'prop' };
      const updates = { nested: { different: 'object' }, other: 'updated' } as any;

      const result = configureObject(target, updates);

      expect(result.nested).toBe(updates.nested);
      expect(result.nested).not.toBe(target.nested);
      expect(result.other).toBe('updated');
    });
  });

  describe('integration scenarios', () => {
    it('should work together in real-world builder pattern', () => {
      const generator = new IdGenerator();

      // Create base configuration
      const baseConfig = {
        id: generator.next('config'),
        name: 'Base Config',
        enabled: false,
      };

      // Normalize input to array
      const configs = normalizeToArray(baseConfig);

      // Validate required fields
      expect(() => {
        validateRequired(configs, ['id', 'name'], 'configuration');
      }).not.toThrow();

      // Ensure uniqueness
      const ids = configs.map((c) => c.id);
      expect(() => {
        ensureUnique(ids, 'configuration');
      }).not.toThrow();

      // Merge updates
      const updatedConfig = mergeInto(baseConfig, { enabled: true });
      expect(updatedConfig.enabled).toBe(true);

      // Clone for immutability
      const clonedConfig = deepClone(updatedConfig);
      expect(clonedConfig).toEqual(updatedConfig);
      expect(clonedConfig).not.toBe(updatedConfig);
    });

    it('should handle complex data transformation pipeline', () => {
      interface FormField {
        id: string;
        name: string;
        type: string;
        required?: boolean;
        validation?: object;
      }

      const generator = new IdGenerator();

      // Generate multiple fields
      const fields: Partial<FormField>[] = [
        { name: 'Email', type: 'email' },
        { name: 'Password', type: 'password' },
        { name: 'Confirm Password', type: 'password' },
      ];

      // Add IDs to fields that don't have them
      const fieldsWithIds = fields.map((field) =>
        field.id ? field : { ...field, id: generator.next('field') }
      );

      // Configure with defaults
      const configuredFields = fieldsWithIds.map((field) =>
        configureObject({ required: false, validation: {} } as FormField, field, [
          'id',
          'name',
          'type',
          'required',
        ])
      );

      // Validate all required fields are present
      expect(() => {
        validateRequired(configuredFields, ['id', 'name', 'type'], 'form field');
      }).not.toThrow();

      // Ensure unique IDs
      const fieldIds = configuredFields.map((f) => f.id);
      expect(() => {
        ensureUnique(fieldIds, 'form field');
      }).not.toThrow();

      // Clone final configuration
      const finalConfig = deepClone(configuredFields);

      expect(finalConfig).toHaveLength(3);
      expect(finalConfig[0].id).toBe('field-1');
      expect(finalConfig[0].required).toBe(false);
      expect(finalConfig).not.toBe(configuredFields);
    });
  });
});
