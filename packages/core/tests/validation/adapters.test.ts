/**
 * @fileoverview Tests for validation adapters
 */

import { describe, expect, it } from 'vitest';
import {
  createValidationContext,
  createZodAdapter,
  zodFieldValidator,
  zodFormValidator,
  zodStepValidator,
} from '../../src/validation';

// Mock Zod-like schema for testing
interface MockZodSchema<T = any> {
  parse(value: unknown): T;
  safeParse(
    value: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { errors: Array<{ message: string; path: (string | number)[] }> } };
}

function createMockSchema(isValid: boolean, errorMessage = 'Validation failed'): MockZodSchema {
  return {
    parse(input: unknown) {
      if (isValid) return input;
      throw new Error(errorMessage);
    },
    safeParse(input: unknown) {
      if (isValid) {
        return { success: true as const, data: input };
      }
      return {
        success: false as const,
        error: {
          errors: [{ message: errorMessage, path: [] }],
        },
      };
    },
  };
}

describe('ZodValidationAdapter', () => {
  const adapter = createZodAdapter();
  const baseContext = createValidationContext();

  describe('createFieldValidator', () => {
    it('should return success for valid schema', () => {
      const validSchema = createMockSchema(true);
      const validator = adapter.createFieldValidator(validSchema);

      const result = validator('test', baseContext);
      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should return errors for invalid schema', () => {
      const invalidSchema = createMockSchema(false, 'Invalid input');
      const validator = adapter.createFieldValidator(invalidSchema);

      const result = validator('test', baseContext);
      expect(result).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Invalid input',
            code: 'VALIDATION_ERROR',
            path: '',
          },
        ],
      });
    });

    it('should handle schema with path in errors', () => {
      const schemaWithPath: MockZodSchema = {
        parse() {
          throw new Error('Should not be called');
        },
        safeParse() {
          return {
            success: false as const,
            error: {
              errors: [
                { message: 'Required field', path: ['email'] },
                { message: 'Too short', path: ['password'] },
              ],
            },
          };
        },
      };

      const validator = adapter.createFieldValidator(schemaWithPath);
      const result = validator('test', baseContext);

      expect(result).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Required field',
            code: 'VALIDATION_ERROR',
            path: 'email',
          },
          {
            message: 'Too short',
            code: 'VALIDATION_ERROR',
            path: 'password',
          },
        ],
      });
    });
  });

  describe('createFormValidator', () => {
    it('should validate entire form data', () => {
      const validSchema = createMockSchema(true);
      const validator = adapter.createFormValidator(validSchema);

      const formData = { email: 'test@example.com', password: 'secret' };
      const result = validator(formData, baseContext);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle form validation errors', () => {
      const invalidSchema = createMockSchema(false, 'Form is invalid');
      const validator = adapter.createFormValidator(invalidSchema);

      const formData = { email: 'invalid', password: 'short' };
      const result = validator(formData, baseContext);

      expect(result).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Form is invalid',
            code: 'VALIDATION_ERROR',
            path: '',
          },
        ],
      });
    });
  });

  describe('createStepValidator', () => {
    it('should validate step data', () => {
      const validSchema = createMockSchema(true);
      const validator = adapter.createStepValidator(validSchema);

      const stepData = { userInfo: { name: 'John', age: 25 } };
      const result = validator(stepData, baseContext);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle step validation errors', () => {
      const invalidSchema = createMockSchema(false, 'Step data is invalid');
      const validator = adapter.createStepValidator(invalidSchema);

      const stepData = { userInfo: { name: '', age: 15 } };
      const result = validator(stepData, baseContext);

      expect(result).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Step data is invalid',
            code: 'VALIDATION_ERROR',
            path: '',
          },
        ],
      });
    });
  });

  describe('helper functions', () => {
    it('zodFieldValidator should create field validator', () => {
      const schema = createMockSchema(true);
      const validator = zodFieldValidator(schema);

      const result = validator('test', baseContext);
      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('zodFormValidator should create form validator', () => {
      const schema = createMockSchema(true);
      const validator = zodFormValidator(schema);

      const result = validator({ test: 'data' }, baseContext);
      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('zodStepValidator should create step validator', () => {
      const schema = createMockSchema(true);
      const validator = zodStepValidator(schema);

      const result = validator({ step: 'data' }, baseContext);
      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('adapter properties', () => {
    it('should have correct name and version', () => {
      expect(adapter.name).toBe('ZodValidationAdapter');
      expect(adapter.version).toBe('1.0.0');
    });
  });

  describe('error handling', () => {
    it('should handle schema.safeParse throwing an error', () => {
      const errorSchema: MockZodSchema = {
        parse() {
          throw new Error('Parse error');
        },
        safeParse() {
          throw new Error('SafeParse error');
        },
      };

      const validator = adapter.createFieldValidator(errorSchema);
      const result = validator('test', baseContext);

      expect(result).toEqual({
        isValid: false,
        errors: [
          {
            message: 'SafeParse error',
            code: 'VALIDATION_ERROR',
          },
        ],
      });
    });
  });
});
