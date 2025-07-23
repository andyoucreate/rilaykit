import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createZodAsyncValidator,
  createZodSyncValidator,
  createZodValidator,
} from '../../src/zod/field-validator';

describe('createZodValidator', () => {
  describe('sync validation', () => {
    it('should validate successfully with valid data', async () => {
      const schema = z.string().min(3);
      const validator = createZodValidator(schema);

      const result = await validator('hello', {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return validation errors with invalid data', async () => {
      const schema = z.string().min(3, 'Too short');
      const validator = createZodValidator(schema);

      const result = await validator('hi', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Too short');
    });

    it('should handle email validation', async () => {
      const schema = z.string().email('Invalid email format');
      const validator = createZodValidator(schema);

      const validResult = await validator('test@example.com', {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator('invalid-email', {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Invalid email format');
    });

    it('should handle number validation', async () => {
      const schema = z.number().min(18, 'Must be at least 18');
      const validator = createZodValidator(schema);

      const validResult = await validator(25, {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator(16, {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Must be at least 18');
    });
  });

  describe('async validation', () => {
    it('should handle async refinements', async () => {
      const schema = z.string().refine(async (val) => {
        // Simulate async validation (e.g., checking if username is unique)
        await new Promise((resolve) => setTimeout(resolve, 10));
        return val !== 'taken';
      }, 'Username is already taken');

      const validator = createZodValidator(schema, { parseMode: 'async' });

      const validResult = await validator('available', {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator('taken', {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Username is already taken');
    });
  });

  describe('error transformation', () => {
    it('should apply custom error transformation', async () => {
      const schema = z.string().min(3);
      const validator = createZodValidator(schema, {
        errorTransform: () => 'Custom error message',
      });

      const result = await validator('hi', {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Custom error message');
    });

    it('should format nested paths correctly', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string().min(1, 'Name is required'),
        }),
      });

      const validator = createZodValidator(schema);

      const result = await validator({ user: { name: '' } }, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0].path).toBe('user.name');
    });

    it('should use custom path formatter', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string().min(1, 'Name is required'),
        }),
      });

      const validator = createZodValidator(schema, {
        pathFormatter: (path) => path.join(' -> '),
      });

      const result = await validator({ user: { name: '' } }, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0].path).toBe('user -> name');
    });
  });

  describe('abortEarly option', () => {
    it('should return all errors by default', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name required'),
        email: z.string().email('Invalid email'),
      });

      const validator = createZodValidator(schema);

      const result = await validator({ name: '', email: 'invalid' }, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should return only first error when abortEarly is true', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name required'),
        email: z.string().email('Invalid email'),
      });

      const validator = createZodValidator(schema, { abortEarly: true });

      const result = await validator({ name: '', email: 'invalid' }, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('convenience functions', () => {
    it('should create sync validator with createZodSyncValidator', async () => {
      const schema = z.string().min(3);
      const validator = createZodSyncValidator(schema);

      const result = await validator('hello', {});
      expect(result.isValid).toBe(true);
    });

    it('should create async validator with createZodAsyncValidator', async () => {
      const schema = z.string().refine(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return val.length > 0;
      });

      const validator = createZodAsyncValidator(schema);

      const result = await validator('test', {});
      expect(result.isValid).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error with invalid schema', () => {
      expect(() => {
        createZodValidator(null as any);
      }).toThrow('Invalid Zod schema provided');

      expect(() => {
        createZodValidator({} as any);
      }).toThrow('Invalid Zod schema provided');
    });

    it('should re-throw non-Zod errors', async () => {
      const mockSchema = {
        parse: vi.fn(() => {
          throw new Error('Custom error');
        }),
        parseAsync: vi.fn(() => {
          throw new Error('Custom error');
        }),
        _def: { typeName: 'ZodString' }, // Mock minimal Zod schema structure
      };

      const validator = createZodValidator(mockSchema as any);

      await expect(validator('test', {})).rejects.toThrow('Custom error');
    });

    it('should handle validation errors gracefully', async () => {
      const schema = z.string().min(10);
      const validator = createZodValidator(schema);

      const result = await validator('short', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('path');
    });
  });
});
