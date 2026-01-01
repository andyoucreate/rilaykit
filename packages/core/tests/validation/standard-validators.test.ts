import { describe, expect, it } from 'vitest';
import {
  url,
  async,
  combine,
  custom,
  email,
  max,
  maxLength,
  min,
  minLength,
  number,
  pattern,
  required,
  validateWithStandardSchema,
} from '../../src/validation';

describe('Standard Schema Built-in Validators', () => {
  describe('required validator', () => {
    it('should create a Standard Schema that accepts valid non-empty values', async () => {
      const schema = required();

      const validValues = ['test', 123, true, ['item'], { key: 'value' }];

      for (const value of validValues) {
        const result = await validateWithStandardSchema(schema, value);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.value).toBe(value);
      }
    });

    it('should create a Standard Schema that rejects empty values', async () => {
      const schema = required();

      const emptyValues = ['', null, undefined, []];

      for (const value of emptyValues) {
        const result = await validateWithStandardSchema(schema, value);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('This field is required');
      }
    });

    it('should accept custom error message', async () => {
      const schema = required('Custom required message');
      const result = await validateWithStandardSchema(schema, '');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Custom required message');
    });
  });

  describe('email validator', () => {
    it('should create a Standard Schema that accepts valid email addresses', async () => {
      const schema = email();

      const validEmails = [
        'test@example.com',
        'user.name+tag@domain.co.uk',
        'user_name@domain-name.com',
        'a@b.co',
      ];

      for (const emailAddress of validEmails) {
        const result = await validateWithStandardSchema(schema, emailAddress);
        expect(result.isValid).toBe(true);
        expect(result.value).toBe(emailAddress);
      }
    });

    it('should create a Standard Schema that rejects invalid email addresses', async () => {
      const schema = email();

      const invalidEmails = [
        'invalid',
        'test@',
        '@domain.com',
        'test@domain',
        'test.domain.com',
        '',
      ];

      for (const emailAddress of invalidEmails) {
        const result = await validateWithStandardSchema(schema, emailAddress);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
      }
    });

    it('should accept custom error message', async () => {
      const schema = email('Custom email error');
      const result = await validateWithStandardSchema(schema, 'invalid');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Custom email error');
    });
  });

  describe('minLength validator', () => {
    it('should create a Standard Schema that accepts strings meeting minimum length', async () => {
      const schema = minLength(3);
      const result = await validateWithStandardSchema(schema, 'abcd');

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('abcd');
    });

    it('should create a Standard Schema that rejects strings below minimum length', async () => {
      const schema = minLength(5);
      const result = await validateWithStandardSchema(schema, 'ab');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Must be at least 5 characters long');
    });

    it('should accept custom error message', async () => {
      const schema = minLength(10, 'Password too short');
      const result = await validateWithStandardSchema(schema, 'short');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Password too short');
    });
  });

  describe('maxLength validator', () => {
    it('should create a Standard Schema that accepts strings within maximum length', async () => {
      const schema = maxLength(10);
      const result = await validateWithStandardSchema(schema, 'short');

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('short');
    });

    it('should create a Standard Schema that rejects strings exceeding maximum length', async () => {
      const schema = maxLength(5);
      const result = await validateWithStandardSchema(schema, 'toolongtext');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Must be no more than 5 characters long');
    });
  });

  describe('pattern validator', () => {
    it('should create a Standard Schema that accepts strings matching the pattern', async () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const schema = pattern(emailPattern);
      const result = await validateWithStandardSchema(schema, 'test@example.com');

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('should create a Standard Schema that rejects strings not matching the pattern', async () => {
      const phonePattern = /^\d{3}-\d{3}-\d{4}$/;
      const schema = pattern(phonePattern);
      const result = await validateWithStandardSchema(schema, 'invalid-phone');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Value does not match required pattern');
    });
  });

  describe('number validator', () => {
    it('should create a Standard Schema that accepts valid numbers', async () => {
      const schema = number();

      const validNumbers = [123, 0, -45, 3.14, '42'];

      for (const num of validNumbers) {
        const result = await validateWithStandardSchema(schema, num);
        expect(result.isValid).toBe(true);
      }
    });

    it('should create a Standard Schema that rejects invalid numbers', async () => {
      const schema = number();
      const result = await validateWithStandardSchema(schema, 'abc');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Must be a valid number');
    });
  });

  describe('min validator', () => {
    it('should create a Standard Schema that accepts numbers above or equal to minimum', async () => {
      const schema = min(18);

      const validValues = [18, 25, 100];

      for (const value of validValues) {
        const result = await validateWithStandardSchema(schema, value);
        expect(result.isValid).toBe(true);
      }
    });

    it('should create a Standard Schema that rejects numbers below minimum', async () => {
      const schema = min(21);
      const result = await validateWithStandardSchema(schema, 18);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Must be at least 21');
    });
  });

  describe('max validator', () => {
    it('should create a Standard Schema that accepts numbers below or equal to maximum', async () => {
      const schema = max(100);
      const result = await validateWithStandardSchema(schema, 50);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(50);
    });

    it('should create a Standard Schema that rejects numbers above maximum', async () => {
      const schema = max(65);
      const result = await validateWithStandardSchema(schema, 70);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Must be no more than 65');
    });
  });

  describe('custom validator', () => {
    it('should create a Standard Schema that executes custom validation logic', async () => {
      const schema = custom((value: string) => value !== 'forbidden', 'Value is forbidden');

      const validResult = await validateWithStandardSchema(schema, 'allowed');
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validateWithStandardSchema(schema, 'forbidden');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Value is forbidden');
    });
  });

  describe('async validator', () => {
    it('should create a Standard Schema that handles async validation', async () => {
      const schema = async(
        (value: string) => Promise.resolve(value !== 'taken'),
        'Value is already taken'
      );

      const validResult = await validateWithStandardSchema(schema, 'available');
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validateWithStandardSchema(schema, 'taken');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Value is already taken');
    });
  });

  describe('url validator', () => {
    it('should create a Standard Schema that accepts valid URLs', async () => {
      const schema = url();

      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://sub.domain.co.uk/path',
      ];

      for (const urlValue of validUrls) {
        const result = await validateWithStandardSchema(schema, urlValue);
        expect(result.isValid).toBe(true);
        expect(result.value).toBe(urlValue);
      }
    });

    it('should create a Standard Schema that rejects invalid URLs', async () => {
      const schema = url();

      const invalidUrls = ['invalid', 'not-a-url', 'http://', ''];

      for (const urlValue of invalidUrls) {
        const result = await validateWithStandardSchema(schema, urlValue);
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe('combine utility', () => {
    it('should combine multiple Standard Schemas into one', async () => {
      const combinedSchema = combine(
        required('Field is required'),
        minLength(3, 'Too short'),
        email('Invalid email')
      );

      // Should pass all validations
      const validResult = await validateWithStandardSchema(combinedSchema, 'test@example.com');
      expect(validResult.isValid).toBe(true);

      // Should fail on required
      const emptyResult = await validateWithStandardSchema(combinedSchema, '');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors.some((e) => e.message === 'Field is required')).toBe(true);

      // Should fail on email format
      const invalidEmailResult = await validateWithStandardSchema(
        combinedSchema,
        'toolongbutnotanemail'
      );
      expect(invalidEmailResult.isValid).toBe(false);
      expect(invalidEmailResult.errors.some((e) => e.message === 'Invalid email')).toBe(true);
    });
  });

  describe('Standard Schema compliance', () => {
    it('should have proper Standard Schema structure', () => {
      const schema = required();

      expect(schema).toHaveProperty('~standard');
      expect(schema['~standard']).toHaveProperty('version', 1);
      expect(schema['~standard']).toHaveProperty('vendor', 'rilaykit');
      expect(schema['~standard']).toHaveProperty('validate');
      expect(typeof schema['~standard'].validate).toBe('function');
    });

    it('should work with external Standard Schema compatible libraries', async () => {
      // Mock a Zod-like schema for testing
      const mockZodSchema = {
        '~standard': {
          version: 1,
          vendor: 'zod',
          validate: (value: unknown) => {
            return typeof value === 'string' && value.length > 0
              ? { value }
              : { issues: [{ message: 'String required' }] };
          },
        },
      };

      const result = await validateWithStandardSchema(mockZodSchema, 'test');
      expect(result.isValid).toBe(true);
    });
  });
});
