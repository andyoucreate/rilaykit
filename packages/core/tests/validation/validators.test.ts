/**
 * @fileoverview Tests for built-in validators
 */

import { describe, expect, it } from 'vitest';
import {
  createValidationContext,
  custom,
  email,
  matchField,
  max,
  maxLength,
  min,
  minLength,
  number,
  pattern,
  required,
  url,
  when,
} from '../../src/validation';

describe('Validators', () => {
  const baseContext = createValidationContext();

  describe('required', () => {
    const validator = required('This field is required');

    it('should pass for non-empty values', () => {
      expect(validator('hello', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for empty string', () => {
      expect(validator('', baseContext)).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
    });

    it('should fail for null', () => {
      expect(validator(null, baseContext)).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
    });

    it('should fail for undefined', () => {
      expect(validator(undefined, baseContext)).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
    });

    it('should fail for empty array', () => {
      expect(validator([], baseContext)).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
    });
  });

  describe('minLength', () => {
    const validator = minLength(5);

    it('should pass for strings meeting minimum length', () => {
      expect(validator('hello', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should pass for strings exceeding minimum length', () => {
      expect(validator('hello world', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for strings below minimum length', () => {
      expect(validator('hi', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be at least 5 characters long',
            code: 'MIN_LENGTH',
            path: 'length.5',
          },
        ],
      });
    });

    it('should fail for empty strings', () => {
      expect(validator('', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be at least 5 characters long',
            code: 'MIN_LENGTH',
            path: 'length.5',
          },
        ],
      });
    });
  });

  describe('maxLength', () => {
    const validator = maxLength(10);

    it('should pass for strings within maximum length', () => {
      expect(validator('hello', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should pass for strings at maximum length', () => {
      expect(validator('1234567890', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for strings exceeding maximum length', () => {
      expect(validator('this is too long', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be no more than 10 characters long',
            code: 'MAX_LENGTH',
            path: 'length.10',
          },
        ],
      });
    });
  });

  describe('email', () => {
    const validator = email();

    it('should pass for valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+label@example.org',
        'user123@example-domain.com',
      ];

      for (const email of validEmails) {
        expect(validator(email, baseContext)).toEqual({
          isValid: true,
          errors: [],
        });
      }
    });

    it('should fail for invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test.example.com',
        'test@.com',
      ];

      for (const email of invalidEmails) {
        expect(validator(email, baseContext)).toEqual({
          isValid: false,
          errors: [
            {
              message: 'Please enter a valid email address',
              code: 'INVALID_EMAIL',
            },
          ],
        });
      }
    });
  });

  describe('number', () => {
    const validator = number();

    it('should pass for valid numbers', () => {
      expect(validator(42, baseContext)).toEqual({
        isValid: true,
        errors: [],
      });

      expect(validator('42', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });

      expect(validator('42.5', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for invalid numbers', () => {
      expect(validator('not-a-number', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be a valid number',
            code: 'INVALID_NUMBER',
          },
        ],
      });
    });
  });

  describe('min', () => {
    const validator = min(18);

    it('should pass for numbers meeting minimum', () => {
      expect(validator(18, baseContext)).toEqual({
        isValid: true,
        errors: [],
      });

      expect(validator(25, baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for numbers below minimum', () => {
      expect(validator(16, baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be at least 18',
            code: 'MIN_VALUE',
            path: 'min.18',
          },
        ],
      });
    });
  });

  describe('max', () => {
    const validator = max(100);

    it('should pass for numbers within maximum', () => {
      expect(validator(50, baseContext)).toEqual({
        isValid: true,
        errors: [],
      });

      expect(validator(100, baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for numbers exceeding maximum', () => {
      expect(validator(150, baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be no more than 100',
            code: 'MAX_VALUE',
            path: 'max.100',
          },
        ],
      });
    });
  });

  describe('custom', () => {
    const validator = custom(
      (value: string) => value.startsWith('prefix_'),
      'Value must start with prefix_',
      'CUSTOM_PREFIX'
    );

    it('should pass when custom validation passes', () => {
      expect(validator('prefix_test', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail when custom validation fails', () => {
      expect(validator('test', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Value must start with prefix_',
            code: 'CUSTOM_PREFIX',
          },
        ],
      });
    });
  });

  describe('matchField', () => {
    const validator = matchField('password');
    const context = createValidationContext({
      allFormData: { password: 'secret123', confirmPassword: 'secret123' },
    });

    it('should pass when fields match', () => {
      expect(validator('secret123', context)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail when fields do not match', () => {
      expect(validator('different', context)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Fields must match',
            code: 'FIELD_MISMATCH',
            path: 'match.password',
          },
        ],
      });
    });
  });

  describe('when', () => {
    const conditionalRequired = when(
      (_value: any, context: any) => context.allFormData?.userType === 'premium',
      required('This field is required for premium users')
    );

    it('should validate when condition is met', () => {
      const context = createValidationContext({
        allFormData: { userType: 'premium' },
      });

      expect(conditionalRequired('', context)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'This field is required for premium users',
            code: 'REQUIRED',
          },
        ],
      });
    });

    it('should skip validation when condition is not met', () => {
      const context = createValidationContext({
        allFormData: { userType: 'basic' },
      });

      expect(conditionalRequired('', context)).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('pattern', () => {
    const phoneValidator = pattern(/^\d{3}-\d{3}-\d{4}$/, 'Invalid phone format');

    it('should pass for matching patterns', () => {
      expect(phoneValidator('123-456-7890', baseContext)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should fail for non-matching patterns', () => {
      expect(phoneValidator('123456789', baseContext)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Invalid phone format',
            code: 'PATTERN_MISMATCH',
            path: 'pattern.^\\d{3}-\\d{3}-\\d{4}$',
          },
        ],
      });
    });
  });

  describe('url', () => {
    const validator = url();

    it('should pass for valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://test.org',
        'https://sub.domain.co.uk/path?query=value',
      ];

      for (const url of validUrls) {
        expect(validator(url, baseContext)).toEqual({
          isValid: true,
          errors: [],
        });
      }
    });

    it('should fail for invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'ftp://example.com', 'example.com'];

      for (const url of invalidUrls) {
        expect(validator(url, baseContext)).toEqual({
          isValid: false,
          errors: [
            {
              message: 'Please enter a valid URL',
              code: 'INVALID_URL',
            },
          ],
        });
      }
    });
  });
});
