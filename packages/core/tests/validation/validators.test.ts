import { describe, expect, it } from 'vitest';
import {
  url,
  async,
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
  validateWhen,
} from '../../src/validation';

describe('Built-in Validators', () => {
  describe('required validator', () => {
    it('should accept valid non-empty values', () => {
      const validator = required();

      expect(validator('test', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(123, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(true, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(['item'], createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator({ key: 'value' }, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject empty values', () => {
      const validator = required();

      expect(validator('', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
      expect(validator(null, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
      expect(validator(undefined, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
      expect(validator([], createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'This field is required', code: 'REQUIRED' }],
      });
    });

    it('should accept custom error message', () => {
      const validator = required('Custom error message');

      expect(validator('', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Custom error message', code: 'REQUIRED' }],
      });
    });

    it('should handle edge cases', () => {
      const validator = required();

      // Test with 0 (should be valid)
      expect(validator(0, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });

      // Test with false (should be valid)
      expect(validator(false, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('minLength validator', () => {
    it('should accept strings meeting minimum length', () => {
      const validator = minLength(3);

      expect(validator('abc', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('abcd', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject strings below minimum length', () => {
      const validator = minLength(5);

      expect(validator('ab', createValidationContext())).toEqual({
        isValid: false,
        errors: [
          { message: 'Must be at least 5 characters long', code: 'MIN_LENGTH', path: 'length.5' },
        ],
      });
      expect(validator('', createValidationContext())).toEqual({
        isValid: false,
        errors: [
          { message: 'Must be at least 5 characters long', code: 'MIN_LENGTH', path: 'length.5' },
        ],
      });
    });

    it('should accept custom error message', () => {
      const validator = minLength(10, 'Password too short');

      expect(validator('short', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Password too short', code: 'MIN_LENGTH', path: 'length.10' }],
      });
    });

    it('should handle null/undefined', () => {
      const validator = minLength(1);
      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: false,
        errors: [
          { message: 'Must be at least 1 characters long', code: 'MIN_LENGTH', path: 'length.1' },
        ],
      });
    });
  });

  describe('maxLength validator', () => {
    it('should accept strings within maximum length', () => {
      const validator = maxLength(10);

      expect(validator('short', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('exactly10c', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject strings exceeding maximum length', () => {
      const validator = maxLength(5);

      expect(validator('toolongtext', createValidationContext())).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Must be no more than 5 characters long',
            code: 'MAX_LENGTH',
            path: 'length.5',
          },
        ],
      });
    });

    it('should accept custom error message', () => {
      const validator = maxLength(3, 'Too many characters');

      expect(validator('toolong', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Too many characters', code: 'MAX_LENGTH', path: 'length.3' }],
      });
    });

    it('should handle null/undefined gracefully', () => {
      const validator = maxLength(5);

      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(undefined as any, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('pattern validator', () => {
    it('should accept strings matching the pattern', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validator = pattern(emailPattern);

      expect(validator('test@example.com', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('user.name+tag@domain.co.uk', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject strings not matching the pattern', () => {
      const phonePattern = /^\d{3}-\d{3}-\d{4}$/;
      const validator = pattern(phonePattern);

      expect(validator('invalid-phone', createValidationContext())).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Invalid format',
            code: 'PATTERN_MISMATCH',
            path: 'pattern.^\\d{3}-\\d{3}-\\d{4}$',
          },
        ],
      });
    });

    it('should accept custom error message', () => {
      const validator = pattern(/^\d+$/, 'Only numbers allowed');

      expect(validator('abc123', createValidationContext())).toEqual({
        isValid: false,
        errors: [
          { message: 'Only numbers allowed', code: 'PATTERN_MISMATCH', path: 'pattern.^\\d+$' },
        ],
      });
    });

    it('should handle empty values correctly', () => {
      const validator = pattern(/^.*$/); // Matches anything including empty

      expect(validator('', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });

      // Should pass validation on null/undefined (doesn't validate empty values)
      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('email validator', () => {
    it('should accept valid email addresses', () => {
      const validator = email();

      const validEmails = [
        'test@example.com',
        'user.name+tag@domain.co.uk',
        'user@subdomain.example.org',
        'firstname.lastname@company.com',
        'user+tag@example.com',
        'user_name@example.com',
        'user-name@example.com',
      ];

      for (const email of validEmails) {
        expect(validator(email, createValidationContext())).toEqual({
          isValid: true,
          errors: [],
        });
      }
    });

    it('should reject invalid email addresses', async () => {
      const validator = email();

      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user name@example.com', // space - only this one and others are truly invalid
      ];

      for (const email of invalidEmails) {
        const result = await validator(email, createValidationContext());
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe('INVALID_EMAIL');
      }
    });

    it('should accept custom error message', () => {
      const validator = email('Please provide a valid email');

      expect(validator('invalid', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Please provide a valid email', code: 'INVALID_EMAIL' }],
      });
    });

    it('should handle empty values', () => {
      const validator = email();

      expect(validator('', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('min validator', () => {
    it('should accept numbers above or equal to minimum', () => {
      const validator = min(18);

      expect(validator(18, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(25, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(100, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject numbers below minimum', () => {
      const validator = min(21);

      expect(validator(18, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be at least 21', code: 'MIN_VALUE', path: 'min.21' }],
      });
      expect(validator(0, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be at least 21', code: 'MIN_VALUE', path: 'min.21' }],
      });
      expect(validator(-5, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be at least 21', code: 'MIN_VALUE', path: 'min.21' }],
      });
    });

    it('should accept custom error message', () => {
      const validator = min(13, 'Must be teenager or older');

      expect(validator(10, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be teenager or older', code: 'MIN_VALUE', path: 'min.13' }],
      });
    });

    it('should handle string numbers', () => {
      const validator = min(5);

      expect(validator('10', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('3', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be at least 5', code: 'MIN_VALUE', path: 'min.5' }],
      });
    });

    it('should handle invalid numbers', () => {
      const validator = min(5);

      // NaN should pass (not validate invalid numbers)
      expect(validator('abc', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('max validator', () => {
    it('should accept numbers below or equal to maximum', () => {
      const validator = max(100);

      expect(validator(50, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(100, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(0, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(-10, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject numbers above maximum', () => {
      const validator = max(65);

      expect(validator(70, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be no more than 65', code: 'MAX_VALUE', path: 'max.65' }],
      });
      expect(validator(100, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be no more than 65', code: 'MAX_VALUE', path: 'max.65' }],
      });
    });

    it('should accept custom error message', () => {
      const validator = max(120, 'Age seems unrealistic');

      expect(validator(150, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Age seems unrealistic', code: 'MAX_VALUE', path: 'max.120' }],
      });
    });

    it('should handle string numbers', () => {
      const validator = max(10);

      expect(validator('5', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('15', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be no more than 10', code: 'MAX_VALUE', path: 'max.10' }],
      });
    });
  });

  describe('number validator', () => {
    it('should accept valid numbers', () => {
      const validator = number();

      expect(validator(123, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(0, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(-45.67, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('123', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('123.45', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator('-67.89', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject invalid numbers', () => {
      const validator = number();

      expect(validator('abc', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
      expect(validator('abc123', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
      expect(validator('', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
      expect(validator('  ', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
    });

    it('should accept custom error message', () => {
      const validator = number('Please enter a numeric value');

      expect(validator('abc', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Please enter a numeric value', code: 'INVALID_NUMBER' }],
      });
    });

    it('should handle edge cases', () => {
      const validator = number();

      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
      expect(validator(undefined as any, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });

      // Test infinity
      expect(validator(Number.POSITIVE_INFINITY, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });

      // Test NaN
      expect(validator(Number.NaN, createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Must be a valid number', code: 'INVALID_NUMBER' }],
      });
    });
  });

  describe('url validator', () => {
    it('should accept valid URLs', () => {
      const validator = url();

      const validUrls = [
        'http://example.com',
        'https://example.com',
        'https://www.example.com',
        'https://subdomain.example.com',
        'https://example.com:8080',
        'https://example.com/path',
        'https://example.com/path?query=value',
        'https://example.com/path#anchor',
      ];

      for (const url of validUrls) {
        expect(validator(url, createValidationContext())).toEqual({
          isValid: true,
          errors: [],
        });
      }
    });

    it('should reject invalid URLs', async () => {
      const validator = url();

      const invalidUrls = [
        'not-a-url',
        'http://',
        'https://',
        'example.com', // Missing protocol
        '//example.com', // Missing protocol
      ];

      for (const url of invalidUrls) {
        const result = await validator(url, createValidationContext());
        expect(result.isValid).toBe(false);
        expect(result.errors[0].code).toBe('INVALID_URL');
      }
    });

    it('should accept custom error message', () => {
      const validator = url('Please provide a valid URL');

      expect(validator('invalid-url', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Please provide a valid URL', code: 'INVALID_URL' }],
      });
    });

    it('should handle empty values', () => {
      const validator = url();

      expect(validator('', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
      expect(validator(null as any, createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('custom validator', () => {
    it('should execute custom validation logic', () => {
      const customValidator = custom(
        (value) => value !== 'forbidden',
        'This value is forbidden',
        'CUSTOM'
      );

      expect(customValidator('allowed', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });

      expect(customValidator('forbidden', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'This value is forbidden', code: 'CUSTOM' }],
      });
    });

    it('should pass validation context to custom function', () => {
      const customValidator = custom(
        (value, context) => {
          if (context?.fieldId === 'password' && typeof value === 'string' && value.length < 8) {
            return false;
          }
          return true;
        },
        'Password too short',
        'CUSTOM'
      );

      const context = createValidationContext({ fieldId: 'password' });

      expect(customValidator('short', context)).toEqual({
        isValid: false,
        errors: [{ message: 'Password too short', code: 'CUSTOM' }],
      });

      expect(customValidator('verylongpassword', context)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should use default code when none provided', () => {
      const customValidator = custom((value) => value !== 'fail', 'Validation failed');

      expect(customValidator('fail', createValidationContext())).toEqual({
        isValid: false,
        errors: [{ message: 'Validation failed', code: 'CUSTOM_VALIDATION_FAILED' }],
      });
    });
  });

  describe('matchField validator', () => {
    it('should accept matching field values', () => {
      const validator = matchField('password');
      const context = createValidationContext({
        allFormData: { password: 'secret123', confirmPassword: 'secret123' },
      });

      expect(validator('secret123', context)).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should reject non-matching field values', () => {
      const validator = matchField('password');
      const context = createValidationContext({
        allFormData: { password: 'secret123', confirmPassword: 'different' },
      });

      expect(validator('different', context)).toEqual({
        isValid: false,
        errors: [{ message: 'Fields must match', code: 'FIELD_MISMATCH', path: 'match.password' }],
      });
    });

    it('should accept custom error message', () => {
      const validator = matchField('password', 'Passwords must be identical');
      const context = createValidationContext({
        allFormData: { password: 'secret123', confirmPassword: 'different' },
      });

      expect(validator('different', context)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Passwords must be identical',
            code: 'FIELD_MISMATCH',
            path: 'match.password',
          },
        ],
      });
    });

    it('should handle missing reference field', () => {
      const validator = matchField('nonexistent');
      const context = createValidationContext({
        allFormData: { someField: 'value' },
      });

      expect(validator('value', context)).toEqual({
        isValid: false,
        errors: [
          { message: 'Fields must match', code: 'FIELD_MISMATCH', path: 'match.nonexistent' },
        ],
      });
    });
  });

  describe('async validator', () => {
    it('should create async validator that resolves', async () => {
      const asyncValidator = async(
        () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 10);
          });
        },
        'Async validation failed',
        'ASYNC'
      );

      const result = await asyncValidator('test', createValidationContext());
      expect(result).toEqual({
        isValid: true,
        errors: [],
      });
    });

    it('should create async validator that rejects', async () => {
      const asyncValidator = async(
        () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(false);
            }, 10);
          });
        },
        'Async validation failed',
        'ASYNC'
      );

      const result = await asyncValidator('test', createValidationContext());
      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Async validation failed', code: 'ASYNC' }],
      });
    });

    it('should handle promise rejections gracefully', async () => {
      const asyncValidator = async(
        () => {
          return new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Network error'));
            }, 10);
          });
        },
        'Validation failed',
        'ASYNC'
      );

      const result = await asyncValidator('test', createValidationContext());
      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Network error', code: 'ASYNC_ERROR' }],
      });
    });

    it('should use default error code', async () => {
      const asyncValidator = async(() => {
        return Promise.resolve(false);
      }, 'Validation failed');

      const result = await asyncValidator('test', createValidationContext());
      expect(result).toEqual({
        isValid: false,
        errors: [{ message: 'Validation failed', code: 'ASYNC_VALIDATION_FAILED' }],
      });
    });
  });

  describe('validateWhen validator', () => {
    it('should validate only when condition is met', () => {
      const conditionalValidator = validateWhen(
        (_value, context) => context.allFormData?.userType === 'premium',
        required('Premium users must provide this field')
      );

      // Should not validate when condition is false
      const regularContext = createValidationContext({
        allFormData: { userType: 'regular' },
      });
      expect(conditionalValidator('', regularContext)).toEqual({
        isValid: true,
        errors: [],
      });

      // Should validate when condition is true
      const premiumContext = createValidationContext({
        allFormData: { userType: 'premium' },
      });
      expect(conditionalValidator('', premiumContext)).toEqual({
        isValid: false,
        errors: [{ message: 'Premium users must provide this field', code: 'REQUIRED' }],
      });
    });

    it('should pass when condition is met and validation passes', () => {
      const conditionalValidator = validateWhen(
        (value) => value === 'test',
        minLength(2, 'Too short')
      );

      expect(conditionalValidator('test', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });

      expect(conditionalValidator('other', createValidationContext())).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });

  describe('validator integration', () => {
    it('should combine multiple validators in real-world scenario', () => {
      const passwordValidators = [
        required('Password is required'),
        minLength(8, 'Password must be at least 8 characters'),
        custom(
          (value) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value as string),
          'Password must contain uppercase, lowercase and number',
          'PATTERN_MISMATCH'
        ),
      ];

      const context = createValidationContext();

      // Test empty password
      expect(passwordValidators[0]('', context)).toEqual({
        isValid: false,
        errors: [{ message: 'Password is required', code: 'REQUIRED' }],
      });

      // Test short password
      expect(passwordValidators[1]('short', context)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Password must be at least 8 characters',
            code: 'MIN_LENGTH',
            path: 'length.8',
          },
        ],
      });

      // Test password without pattern
      expect(passwordValidators[2]('longbutnosymbols', context)).toEqual({
        isValid: false,
        errors: [
          {
            message: 'Password must contain uppercase, lowercase and number',
            code: 'PATTERN_MISMATCH',
          },
        ],
      });

      // Test valid password
      expect(passwordValidators[0]('ValidPass123', context)).toEqual({
        isValid: true,
        errors: [],
      });
      expect(passwordValidators[1]('ValidPass123', context)).toEqual({
        isValid: true,
        errors: [],
      });
      expect(passwordValidators[2]('ValidPass123', context)).toEqual({
        isValid: true,
        errors: [],
      });
    });
  });
});
