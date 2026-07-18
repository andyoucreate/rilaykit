// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { describe, expect, it } from 'vitest';
import { resolveFieldValidation, resolveValidationDescriptor } from '../../src/schema/from-schema';
import type { CustomValidatorFactory, SchemaRegistry } from '../../src/schema/types';

// =================================================================
// HELPERS
// =================================================================

function validateValue(schema: any, value: unknown) {
  return schema['~standard'].validate(value);
}

function expectValid(result: any) {
  expect(result).toHaveProperty('value');
  expect(result).not.toHaveProperty('issues');
}

function expectInvalid(result: any) {
  expect(result).toHaveProperty('issues');
  expect(result.issues.length).toBeGreaterThan(0);
}

function expectErrorMessage(result: any, message: string) {
  expect(result.issues[0].message).toBe(message);
}

// =================================================================
// resolveValidationDescriptor
// =================================================================

describe('resolveValidationDescriptor', () => {
  // ---------------------------------------------------------------
  // String shortcuts
  // ---------------------------------------------------------------

  describe('string shortcuts', () => {
    it('resolves "required" — rejects empty string, accepts "hello"', () => {
      const schema = resolveValidationDescriptor('required');

      const invalid = validateValue(schema, '');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'hello');
      expectValid(valid);
    });

    it('resolves "email" — rejects "notanemail", accepts "test@example.com"', () => {
      const schema = resolveValidationDescriptor('email');

      const invalid = validateValue(schema, 'notanemail');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'test@example.com');
      expectValid(valid);
    });

    it('resolves "url" — rejects "notaurl", accepts "https://example.com"', () => {
      const schema = resolveValidationDescriptor('url');

      const invalid = validateValue(schema, 'notaurl');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'https://example.com');
      expectValid(valid);
    });

    it('resolves "number" — rejects "abc", accepts "42"', () => {
      const schema = resolveValidationDescriptor('number');

      const invalid = validateValue(schema, 'abc');
      expectInvalid(invalid);

      const valid = validateValue(schema, '42');
      expectValid(valid);
    });
  });

  // ---------------------------------------------------------------
  // Parameterized built-ins
  // ---------------------------------------------------------------

  describe('parameterized built-ins', () => {
    it('minLength — rejects "ab", accepts "abc"', () => {
      const schema = resolveValidationDescriptor({
        type: 'minLength',
        params: { min: 3 },
      });

      const invalid = validateValue(schema, 'ab');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'abc');
      expectValid(valid);
    });

    it('maxLength — rejects "abcdef", accepts "abc"', () => {
      const schema = resolveValidationDescriptor({
        type: 'maxLength',
        params: { max: 5 },
      });

      const invalid = validateValue(schema, 'abcdef');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'abc');
      expectValid(valid);
    });

    it('min — rejects 5, accepts 10', () => {
      const schema = resolveValidationDescriptor({
        type: 'min',
        params: { min: 10 },
      });

      const invalid = validateValue(schema, 5);
      expectInvalid(invalid);

      const valid = validateValue(schema, 10);
      expectValid(valid);
    });

    it('max — rejects 101, accepts 100', () => {
      const schema = resolveValidationDescriptor({
        type: 'max',
        params: { max: 100 },
      });

      const invalid = validateValue(schema, 101);
      expectInvalid(invalid);

      const valid = validateValue(schema, 100);
      expectValid(valid);
    });

    it('pattern — rejects "hello", accepts "Hello"', () => {
      const schema = resolveValidationDescriptor({
        type: 'pattern',
        params: { pattern: '^[A-Z]' },
      });

      const invalid = validateValue(schema, 'hello');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'Hello');
      expectValid(valid);
    });
  });

  // ---------------------------------------------------------------
  // Custom message propagation
  // ---------------------------------------------------------------

  describe('custom message propagation', () => {
    it('propagates custom message for zero-param built-in', () => {
      const schema = resolveValidationDescriptor({
        type: 'required',
        message: 'Custom required',
      });

      const result = validateValue(schema, '');
      expectInvalid(result);
      expectErrorMessage(result, 'Custom required');
    });

    it('propagates custom message for parameterized built-in', () => {
      const schema = resolveValidationDescriptor({
        type: 'minLength',
        params: { min: 3 },
        message: 'Too short',
      });

      const result = validateValue(schema, 'ab');
      expectInvalid(result);
      expectErrorMessage(result, 'Too short');
    });
  });

  // ---------------------------------------------------------------
  // Registry validators
  // ---------------------------------------------------------------

  describe('registry validators', () => {
    it('resolves a custom validator from the registry', () => {
      const customValidator: CustomValidatorFactory = () => ({
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value: unknown) => {
            if (value === 'forbidden') {
              return { issues: [{ message: 'Value is forbidden' }] };
            }
            return { value };
          },
        },
      });

      const registry: SchemaRegistry = {
        validators: { forbidden: customValidator },
      };

      const schema = resolveValidationDescriptor({ type: 'forbidden' }, registry);

      const invalid = validateValue(schema, 'forbidden');
      expectInvalid(invalid);

      const valid = validateValue(schema, 'allowed');
      expectValid(valid);
    });

    it('forwards params and message to custom validator factory', () => {
      let receivedParams: Record<string, unknown> | undefined;
      let receivedMessage: string | undefined;

      const customValidator: CustomValidatorFactory = (params, message) => {
        receivedParams = params;
        receivedMessage = message;
        return {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: unknown) => ({ value }),
          },
        };
      };

      const registry: SchemaRegistry = {
        validators: { custom: customValidator },
      };

      resolveValidationDescriptor(
        { type: 'custom', params: { threshold: 42 }, message: 'Too low' },
        registry
      );

      expect(receivedParams).toEqual({ threshold: 42 });
      expect(receivedMessage).toBe('Too low');
    });
  });

  // ---------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------

  describe('error cases', () => {
    it('throws for unknown string shortcut', () => {
      expect(() => resolveValidationDescriptor('unknown' as any)).toThrow();
    });

    it('throws for unknown type without registry', () => {
      expect(() => resolveValidationDescriptor({ type: 'custom' })).toThrow(
        'Unknown validator type: "custom"'
      );
    });

    it('throws for unknown type not found in registry', () => {
      const registry: SchemaRegistry = {
        validators: { other: () => ({}) as any },
      };

      expect(() => resolveValidationDescriptor({ type: 'custom' }, registry)).toThrow(
        'Unknown validator type: "custom"'
      );
    });
  });
});

