import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FieldValidationConfig } from '../../src/types';
import {
  createValidationContext,
  email,
  hasUnifiedValidation,
  required,
  validateWithUnifiedConfig,
} from '../../src/validation';

describe('Standard Schema Integration Tests', () => {
  describe('RilayKit built-in validators', () => {
    it('should work with required validator', async () => {
      const config: FieldValidationConfig = {
        validate: required('This field is required'),
      };

      expect(hasUnifiedValidation(config)).toBe(true);

      const context = createValidationContext();

      // Test empty value
      const emptyResult = await validateWithUnifiedConfig(config, '', context);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors[0].message).toBe('This field is required');

      // Test valid value
      const validResult = await validateWithUnifiedConfig(config, 'hello', context);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toEqual([]);
    });

    it('should work with email validator', async () => {
      const config: FieldValidationConfig = {
        validate: email('Invalid email'),
      };

      const context = createValidationContext();

      // Test invalid email
      const invalidResult = await validateWithUnifiedConfig(config, 'invalid', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Invalid email');

      // Test valid email
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);
    });

    it('should work with combined validators', async () => {
      const config: FieldValidationConfig = {
        validate: [required('Email is required'), email('Invalid email format')],
      };

      const context = createValidationContext();

      // Test empty value - should fail on required
      const emptyResult = await validateWithUnifiedConfig(config, '', context);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors.some((e) => e.message === 'Email is required')).toBe(true);

      // Test invalid email - should fail on email format
      const invalidResult = await validateWithUnifiedConfig(config, 'invalid', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some((e) => e.message === 'Invalid email format')).toBe(true);

      // Test valid email - should pass both
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toEqual([]);
    });
  });

  describe('Zod integration', () => {
    it('should work with Zod schemas directly', async () => {
      const zodSchema = z.string().email('Zod: Invalid email');

      const config: FieldValidationConfig = {
        validate: zodSchema,
      };

      expect(hasUnifiedValidation(config)).toBe(true);

      const context = createValidationContext();

      // Test invalid email
      const invalidResult = await validateWithUnifiedConfig(config, 'invalid', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Zod: Invalid email');

      // Test valid email
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);
    });

    it('should work with mixed RilayKit + Zod validators', async () => {
      const config: FieldValidationConfig = {
        validate: [
          required('Field is required'),
          z.string().email('Must be valid email'),
          z.string().min(5, 'Too short'),
        ],
      };

      const context = createValidationContext();

      // Test empty value
      const emptyResult = await validateWithUnifiedConfig(config, '', context);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors.some((e) => e.message === 'Field is required')).toBe(true);

      // Test short invalid email
      const shortResult = await validateWithUnifiedConfig(config, 'ab', context);
      expect(shortResult.isValid).toBe(false);
      expect(shortResult.errors.length).toBeGreaterThan(1); // Multiple validation failures

      // Test valid email
      const validResult = await validateWithUnifiedConfig(config, 'test@example.com', context);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle config without validation', async () => {
      const config: FieldValidationConfig = {};

      expect(hasUnifiedValidation(config)).toBe(false);

      const context = createValidationContext();
      const result = await validateWithUnifiedConfig(config, 'anything', context);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle validation timing options', () => {
      const config: FieldValidationConfig = {
        validate: required(),
        validateOnChange: true,
        validateOnBlur: false,
        debounceMs: 300,
      };

      expect(hasUnifiedValidation(config)).toBe(true);
      expect(config.validateOnChange).toBe(true);
      expect(config.validateOnBlur).toBe(false);
      expect(config.debounceMs).toBe(300);
    });

    it('should handle async validation', async () => {
      const asyncZodSchema = z.string().refine(async (value) => {
        // Simulate async validation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return value !== 'taken';
      }, 'Value is already taken');

      const config: FieldValidationConfig = {
        validate: asyncZodSchema,
      };

      const context = createValidationContext();

      // Test invalid value
      const invalidResult = await validateWithUnifiedConfig(config, 'taken', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].message).toBe('Value is already taken');

      // Test valid value
      const validResult = await validateWithUnifiedConfig(config, 'available', context);
      expect(validResult.isValid).toBe(true);
    });
  });
});
