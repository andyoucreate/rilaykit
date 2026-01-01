import { describe, expect, it } from 'vitest';
import type { FieldValidationConfig, FormValidationConfig } from '../../src/types';
import {
  combineSchemas,
  createValidationContext,
  email,
  hasUnifiedValidation,
  minLength,
  required,
  validateFormWithUnifiedConfig,
  validateWithStandardSchema,
  validateWithUnifiedConfig,
} from '../../src/validation';

describe('Unified Validation System', () => {
  describe('validateWithUnifiedConfig', () => {
    it('should validate with single Standard Schema', async () => {
      const config: FieldValidationConfig = {
        validate: email('Invalid email'),
      };

      const context = createValidationContext();

      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);

      const invalidResult = await validateWithUnifiedConfig(config, 'invalid', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Invalid email');
    });

    it('should validate with array of Standard Schemas', async () => {
      const config: FieldValidationConfig = {
        validate: [required('Email required'), email('Invalid email format')],
      };

      const context = createValidationContext();

      // Should pass both validations
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);

      // Should fail on required
      const emptyResult = await validateWithUnifiedConfig(config, '', context);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors.some((e) => e.message === 'Email required')).toBe(true);

      // Should fail on email format
      const invalidResult = await validateWithUnifiedConfig(config, 'invalid', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some((e) => e.message === 'Invalid email format')).toBe(true);
    });

    it('should handle mixed validation types', async () => {
      const config: FieldValidationConfig = {
        validate: [required('Required'), minLength(3, 'Too short'), email('Must be email')],
      };

      const context = createValidationContext();

      // Should pass all validations
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);

      // Should fail on multiple validations
      const invalidResult = await validateWithUnifiedConfig(config, 'ab', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(1);
    });

    it('should return success for empty config', async () => {
      const config: FieldValidationConfig = {};
      const context = createValidationContext();

      const result = await validateWithUnifiedConfig(config, 'anything', context);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateFormWithUnifiedConfig', () => {
    it('should validate form with Standard Schema', async () => {
      // Mock a form schema
      const formSchema = {
        '~standard': {
          version: 1,
          vendor: 'mock',
          validate: (value: unknown) => {
            const data = value as any;
            if (data?.email && data.name) {
              return { value: data };
            }
            return { issues: [{ message: 'Missing required fields' }] };
          },
        },
      };

      const config: FormValidationConfig = {
        validate: formSchema,
      };

      const context = createValidationContext();

      const validData = { email: 'test@example.com', name: 'John' };
      const validResult = await validateFormWithUnifiedConfig(config, validData, context);
      expect(validResult.isValid).toBe(true);

      const invalidData = { email: 'test@example.com' }; // missing name
      const invalidResult = await validateFormWithUnifiedConfig(config, invalidData, context);
      expect(invalidResult.isValid).toBe(false);
    });
  });

  describe('hasUnifiedValidation', () => {
    it('should detect validation config with validate property', () => {
      const configWithValidation: FieldValidationConfig = {
        validate: required(),
      };

      const configWithoutValidation: FieldValidationConfig = {};

      expect(hasUnifiedValidation(configWithValidation)).toBe(true);
      expect(hasUnifiedValidation(configWithoutValidation)).toBe(false);
    });

    it('should detect validation config with array validate property', () => {
      const configWithValidation: FieldValidationConfig = {
        validate: [required(), email()],
      };

      expect(hasUnifiedValidation(configWithValidation)).toBe(true);
    });
  });

  describe('combineSchemas utility', () => {
    it('should combine multiple schemas into one', async () => {
      const combinedSchema = combineSchemas(
        required('Required'),
        email('Invalid email'),
        minLength(5, 'Too short')
      );

      // Should pass all validations
      const validResult = await validateWithStandardSchema(combinedSchema, 'test@example.com');
      expect(validResult.isValid).toBe(true);

      // Should fail on multiple validations
      const invalidResult = await validateWithStandardSchema(combinedSchema, 'ab');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(1);
    });
  });

  describe('real-world usage scenarios', () => {
    it('should work with mixed Zod and built-in validators', async () => {
      // Mock Zod schema
      const mockZodEmailSchema = {
        '~standard': {
          version: 1,
          vendor: 'zod',
          validate: (value: unknown) => {
            if (typeof value === 'string' && value.includes('@')) {
              return { value };
            }
            return { issues: [{ message: 'Zod: Invalid email' }] };
          },
        },
      };

      const config: FieldValidationConfig = {
        validate: [
          required('Field is required'),
          mockZodEmailSchema,
          minLength(5, 'Email too short'),
        ],
      };

      const context = createValidationContext();

      // Should work with valid email
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);

      // Should fail with invalid email
      const invalidResult = await validateWithUnifiedConfig(config, 'test', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some((e) => e.message === 'Zod: Invalid email')).toBe(true);
    });

    it('should handle validation timing options', async () => {
      const config: FieldValidationConfig = {
        validate: email(),
        validateOnChange: true,
        validateOnBlur: false,
        debounceMs: 300,
      };

      // The timing options should be preserved in config
      expect(config.validateOnChange).toBe(true);
      expect(config.validateOnBlur).toBe(false);
      expect(config.debounceMs).toBe(300);
    });
  });

  describe('error handling', () => {
    it('should handle invalid schemas gracefully', async () => {
      const config: FieldValidationConfig = {
        validate: { notASchema: true } as any,
      };

      const context = createValidationContext();
      const result = await validateWithUnifiedConfig(config, 'test', context);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe(
        'Invalid validation rule: must implement Standard Schema interface'
      );
    });

    it('should handle schema validation errors', async () => {
      const throwingSchema = {
        '~standard': {
          version: 1,
          vendor: 'throwing',
          validate: () => {
            throw new Error('Schema threw an error');
          },
        },
      };

      const config: FieldValidationConfig = {
        validate: throwingSchema,
      };

      const context = createValidationContext();
      const result = await validateWithUnifiedConfig(config, 'test', context);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Schema threw an error');
    });
  });
});
