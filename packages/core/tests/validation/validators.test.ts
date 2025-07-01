import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ValidationContext } from '../../src/types';
import { createZodValidator } from '../../src/validation/validators';

describe('Validators', () => {
  const mockContext: ValidationContext = {
    fieldId: 'test-field',
    formData: {},
    fieldProps: {},
    touched: false,
    dirty: false,
  };

  describe('createZodValidator', () => {
    it('should validate string schema successfully', async () => {
      const schema = z.string().min(3, 'Too short');
      const validator = createZodValidator(schema);

      const result = await validator('hello', mockContext, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid string', async () => {
      const schema = z.string().min(3, 'Too short');
      const validator = createZodValidator(schema);

      const result = await validator('hi', mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Too short');
    });

    it('should validate email schema successfully', async () => {
      const schema = z.string().email('Invalid email');
      const validator = createZodValidator(schema);

      const result = await validator('test@example.com', mockContext, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid email', async () => {
      const schema = z.string().email('Invalid email');
      const validator = createZodValidator(schema);

      const result = await validator('invalid-email', mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Invalid email');
    });

    it('should validate number schema successfully', async () => {
      const schema = z.number().min(18, 'Must be at least 18');
      const validator = createZodValidator(schema);

      const result = await validator(25, mockContext, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid number', async () => {
      const schema = z.number().min(18, 'Must be at least 18');
      const validator = createZodValidator(schema);

      const result = await validator(15, mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Must be at least 18');
    });

    it('should handle coerced number validation', async () => {
      const schema = z.coerce.number().min(18, 'Must be at least 18');
      const validator = createZodValidator(schema);

      const result = await validator('25', mockContext, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate object schema successfully', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name required'),
        email: z.string().email('Invalid email'),
      });
      const validator = createZodValidator(schema);

      const result = await validator({ name: 'John', email: 'john@example.com' }, mockContext, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid object', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name required'),
        email: z.string().email('Invalid email'),
      });
      const validator = createZodValidator(schema);

      const result = await validator({ name: '', email: 'invalid-email' }, mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toBe('Name required');
      expect(result.errors[1].message).toBe('Invalid email');
    });

    it('should handle array validation', async () => {
      const schema = z.array(z.string().min(1, 'Item required')).min(1, 'Array must not be empty');
      const validator = createZodValidator(schema);

      const validResult = await validator(['item1', 'item2'], mockContext, {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator([], mockContext, {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Array must not be empty');
    });

    it('should handle optional fields', async () => {
      const schema = z.string().optional();
      const validator = createZodValidator(schema);

      const result1 = await validator(undefined, mockContext, {});
      expect(result1.isValid).toBe(true);

      const result2 = await validator('valid', mockContext, {});
      expect(result2.isValid).toBe(true);
    });

    it('should handle nullable fields', async () => {
      const schema = z.string().nullable();
      const validator = createZodValidator(schema);

      const result1 = await validator(null, mockContext, {});
      expect(result1.isValid).toBe(true);

      const result2 = await validator('valid', mockContext, {});
      expect(result2.isValid).toBe(true);
    });

    it('should handle union types', async () => {
      const schema = z.union([z.string(), z.number()]);
      const validator = createZodValidator(schema);

      const stringResult = await validator('hello', mockContext, {});
      expect(stringResult.isValid).toBe(true);

      const numberResult = await validator(42, mockContext, {});
      expect(numberResult.isValid).toBe(true);

      const invalidResult = await validator(true, mockContext, {});
      expect(invalidResult.isValid).toBe(false);
    });

    it('should handle date validation', async () => {
      const schema = z.date();
      const validator = createZodValidator(schema);

      const validResult = await validator(new Date(), mockContext, {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator('not-a-date', mockContext, {});
      expect(invalidResult.isValid).toBe(false);
    });

    it('should handle custom error messages', async () => {
      const schema = z.string().min(3, 'Custom error message');
      const validator = createZodValidator(schema);

      const result = await validator('hi', mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Custom error message');
    });

    it('should provide error paths for nested objects', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string().min(1, 'Name required'),
          email: z.string().email('Invalid email'),
        }),
      });
      const validator = createZodValidator(schema);

      const result = await validator({ user: { name: '', email: 'invalid' } }, mockContext, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].path).toEqual(['user', 'name']);
      expect(result.errors[1].path).toEqual(['user', 'email']);
    });

    it('should handle refinements and custom validation', async () => {
      const schema = z
        .string()
        .refine((val) => val === 'hello', { message: 'Must be exactly "hello"' });
      const validator = createZodValidator(schema);

      const validResult = await validator('hello', mockContext, {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator('Hello', mockContext, {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Must be exactly "hello"');
    });

    it('should handle transform operations', async () => {
      const schema = z.string().transform((val) => val.toUpperCase());
      const validator = createZodValidator(schema);

      const result = await validator('hello', mockContext, {});
      expect(result.isValid).toBe(true);
    });

    it('should handle async refinements', async () => {
      const schema = z.string().refine(
        async (val) => {
          // Simulate async validation (e.g., checking uniqueness)
          await new Promise((resolve) => setTimeout(resolve, 10));
          return val !== 'taken';
        },
        { message: 'Value is already taken' }
      );
      const validator = createZodValidator(schema);

      const validResult = await validator('available', mockContext, {});
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validator('taken', mockContext, {});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Value is already taken');
    });
  });
});
