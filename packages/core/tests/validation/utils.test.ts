import { describe, expect, it } from 'vitest';
import {
  combineValidationResults,
  createErrorResult,
  createSuccessResult,
  createValidationContext,
  createValidationResult,
  runValidators,
  runValidatorsAsync,
} from '../../src/validation/utils';
import { email, required } from '../../src/validation/validators';

describe('Validation Utils', () => {
  describe('createValidationResult', () => {
    it('should create a success result', () => {
      const result = createValidationResult(true);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should create a success result with empty errors array', () => {
      const result = createValidationResult(true, []);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should create an error result with single error', () => {
      const error = { message: 'Field is required', code: 'REQUIRED' };
      const result = createValidationResult(false, [error]);

      expect(result).toEqual({
        isValid: false,
        errors: [error],
      });
    });

    it('should create an error result with multiple errors', () => {
      const errors = [
        { message: 'Field is required', code: 'REQUIRED' },
        { message: 'Invalid format', code: 'PATTERN', path: 'format.email' },
      ];
      const result = createValidationResult(false, errors);

      expect(result).toEqual({
        isValid: false,
        errors,
      });
    });

    it('should clone errors to prevent mutation', () => {
      const errors = [{ message: 'Test error', code: 'TEST' }];
      const result = createValidationResult(false, errors);

      // Modify original array
      errors.push({ message: 'New error', code: 'NEW' });

      // Result should be unchanged
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({ message: 'Test error', code: 'TEST' });
    });
  });

  describe('createSuccessResult', () => {
    it('should create a success result', () => {
      const result = createSuccessResult();

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('createErrorResult', () => {
    it('should create an error result with message only', () => {
      const result = createErrorResult('Test error');

      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Test error' }],
      });
    });

    it('should create an error result with message and code', () => {
      const result = createErrorResult('Test error', 'TEST_CODE');

      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Test error', code: 'TEST_CODE' }],
      });
    });

    it('should create an error result with message, code, and path', () => {
      const result = createErrorResult('Test error', 'TEST_CODE', 'field.path');

      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Test error', code: 'TEST_CODE', path: 'field.path' }],
      });
    });
  });

  describe('createValidationContext', () => {
    it('should create context with default values', () => {
      const context = createValidationContext();

      expect(context).toEqual({
        fieldId: undefined,
        formId: undefined,
        stepId: undefined,
        workflowId: undefined,
        allFormData: {},
        stepData: {},
        workflowData: {},
      });
    });

    it('should create context with provided values', () => {
      const contextData = {
        fieldId: 'email',
        formId: 'registration',
        allFormData: { email: 'test@test.com', name: 'John' },
      };

      const context = createValidationContext(contextData);

      expect(context).toEqual({
        fieldId: 'email',
        formId: 'registration',
        stepId: undefined,
        workflowId: undefined,
        allFormData: { email: 'test@test.com', name: 'John' },
        stepData: {},
        workflowData: {},
      });
    });

    it('should create context with workflow data', () => {
      const contextData = {
        fieldId: 'step1Field',
        stepId: 'personalInfo',
        workflowId: 'onboarding',
        stepData: { firstName: 'John', lastName: 'Doe' },
        workflowData: {
          personalInfo: { firstName: 'John', lastName: 'Doe' },
          preferences: { theme: 'dark' },
        },
      };

      const context = createValidationContext(contextData);

      expect(context).toEqual({
        fieldId: 'step1Field',
        formId: undefined,
        stepId: 'personalInfo',
        workflowId: 'onboarding',
        allFormData: {},
        stepData: { firstName: 'John', lastName: 'Doe' },
        workflowData: {
          personalInfo: { firstName: 'John', lastName: 'Doe' },
          preferences: { theme: 'dark' },
        },
      });
    });

    it('should handle partial context data', () => {
      const context = createValidationContext({ fieldId: 'username' });

      expect(context).toEqual({
        fieldId: 'username',
        formId: undefined,
        stepId: undefined,
        workflowId: undefined,
        allFormData: {},
        stepData: {},
        workflowData: {},
      });
    });
  });

  describe('combineValidationResults', () => {
    it('should return success when all results are valid', () => {
      const results = [
        createValidationResult(true),
        createValidationResult(true),
        createValidationResult(true),
      ];

      const combined = combineValidationResults(results);

      expect(combined).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should return error when any result is invalid', () => {
      const results = [
        createValidationResult(true),
        createValidationResult(false, [{ message: 'Error 1', code: 'ERR1' }]),
        createValidationResult(true),
      ];

      const combined = combineValidationResults(results);

      expect(combined).toEqual({
        isValid: false,
        errors: [{ message: 'Error 1', code: 'ERR1' }],
      });
    });

    it('should combine multiple errors from different results', () => {
      const results = [
        createValidationResult(false, [{ message: 'Error 1', code: 'ERR1' }]),
        createValidationResult(false, [
          { message: 'Error 2', code: 'ERR2' },
          { message: 'Error 3', code: 'ERR3' },
        ]),
        createValidationResult(true),
      ];

      const combined = combineValidationResults(results);

      expect(combined).toEqual({
        isValid: false,
        errors: [
          { message: 'Error 1', code: 'ERR1' },
          { message: 'Error 2', code: 'ERR2' },
          { message: 'Error 3', code: 'ERR3' },
        ],
      });
    });

    it('should handle empty results array', () => {
      const combined = combineValidationResults([]);

      expect(combined).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle single result', () => {
      const result = createValidationResult(false, [{ message: 'Single error', code: 'SINGLE' }]);
      const combined = combineValidationResults([result]);

      expect(combined).toEqual(result);
    });

    it('should preserve error properties', () => {
      const results = [
        createValidationResult(false, [
          {
            message: 'Complex error',
            code: 'COMPLEX',
            path: 'field.nested.value',
          },
        ]),
      ];

      const combined = combineValidationResults(results);

      expect(combined.errors[0]).toEqual({
        message: 'Complex error',
        code: 'COMPLEX',
        path: 'field.nested.value',
      });
    });
  });

  describe('runValidators', () => {
    it('should run all validators and combine results', () => {
      const validators = [required('Field is required'), email('Invalid email format')];
      const context = createValidationContext({ fieldId: 'test' });

      // Test invalid email
      const result = runValidators(validators, 'invalid-email', context);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_EMAIL');
    });

    it('should return success when all validators pass', () => {
      const validators = [required('Field is required'), email('Invalid email format')];
      const context = createValidationContext();

      const result = runValidators(validators, 'test@example.com', context);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle empty validators array', () => {
      const result = runValidators([], 'test-value', createValidationContext());

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should pass correct parameters to validators', () => {
      let capturedValue: any;
      let capturedContext: any;

      const testValidator = (value: any, context: any) => {
        capturedValue = value;
        capturedContext = context;
        return createSuccessResult();
      };

      const testValue = 'test-value';
      const testContext = createValidationContext({ fieldId: 'test-field' });

      runValidators([testValidator], testValue, testContext);

      expect(capturedValue).toBe(testValue);
      expect(capturedContext).toEqual(testContext);
    });

    it('should throw error when async validator is provided', () => {
      const asyncValidator = () => Promise.resolve(createSuccessResult());

      expect(() => {
        runValidators([asyncValidator], 'value', createValidationContext());
      }).toThrow('Use runValidatorsAsync for async validators');
    });
  });

  describe('runValidatorsAsync', () => {
    const mockAsyncValidator1 = async (_value: any, _context: any) =>
      Promise.resolve(createSuccessResult());

    const mockAsyncValidator2 = async (_value: any, _context: any) =>
      Promise.resolve(createErrorResult('Async validation failed', 'ASYNC_FAIL'));

    const mockAsyncValidator3 = async (_value: any, _context: any) =>
      Promise.resolve(createErrorResult('Another async error', 'ASYNC_ANOTHER'));

    it('should run all async validators and combine results', async () => {
      const validators = [mockAsyncValidator1, mockAsyncValidator2, mockAsyncValidator3];
      const context = createValidationContext({ fieldId: 'test' });

      const result = await runValidatorsAsync(validators, 'test-value', context);

      expect(result).toEqual({
        isValid: false,
        errors: [
          { message: 'Async validation failed', code: 'ASYNC_FAIL' },
          { message: 'Another async error', code: 'ASYNC_ANOTHER' },
        ],
      });
    });

    it('should return success when all async validators pass', async () => {
      const validators = [mockAsyncValidator1, mockAsyncValidator1];
      const context = createValidationContext();

      const result = await runValidatorsAsync(validators, 'test-value', context);

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle empty validators array', async () => {
      const result = await runValidatorsAsync([], 'test-value', createValidationContext());

      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should handle mixed sync and async validators', async () => {
      const syncValidator = (_value: any, _context: any) => createSuccessResult();
      const asyncValidator = async (_value: any, _context: any) =>
        Promise.resolve(createErrorResult('Mixed error', 'MIXED'));

      const validators = [syncValidator, asyncValidator];
      const result = await runValidatorsAsync(validators, 'value', createValidationContext());

      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Mixed error', code: 'MIXED' }],
      });
    });

    it('should run validators concurrently', async () => {
      const startTime = Date.now();

      const slowValidator1 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return createSuccessResult();
      };

      const slowValidator2 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return createSuccessResult();
      };

      await runValidatorsAsync(
        [slowValidator1, slowValidator2],
        'value',
        createValidationContext()
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // If running concurrently, should take around 50ms, not 100ms
      expect(executionTime).toBeLessThan(80); // Allow some margin for test environment
    });

    it('should pass correct parameters to async validators', async () => {
      let capturedValue: any;
      let capturedContext: any;

      const testAsyncValidator = async (value: any, context: any) => {
        capturedValue = value;
        capturedContext = context;
        return createSuccessResult();
      };

      const testValue = 'async-test-value';
      const testContext = createValidationContext({ fieldId: 'async-test-field' });

      await runValidatorsAsync([testAsyncValidator], testValue, testContext);

      expect(capturedValue).toBe(testValue);
      expect(capturedContext).toEqual(testContext);
    });
  });

  describe('validation result type consistency', () => {
    it('should ensure all utility functions return consistent ValidationResult structure', () => {
      const successResult = createSuccessResult();
      const errorResult = createErrorResult('Test error');
      const combinedResult = combineValidationResults([successResult, errorResult]);

      // All results should have isValid and errors properties
      expect(successResult).toHaveProperty('isValid');
      expect(successResult).toHaveProperty('errors');
      expect(errorResult).toHaveProperty('isValid');
      expect(errorResult).toHaveProperty('errors');
      expect(combinedResult).toHaveProperty('isValid');
      expect(combinedResult).toHaveProperty('errors');

      // Errors should always be arrays
      expect(Array.isArray(successResult.errors)).toBe(true);
      expect(Array.isArray(errorResult.errors)).toBe(true);
      expect(Array.isArray(combinedResult.errors)).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle complex validation scenarios', async () => {
      const emailValidators = [
        required('Email is required'),
        email('Please provide a valid email'),
      ];

      const context = createValidationContext({
        fieldId: 'userEmail',
        formId: 'registration',
      });

      // Test empty email
      const emptyResult = runValidators(emailValidators, '', context);
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.errors[0].code).toBe('REQUIRED');

      // Test invalid email
      const invalidResult = runValidators(emailValidators, 'invalid-email', context);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors[0].code).toBe('INVALID_EMAIL');

      // Test valid email
      const validResult = runValidators(emailValidators, 'user@example.com', context);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
    });

    it('should work with async validators in real scenarios', async () => {
      // Simulate checking if email is already taken
      const checkEmailUnique = async (value: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (value === 'taken@example.com') {
          return createErrorResult('Email is already taken', 'EMAIL_TAKEN');
        }
        return createSuccessResult();
      };

      const validators = [
        required('Email is required'),
        email('Invalid email format'),
        checkEmailUnique,
      ];

      // Test with taken email
      const takenResult = await runValidatorsAsync(
        validators,
        'taken@example.com',
        createValidationContext()
      );
      expect(takenResult.isValid).toBe(false);
      expect(takenResult.errors.some((e) => e.code === 'EMAIL_TAKEN')).toBe(true);

      // Test with available email
      const availableResult = await runValidatorsAsync(
        validators,
        'available@example.com',
        createValidationContext()
      );
      expect(availableResult.isValid).toBe(true);
    });
  });
});
