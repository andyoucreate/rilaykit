import { beforeEach, describe, expect, it } from 'vitest';
import {
  IdGenerator,
  ValidationErrorBuilder,
  ValidationPatterns,
  configureObject,
  deepClone,
  ensureUnique,
  mergeInto,
  normalizeToArray,
} from '../../src/utils/builderHelpers';

describe('builderHelpers', () => {
  describe('mergeInto', () => {
    it('should merge partial objects into target', () => {
      const target = { a: 1, b: 2 };
      const partial = { b: 3, c: 4 };
      const result = mergeInto(target, partial);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
      expect(result).not.toBe(target); // Should return new object
    });
  });

  describe('ensureUnique', () => {
    it('should not throw for unique IDs', () => {
      expect(() => ensureUnique(['a', 'b', 'c'], 'test')).not.toThrow();
    });

    it('should throw for duplicate IDs', () => {
      expect(() => ensureUnique(['a', 'b', 'a'], 'test')).toThrow('Duplicate test IDs: a');
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
      expect(generator.next('row')).toBe('row-1');
      expect(generator.next('field')).toBe('field-3');
    });

    it('should reset counters', () => {
      generator.next('field');
      generator.next('field');
      generator.reset('field');
      expect(generator.next('field')).toBe('field-1');
    });

    it('should reset all counters', () => {
      generator.next('field');
      generator.next('row');
      generator.reset();
      expect(generator.next('field')).toBe('field-1');
      expect(generator.next('row')).toBe('row-1');
    });
  });

  describe('ValidationErrorBuilder', () => {
    let builder: ValidationErrorBuilder;

    beforeEach(() => {
      builder = new ValidationErrorBuilder();
    });

    it('should build error array', () => {
      builder.add('CODE1', 'Message 1');
      builder.add('CODE2', 'Message 2', ['path']);

      const errors = builder.build();
      expect(errors).toHaveLength(2);
      expect(errors[0]).toEqual({ code: 'CODE1', message: 'Message 1' });
      expect(errors[1]).toEqual({ code: 'CODE2', message: 'Message 2', path: ['path'] });
    });

    it('should add conditionally', () => {
      builder.addIf(true, 'CODE1', 'Message 1');
      builder.addIf(false, 'CODE2', 'Message 2');

      const errors = builder.build();
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('CODE1');
    });

    it('should check for errors', () => {
      expect(builder.hasErrors()).toBe(false);
      builder.add('CODE1', 'Message 1');
      expect(builder.hasErrors()).toBe(true);
    });

    it('should clear errors', () => {
      builder.add('CODE1', 'Message 1');
      expect(builder.hasErrors()).toBe(true);
      builder.clear();
      expect(builder.hasErrors()).toBe(false);
    });
  });

  describe('ValidationPatterns', () => {
    it('should validate values correctly', () => {
      expect(ValidationPatterns.hasValue('test')).toBe(true);
      expect(ValidationPatterns.hasValue('')).toBe(false);
      expect(ValidationPatterns.hasValue(null)).toBe(false);
      expect(ValidationPatterns.hasValue(undefined)).toBe(false);
    });

    it('should validate arrays', () => {
      expect(ValidationPatterns.isArray([])).toBe(true);
      expect(ValidationPatterns.isArray('string')).toBe(false);
    });

    it('should validate array length', () => {
      expect(ValidationPatterns.arrayMinLength(['a', 'b'], 2)).toBe(true);
      expect(ValidationPatterns.arrayMinLength(['a'], 2)).toBe(false);
      expect(ValidationPatterns.arrayMaxLength(['a', 'b'], 3)).toBe(true);
      expect(ValidationPatterns.arrayMaxLength(['a', 'b', 'c', 'd'], 3)).toBe(false);
    });
  });

  describe('normalizeToArray', () => {
    it('should convert single item to array', () => {
      expect(normalizeToArray('item')).toEqual(['item']);
    });

    it('should keep arrays as arrays', () => {
      expect(normalizeToArray(['a', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone('string')).toBe('string');
      expect(deepClone(42)).toBe(42);
      expect(deepClone(null)).toBe(null);
    });

    it('should clone dates', () => {
      const date = new Date();
      const cloned = deepClone(date);
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should clone arrays', () => {
      const arr = [1, { a: 2 }, [3]];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });
  });

  describe('configureObject', () => {
    it('should merge updates into target', () => {
      const target = { a: 1, b: 2, c: 3 };
      const updates = { b: 20, d: 4 };
      const result = configureObject(target, updates);

      expect(result).toEqual({ a: 1, b: 20, c: 3, d: 4 });
      expect(result).not.toBe(target);
    });

    it('should respect allowed keys filter', () => {
      const target = { a: 1, b: 2, c: 3 };
      const updates = { b: 20, d: 4 };
      const result = configureObject(target, updates, ['b']);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should ignore undefined values', () => {
      const target = { a: 1, b: 2 };
      const updates = { b: undefined, c: 3 };
      const result = configureObject(target, updates);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });
});