// =================================================================
// resolveFieldValidation
// =================================================================

describe('resolveFieldValidation', () => {
  it('single rule returns config with single validate schema', () => {
    const config = resolveFieldValidation({
      rules: 'required',
    });

    expect(config.validate).toBeDefined();
    expect(Array.isArray(config.validate)).toBe(false);

    const result = validateValue(config.validate, '');
    expectInvalid(result);
  });

  it('multiple rules returns config with array of validate schemas', () => {
    const config = resolveFieldValidation({
      rules: ['required', 'email'],
    });

    expect(config.validate).toBeDefined();
    expect(Array.isArray(config.validate)).toBe(true);
    expect((config.validate as any[]).length).toBe(2);
  });

  it('passes through debounceMs alongside the resolved validate', () => {
    const config = resolveFieldValidation({
      rules: 'required',
      debounceMs: 300,
    });

    expect(config.debounceMs).toBe(300);
    expect(config.validate).toBeDefined();
  });

  it('no rules returns config without validate property', () => {
    const config = resolveFieldValidation({
      debounceMs: 200,
    });

    expect(config.validate).toBeUndefined();
    expect(config.debounceMs).toBe(200);
  });

  it('registry validators work within resolveFieldValidation', () => {
    const alwaysFail: CustomValidatorFactory = (_params, message) => ({
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [{ message: message ?? 'Always fails' }],
        }),
      },
    });

    const registry: SchemaRegistry = {
      validators: { alwaysFail },
    };

    const config = resolveFieldValidation(
      {
        rules: { type: 'alwaysFail', message: 'Nope' },
      },
      registry
    );

    expect(config.validate).toBeDefined();

    const result = validateValue(config.validate, 'anything');
    expectInvalid(result);
    expectErrorMessage(result, 'Nope');
  });
});
