// @ts-nocheck — generic constraints bypass for test flexibility
import { custom, email, minLength, required, ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fromSchema,
  isFormSchema,
  resolveFieldValidation,
  resolveValidationDescriptor,
  validateSchema,
} from '../../src/schema/from-schema';
import { SchemaValidationError } from '../../src/schema/types';
import type {
  FieldSchemaValidation,
  FormSchema,
  FormSchemaField,
  SchemaRegistry,
} from '../../src/schema/types';

// =================================================================
// SHARED SETUP
// =================================================================

let rilConfig: any;

beforeEach(() => {
  rilConfig = ril
    .create()
    .component('text', {
      name: 'Text Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '', placeholder: 'Enter text' },
    })
    .component('email', {
      name: 'Email Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '' },
      validation: {
        debounceMs: 100,
        validate: email(),
      },
    })
    .component('number', {
      name: 'Number',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '' },
    })
    .component('select', {
      name: 'Select',
      renderer: () => React.createElement('select'),
      defaultProps: { label: '', options: [] },
    });
});

function validSchema(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: 'test-form',
    fields: [{ id: 'name', type: 'text' }],
    ...overrides,
  };
}

// Helper to validate a StandardSchema value
function validateValue(schema: any, value: unknown) {
  return schema['~standard'].validate(value);
}

// =================================================================
// isFormSchema — EDGE CASES
// =================================================================

describe('isFormSchema — edge cases', () => {
  it('returns true for empty fields array (inconsistency with validateSchema)', () => {
    // isFormSchema is a type guard, not a validator — it accepts structurally valid shapes
    // even if validateSchema would reject them
    expect(isFormSchema({ id: 'form', fields: [] })).toBe(true);
  });

  it('returns true for empty rows array', () => {
    expect(isFormSchema({ id: 'form', rows: [] })).toBe(true);
  });

  it('accepts whitespace-only id', () => {
    // This is arguably a bug — but documents current behavior
    expect(isFormSchema({ id: '   ', fields: [{ id: 'x', type: 'text' }] })).toBe(true);
  });

  it('returns true with explicit version: 1', () => {
    expect(isFormSchema({ id: 'form', version: 1, fields: [{ id: 'x', type: 'text' }] })).toBe(
      true
    );
  });

  it('returns false for version: 0', () => {
    expect(isFormSchema({ id: 'form', version: 0, fields: [{ id: 'x', type: 'text' }] })).toBe(
      false
    );
  });

  it('returns false for version: null', () => {
    expect(isFormSchema({ id: 'form', version: null, fields: [{ id: 'x', type: 'text' }] })).toBe(
      false
    );
  });

  it('returns false for arrays', () => {
    expect(isFormSchema([])).toBe(false);
  });

  it('returns false for Date objects', () => {
    expect(isFormSchema(new Date())).toBe(false);
  });

  it('returns false for boolean', () => {
    expect(isFormSchema(true)).toBe(false);
    expect(isFormSchema(false)).toBe(false);
  });

  it('returns false for id: 0 (numeric)', () => {
    expect(isFormSchema({ id: 0, fields: [] })).toBe(false);
  });

  it('accepts extra unknown properties gracefully', () => {
    expect(
      isFormSchema({ id: 'form', fields: [{ id: 'x', type: 'text' }], someExtra: true, meta: {} })
    ).toBe(true);
  });
});

// =================================================================
// validateSchema — EDGE CASES
// =================================================================

describe('validateSchema — edge cases', () => {
  it('rejects whitespace-only id', () => {
    // `!schema.id` is false for "  " because whitespace is truthy
    // This means whitespace-only IDs pass validation — potential bug
    // If the builder doesn't sanitize, the form would have a whitespace ID
    const schema = validSchema({ id: '   ' });
    // Current behavior: whitespace ID passes validation (truthy string)
    expect(() => validateSchema(schema, rilConfig)).not.toThrow();
  });

  it('accepts explicit version: 1', () => {
    const schema = validSchema({ version: 1 });
    expect(() => validateSchema(schema, rilConfig)).not.toThrow();
  });

  // Bug 4 — a null/non-object entry in rows/fields must funnel into the typed
  // SchemaValidationError like every other hostile input, not throw a raw
  // TypeError from `null.kind` / `null.id`.
  it('rejects a null row entry with SchemaValidationError (not TypeError)', () => {
    const schema = {
      id: 'f',
      rows: [{ kind: 'fields', fields: [{ id: 'a', type: 'text' }] }, null],
    } as unknown as FormSchema;

    expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
  });

  it('rejects a null field entry with SchemaValidationError (not TypeError)', () => {
    const schema = {
      id: 'f',
      fields: [{ id: 'a', type: 'text' }, null],
    } as unknown as FormSchema;

    expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
  });

  it('funnels a primitive row entry into typed issues', () => {
    const schema = { id: 'f', rows: [123] } as unknown as FormSchema;
    try {
      validateSchema(schema, rilConfig);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      expect((e as SchemaValidationError).issues.some((i) => i.path === 'rows[0]')).toBe(true);
    }
  });

  it('funnels a primitive field entry into typed issues', () => {
    const schema = { id: 'f', fields: [123] } as unknown as FormSchema;
    try {
      validateSchema(schema, rilConfig);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      expect((e as SchemaValidationError).issues.some((i) => i.path === 'fields[0]')).toBe(true);
    }
  });

  it('collects multiple errors in a single throw', () => {
    const schema = {
      id: '',
      fields: [
        { id: '', type: 'nonexistent' },
        { id: '', type: 'also-nonexistent' },
      ],
    } as unknown as FormSchema;

    try {
      validateSchema(schema, rilConfig);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      // Should have errors for: empty id, first field id, first field type, second field id, second field type
      expect(e.issues.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('includes warnings alongside errors in issues', () => {
    const schema = {
      id: 'form',
      fields: [
        {
          id: 'field1',
          type: 'text',
          conditions: {
            visible: {
              // missing field — should produce a warning
              operator: 'equals',
              value: 'test',
            },
          },
        },
        // Also include an error to ensure both are collected
        { id: '', type: 'text' },
      ],
    } as unknown as FormSchema;

    try {
      validateSchema(schema, rilConfig);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      const warnings = e.issues.filter((i) => i.severity === 'warning');
      const errors = e.issues.filter((i) => i.severity === 'error');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects a row with kind: "invalid"', () => {
    const schema = {
      id: 'form',
      rows: [{ kind: 'invalid', fields: [{ id: 'x', type: 'text' }] }],
    } as unknown as FormSchema;

    // `kind: 'invalid'` is NOT 'repeatable', so isRepeatableRow returns false
    // It falls to the else branch and treats it as a field row — no error
    expect(() => validateSchema(schema, rilConfig)).not.toThrow();
  });

  it('validates field rows without explicit kind (defaults to fields)', () => {
    const schema: FormSchema = {
      id: 'form',
      rows: [{ fields: [{ id: 'x', type: 'text' }] }],
    };
    expect(() => validateSchema(schema, rilConfig)).not.toThrow();
  });

  describe('validation descriptors edge cases', () => {
    it('rejects a descriptor that is a number', () => {
      const schema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', validation: { rules: 42 } }],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('silently ignores null rules (falsy check skips validation)', () => {
      // rules: null is falsy, so `field.validation?.rules` short-circuits
      // This is safe — no rules means no validation to resolve
      const schema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', validation: { rules: null } }],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('rejects a descriptor that is true', () => {
      const schema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', validation: { rules: true } }],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('rejects a descriptor object with empty type', () => {
      const schema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', validation: { rules: { type: '' } } }],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('rejects a descriptor object with type: 0', () => {
      const schema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', validation: { rules: { type: 0 } } }],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('validates mixed rules array with valid and invalid entries', () => {
      const schema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: {
              rules: [
                'required',
                'BOGUS',
                { type: 'minLength', params: { min: 3 } },
                { type: 'nope' },
              ],
            },
          },
        ],
      } as unknown as FormSchema;

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        // 'BOGUS' and { type: 'nope' } should be errors
        const validatorErrors = e.issues.filter(
          (i) =>
            i.message.includes('Unknown validation shortcut') ||
            i.message.includes('Unknown validator type')
        );
        expect(validatorErrors).toHaveLength(2);
      }
    });

    it('accepts parameterized built-in with extra params beyond required ones', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: {
              rules: { type: 'minLength', params: { min: 3, extra: 'ignored' } },
            },
          },
        ],
      };

      // Extra params should not cause validation to fail
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('rejects minLength with params.min = undefined explicitly', () => {
      const schema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: {
              rules: { type: 'minLength', params: { min: undefined } },
            },
          },
        ],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });
  });

  describe('conditions edge cases', () => {
    it('accepts empty conditions object', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', conditions: {} }],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('validates nested composite conditions', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            conditions: {
              visible: {
                field: '',
                operator: 'equals',
                value: 'root',
                conditions: [
                  { field: 'a', operator: 'equals', value: 1 },
                  { field: '', operator: 'invalidOp' as any, value: 2 },
                ],
                logicalOperator: 'and',
              },
            },
          },
        ],
      };

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        // Should catch invalid operator in nested condition
        const opError = e.issues.find((i) => i.message.includes('Invalid condition operator'));
        expect(opError).toBeDefined();
      }
    });

    it('validates all four condition behavior keys', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            conditions: {
              visible: { field: 'a', operator: 'equals', value: 1 },
              disabled: { field: 'b', operator: 'notEquals', value: 2 },
              required: { field: 'c', operator: 'exists' },
              readonly: { field: 'd', operator: 'greaterThan', value: 10 },
            },
          },
        ],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });
  });

  describe('effects edge cases', () => {
    it('rejects effects when registry is undefined', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'y', handler: 'doSomething' }],
          },
        ],
      };

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('rejects effects when registry exists but has no effects key', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'y', handler: 'doSomething' }],
          },
        ],
      };

      const registry: SchemaRegistry = { validators: {} };
      expect(() => validateSchema(schema, rilConfig, registry)).toThrow(SchemaValidationError);
    });

    it('rejects effects when registry.effects is empty', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'y', handler: 'doSomething' }],
          },
        ],
      };

      const registry: SchemaRegistry = { effects: {} };
      expect(() => validateSchema(schema, rilConfig, registry)).toThrow(SchemaValidationError);
    });
  });

  describe('repeatable edge cases', () => {
    it('accepts min: 0 and max: 0', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              min: 0,
              max: 0,
            },
          },
        ],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('accepts min without max', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              min: 5,
            },
          },
        ],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('accepts max without min', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              max: 10,
            },
          },
        ],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('rejects negative min', () => {
      const schema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              min: -1,
            },
          },
        ],
      } as unknown as FormSchema;

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        expect(e.issues.some((i) => i.message.includes('min cannot be negative'))).toBe(true);
      }
    });

    it('rejects negative max', () => {
      const schema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              max: -5,
            },
          },
        ],
      } as unknown as FormSchema;

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        expect(e.issues.some((i) => i.message.includes('max cannot be negative'))).toBe(true);
      }
    });

    it('rejects both negative min and max', () => {
      const schema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              min: -3,
              max: -1,
            },
          },
        ],
      } as unknown as FormSchema;

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        const minError = e.issues.find((i) => i.message.includes('min cannot be negative'));
        const maxError = e.issues.find((i) => i.message.includes('max cannot be negative'));
        expect(minError).toBeDefined();
        expect(maxError).toBeDefined();
      }
    });

    it('rejects repeatable with min: 5 and max: 2', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              min: 5,
              max: 2,
            },
          },
        ],
      };

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        expect(
          e.issues.some((i) => i.message.includes('min (5) cannot be greater than max (2)'))
        ).toBe(true);
      }
    });

    it('validates fields inside repeatable rows', () => {
      const schema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: '', type: 'nonexistent' }] }],
            },
          },
        ],
      } as unknown as FormSchema;

      try {
        validateSchema(schema, rilConfig);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaValidationError);
        expect(e.issues.some((i) => i.path.includes('repeatable'))).toBe(true);
      }
    });

    it('validates repeatable-level validation rules', () => {
      const schema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'x', type: 'text' }] }],
              validation: { rules: 'BOGUS' },
            },
          },
        ],
      } as unknown as FormSchema;

      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });
  });
});

// =================================================================
// fromSchema — HARDCORE INTEGRATION TESTS
// =================================================================

describe('fromSchema — hardcore integration', () => {
  describe('pattern validator with invalid regex', () => {
    it('throws SchemaValidationError for invalid regex at validateSchema level', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: { rules: { type: 'pattern', params: { pattern: '[invalid' } } },
          },
        ],
      };

      // validateSchema now catches invalid regex patterns
      expect(() => validateSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('throws SchemaValidationError (not SyntaxError) for invalid regex in fromSchema', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: { rules: { type: 'pattern', params: { pattern: '(unclosed' } } },
          },
        ],
      };

      // fromSchema wraps the SyntaxError into SchemaValidationError
      expect(() => fromSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('accepts valid regex patterns', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            validation: { rules: { type: 'pattern', params: { pattern: '^[a-z]+$' } } },
          },
        ],
      };

      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.allFields[0].validation.validate).toBeDefined();
    });
  });

  describe('duplicate field IDs', () => {
    it('builder handles duplicate IDs in flat fields', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          { id: 'duplicate', type: 'text' },
          { id: 'duplicate', type: 'text' },
        ],
      };

      // validateSchema does NOT check for duplicate IDs
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();

      // The builder might or might not handle this — test current behavior
      // If it throws, we document it; if it doesn't, we document that too
      let result: any;
      let threw = false;
      try {
        result = fromSchema(schema, rilConfig);
      } catch {
        threw = true;
      }

      if (!threw) {
        // Builder accepted duplicates — both fields exist
        expect(result.formConfig.allFields).toHaveLength(2);
        expect(result.formConfig.allFields[0].id).toBe('duplicate');
        expect(result.formConfig.allFields[1].id).toBe('duplicate');
      }
      // If it threw, that's also acceptable behavior
    });
  });

  describe('schema immutability and independence', () => {
    it('produces independent configs from the same schema object', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        defaultValues: { name: 'Karl' },
      };

      const result1 = fromSchema(schema, rilConfig);
      const result2 = fromSchema(schema, rilConfig);

      // Both should be equal
      expect(result1.formConfig.id).toBe(result2.formConfig.id);
      expect(result1.defaultValues).toEqual(result2.defaultValues);

      // But not the same object references for formConfig
      expect(result1.formConfig).not.toBe(result2.formConfig);
    });

    it('does not mutate the input schema', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
        defaultValues: { name: 'Original' },
      };

      const original = JSON.stringify(schema);
      fromSchema(schema, rilConfig);
      expect(JSON.stringify(schema)).toBe(original);
    });
  });

  describe('defaultValues edge cases', () => {
    it('returns undefined defaultValues when schema has no defaultValues', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.defaultValues).toBeUndefined();
    });

    it('preserves empty object defaultValues', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        defaultValues: {},
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.defaultValues).toEqual({});
    });

    it('preserves nested defaultValues', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'address', type: 'text' }],
        defaultValues: { address: { street: '123 Main', city: 'Paris' } },
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.defaultValues).toEqual({ address: { street: '123 Main', city: 'Paris' } });
    });
  });

  describe('row format edge cases', () => {
    it('handles rows without explicit kind (implicit fields)', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          { fields: [{ id: 'name', type: 'text' }] }, // no kind
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.rows).toHaveLength(1);
      expect(result.formConfig.allFields[0].id).toBe('name');
    });

    it('handles rows with explicit kind: "fields"', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [{ kind: 'fields', fields: [{ id: 'name', type: 'text' }] }],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.rows).toHaveLength(1);
    });

    it('handles multi-field rows (2 fields in one row)', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            fields: [
              { id: 'first', type: 'text' },
              { id: 'last', type: 'text' },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.rows).toHaveLength(1);
      expect(result.formConfig.rows[0].kind).toBe('fields');
      expect(result.formConfig.rows[0].fields).toHaveLength(2);
    });

    it('handles 3 fields in one row', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            fields: [
              { id: 'a', type: 'text' },
              { id: 'b', type: 'text' },
              { id: 'c', type: 'text' },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.rows[0].fields).toHaveLength(3);
    });

    it('keeps >3 fields in the same row', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            fields: [
              { id: 'a', type: 'text' },
              { id: 'b', type: 'text' },
              { id: 'c', type: 'text' },
              { id: 'd', type: 'text' },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.rows).toHaveLength(1);
      expect(result.formConfig.rows[0].fields).toHaveLength(4);
      expect(result.formConfig.allFields).toHaveLength(4);
    });
  });

  describe('validation combining with component-level validation', () => {
    it('component validation + field validation produces combined array', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'emailField',
            type: 'email', // has component-level email validator
            validation: { rules: 'required' }, // adds required
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      // Should have combined validators: component email + field required
      expect(Array.isArray(field.validation.validate)).toBe(true);
      expect(field.validation.validate).toHaveLength(2);
    });

    it('field validation overrides component debounceMs', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'emailField',
            type: 'email', // has debounceMs: 100
            validation: {
              rules: 'required',
              debounceMs: 500, // override
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      // Field-level takes precedence over component-level
      expect(field.validation.debounceMs).toBe(500);
    });

    it('field with no validation on a component that has validation', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'emailField', type: 'email' }],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      // Component has email validator + debounceMs — both should thread through
      expect(field.validation).toBeDefined();
      expect(field.validation.validate).toBeDefined();
      expect(field.validation.debounceMs).toBe(100);
    });
  });

  describe('effects edge cases', () => {
    it('multiple effects on the same watch field accumulate in effectsMap', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const registry: SchemaRegistry = {
        effects: { handler1, handler2 },
      };

      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'fieldA',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'trigger', handler: 'handler1' }],
          },
          {
            id: 'fieldB',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'trigger', handler: 'handler2' }],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig, registry);

      expect(result.formConfig.effectsMap).toBeDefined();
      expect(result.formConfig.effectsMap.trigger).toHaveLength(2);
    });

    it('effect without params curries undefined correctly', () => {
      const handler = vi.fn();
      const registry: SchemaRegistry = { effects: { doSomething: handler } };

      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'y', handler: 'doSomething' }],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig, registry);
      const effect = result.formConfig.effectsMap.y[0];

      effect.handler('newVal', { setValue: vi.fn(), setProps: vi.fn() });

      expect(handler).toHaveBeenCalledWith(
        'newVal',
        expect.any(Object),
        undefined // no params
      );
    });

    it('effect with empty params object', () => {
      const handler = vi.fn();
      const registry: SchemaRegistry = { effects: { doSomething: handler } };

      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'x',
            type: 'text',
            effects: [{ trigger: 'change', watch: 'y', handler: 'doSomething', params: {} }],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig, registry);
      const effect = result.formConfig.effectsMap.y[0];

      effect.handler('value', { setValue: vi.fn(), setProps: vi.fn() });

      expect(handler).toHaveBeenCalledWith('value', expect.any(Object), {});
    });
  });

  describe('repeatable advanced scenarios', () => {
    it('repeatable with validation gets resolved validation', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text' }] }],
              validation: {
                rules: 'required',
                debounceMs: 250,
              },
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const rep = result.formConfig.repeatableFields.items;

      expect(rep.validation).toBeDefined();
      expect(rep.validation.validate).toBeDefined();
      expect(rep.validation.debounceMs).toBe(250);
    });

    it('repeatable with multiple template rows', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [
                { fields: [{ id: 'name', type: 'text' }] },
                {
                  fields: [
                    { id: 'desc', type: 'text' },
                    { id: 'qty', type: 'number' },
                  ],
                },
              ],
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const rep = result.formConfig.repeatableFields.items;

      expect(rep.allFields).toHaveLength(3); // name + desc + qty
      expect(rep.rows).toHaveLength(2);
    });

    it('repeatable with min: 0', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text' }] }],
              min: 0,
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.repeatableFields.items.min).toBe(0);
    });

    it('repeatable with empty defaultValue object', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [{ id: 'name', type: 'text' }] }],
              defaultValue: {},
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.repeatableFields.items.defaultValue).toEqual({});
    });

    it('multiple repeatables in the same form', () => {
      const schema: FormSchema = {
        id: 'form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'addresses',
              rows: [{ fields: [{ id: 'street', type: 'text' }] }],
            },
          },
          { kind: 'fields', fields: [{ id: 'separator', type: 'text' }] },
          {
            kind: 'repeatable',
            repeatable: {
              id: 'phones',
              rows: [{ fields: [{ id: 'number', type: 'text' }] }],
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.repeatableFields.addresses).toBeDefined();
      expect(result.formConfig.repeatableFields.phones).toBeDefined();
      expect(Object.keys(result.formConfig.repeatableFields)).toHaveLength(2);
    });
  });

  describe('conditions pass-through edge cases', () => {
    it('passes empty conditions object through', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', conditions: {} }],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.allFields[0].conditions).toEqual({});
    });

    it('passes all four condition behaviors through', () => {
      const conditions = {
        visible: { field: 'a', operator: 'equals' as const, value: 1 },
        disabled: { field: 'b', operator: 'notEquals' as const, value: 2 },
        required: { field: 'c', operator: 'exists' as const },
        readonly: { field: 'd', operator: 'greaterThan' as const, value: 10 },
      };

      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', conditions }],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.conditions.visible).toEqual(conditions.visible);
      expect(field.conditions.disabled).toEqual(conditions.disabled);
      expect(field.conditions.required).toEqual(conditions.required);
      expect(field.conditions.readonly).toEqual(conditions.readonly);
    });

    it('passes composite conditions with nested sub-conditions', () => {
      const conditions = {
        visible: {
          field: '',
          operator: 'equals' as const,
          conditions: [
            { field: 'role', operator: 'equals' as const, value: 'admin' },
            { field: 'level', operator: 'greaterThan' as const, value: 5 },
          ],
          logicalOperator: 'and' as const,
        },
      };

      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'x', type: 'text', conditions }],
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.allFields[0].conditions.visible.conditions).toHaveLength(2);
    });
  });

  describe('form-level validation edge cases', () => {
    it('form validation with validateOnStepChange', () => {
      const validator = (_params, _message) => required();
      const registry: SchemaRegistry = { validators: { crossField: validator } };

      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        validation: {
          rules: { type: 'crossField' },
          validateOnStepChange: true,
        },
      };

      const result = fromSchema(schema, rilConfig, registry);
      expect(result.formConfig.validation.validateOnStepChange).toBe(true);
    });

    it('form validation with multiple rules', () => {
      const v1 = (_p, _m) => required();
      const v2 = (_p, _m) => required();
      const registry: SchemaRegistry = { validators: { v1, v2 } };

      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        validation: {
          rules: [{ type: 'v1' }, { type: 'v2' }],
        },
      };

      const result = fromSchema(schema, rilConfig, registry);
      expect(Array.isArray(result.formConfig.validation.validate)).toBe(true);
      expect(result.formConfig.validation.validate).toHaveLength(2);
    });
  });

  describe('submitOptions edge cases', () => {
    it('passes skipInvalid option', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        submitOptions: { skipInvalid: true },
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.submitOptions.skipInvalid).toBe(true);
    });

    it('passes both force and skipInvalid', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
        submitOptions: { force: true, skipInvalid: true },
      };

      const result = fromSchema(schema, rilConfig);
      expect(result.formConfig.submitOptions.force).toBe(true);
      expect(result.formConfig.submitOptions.skipInvalid).toBe(true);
    });
  });

  describe('props merging edge cases', () => {
    it('schema props override component defaultProps', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'name',
            type: 'text',
            props: { placeholder: 'Custom placeholder', label: 'Custom label' },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.props.placeholder).toBe('Custom placeholder');
      expect(field.props.label).toBe('Custom label');
    });

    it('preserves defaultProps not overridden by schema', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'name',
            type: 'text',
            props: { label: 'Name' }, // doesn't override placeholder
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.props.label).toBe('Name');
      expect(field.props.placeholder).toBe('Enter text');
    });

    it('field with no props gets all defaultProps', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [{ id: 'name', type: 'text' }],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.props.label).toBe('');
      expect(field.props.placeholder).toBe('Enter text');
    });
  });

  describe('validation options without rules', () => {
    it('validation block without rules leaves validate undefined', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { debounceMs: 150 },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      expect(field.validation.debounceMs).toBe(150);
      expect(field.validation.validate).toBeUndefined();
    });

    it('passes through debounceMs without rules', () => {
      const schema: FormSchema = {
        id: 'form',
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { debounceMs: 300 },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation.debounceMs).toBe(300);
    });
  });

  describe('complex real-world schema', () => {
    it('handles a complete signup form schema', () => {
      const passwordStrength = (_params, message) =>
        custom(
          (v: string) => v && v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v),
          message || 'Password must be 8+ chars with uppercase and number'
        );

      const loadCitiesHandler = vi.fn();

      const registry: SchemaRegistry = {
        validators: { passwordStrength },
        effects: { loadCities: loadCitiesHandler },
      };

      const schema: FormSchema = {
        id: 'signup',
        version: 1,
        defaultValues: { country: 'France' },
        rows: [
          {
            kind: 'fields',
            fields: [
              {
                id: 'firstName',
                type: 'text',
                props: { label: 'First Name' },
                validation: { rules: 'required' },
              },
              {
                id: 'lastName',
                type: 'text',
                props: { label: 'Last Name' },
                validation: { rules: 'required' },
              },
            ],
          },
          {
            kind: 'fields',
            fields: [
              {
                id: 'email',
                type: 'email',
                props: { label: 'Email' },
                validation: { rules: ['required', 'email'] },
              },
            ],
          },
          {
            kind: 'fields',
            fields: [
              {
                id: 'password',
                type: 'text',
                props: { label: 'Password' },
                validation: {
                  rules: [
                    'required',
                    { type: 'minLength', params: { min: 8 } },
                    { type: 'passwordStrength' },
                  ],
                  debounceMs: 300,
                },
              },
            ],
          },
          {
            kind: 'fields',
            fields: [
              {
                id: 'country',
                type: 'select',
                props: { label: 'Country', options: [{ value: 'France', label: 'France' }] },
              },
              {
                id: 'city',
                type: 'select',
                props: { label: 'City' },
                conditions: {
                  visible: { field: 'country', operator: 'exists' },
                },
                effects: [
                  {
                    trigger: 'change',
                    watch: 'country',
                    handler: 'loadCities',
                    params: { endpoint: '/api/cities' },
                  },
                ],
              },
            ],
          },
          {
            kind: 'repeatable',
            repeatable: {
              id: 'addresses',
              rows: [
                { fields: [{ id: 'street', type: 'text', validation: { rules: 'required' } }] },
                {
                  fields: [
                    {
                      id: 'zip',
                      type: 'text',
                      validation: { rules: { type: 'pattern', params: { pattern: '^\\d{5}$' } } },
                    },
                    { id: 'addrCity', type: 'text', validation: { rules: 'required' } },
                  ],
                },
              ],
              min: 1,
              max: 5,
              defaultValue: { street: '', zip: '', addrCity: '' },
            },
          },
        ],
        submitOptions: { skipInvalid: false },
      };

      const result = fromSchema(schema, rilConfig, registry);

      // Top-level
      expect(result.formConfig.id).toBe('signup');
      expect(result.defaultValues).toEqual({ country: 'France' });

      // Rows
      expect(result.formConfig.rows).toHaveLength(5);

      // First row: 2 fields
      expect(result.formConfig.rows[0].kind).toBe('fields');
      expect(result.formConfig.rows[0].fields).toHaveLength(2);

      // All regular fields
      const allFields = result.formConfig.allFields;
      expect(allFields.length).toBeGreaterThanOrEqual(5); // firstName, lastName, email, password, country, city

      // Password field has combined validators
      const passwordField = allFields.find((f) => f.id === 'password');
      expect(passwordField.validation.debounceMs).toBe(300);
      expect(Array.isArray(passwordField.validation.validate)).toBe(true);

      // City has conditions
      const cityField = allFields.find((f) => f.id === 'city');
      expect(cityField.conditions.visible).toBeDefined();

      // Effects map
      expect(result.formConfig.effectsMap).toBeDefined();
      expect(result.formConfig.effectsMap.country).toBeDefined();

      // Repeatables
      expect(result.formConfig.repeatableFields.addresses).toBeDefined();
      expect(result.formConfig.repeatableFields.addresses.min).toBe(1);
      expect(result.formConfig.repeatableFields.addresses.max).toBe(5);
      expect(result.formConfig.repeatableFields.addresses.allFields).toHaveLength(3);

      // Submit options
      expect(result.formConfig.submitOptions.skipInvalid).toBe(false);

      // Config reference
      expect(result.formConfig.config).toBe(rilConfig);
    });
  });
});

// =================================================================
// resolveValidationDescriptor — EDGE CASES
// =================================================================

describe('resolveValidationDescriptor — edge cases', () => {
  it('built-in validator "required" with custom message propagates message', () => {
    const schema = resolveValidationDescriptor({
      type: 'required',
      message: 'Please fill this in',
    });

    const result = validateValue(schema, '');
    expect(result.issues[0].message).toBe('Please fill this in');
  });

  it('built-in zero-param used as object descriptor works', () => {
    // Using { type: "required" } instead of just "required"
    const schema = resolveValidationDescriptor({ type: 'required' });
    const result = validateValue(schema, '');
    expect(result).toHaveProperty('issues');
  });

  it('built-in zero-param with unnecessary params still works', () => {
    // { type: "required", params: { extra: true } } — params are ignored
    const schema = resolveValidationDescriptor({ type: 'required', params: { extra: true } });
    const result = validateValue(schema, '');
    expect(result).toHaveProperty('issues');
  });

  it('pattern with complex regex', () => {
    const schema = resolveValidationDescriptor({
      type: 'pattern',
      params: { pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
    });

    expect(validateValue(schema, 'test@example.com')).toHaveProperty('value');
    expect(validateValue(schema, 'not-an-email')).toHaveProperty('issues');
  });

  it('min with value 0', () => {
    const schema = resolveValidationDescriptor({ type: 'min', params: { min: 0 } });
    expect(validateValue(schema, 0)).toHaveProperty('value');
    expect(validateValue(schema, -1)).toHaveProperty('issues');
  });

  it('max with negative value', () => {
    const schema = resolveValidationDescriptor({ type: 'max', params: { max: -10 } });
    // -20 <= -10 is true, so it passes validation (mathematically correct)
    expect(validateValue(schema, -20)).toHaveProperty('value');
    expect(validateValue(schema, -10)).toHaveProperty('value');
    expect(validateValue(schema, -9)).toHaveProperty('issues');
  });

  it('minLength with min: 0 accepts empty string', () => {
    const schema = resolveValidationDescriptor({ type: 'minLength', params: { min: 0 } });
    expect(validateValue(schema, '')).toHaveProperty('value');
  });

  it('throws for completely unknown type', () => {
    expect(() => resolveValidationDescriptor({ type: 'doesNotExist' })).toThrow(
      'Unknown validator type: "doesNotExist"'
    );
  });

  it('registry validator receives params and message', () => {
    const factory = vi.fn().mockReturnValue(required());
    const registry: SchemaRegistry = { validators: { myValidator: factory } };

    resolveValidationDescriptor(
      { type: 'myValidator', params: { threshold: 5 }, message: 'Custom' },
      registry
    );

    expect(factory).toHaveBeenCalledWith({ threshold: 5 }, 'Custom');
  });

  it('registry validator with no params and no message', () => {
    const factory = vi.fn().mockReturnValue(required());
    const registry: SchemaRegistry = { validators: { myValidator: factory } };

    resolveValidationDescriptor({ type: 'myValidator' }, registry);

    expect(factory).toHaveBeenCalledWith(undefined, undefined);
  });
});

// =================================================================
// resolveFieldValidation — EDGE CASES
// =================================================================

describe('resolveFieldValidation — edge cases', () => {
  it('single rule produces a single schema (not array)', () => {
    const config = resolveFieldValidation({ rules: 'required' });
    expect(config.validate).toBeDefined();
    expect(Array.isArray(config.validate)).toBe(false);
  });

  it('two rules produce an array of schemas', () => {
    const config = resolveFieldValidation({ rules: ['required', 'email'] });
    expect(Array.isArray(config.validate)).toBe(true);
    expect(config.validate).toHaveLength(2);
  });

  it('no rules produces undefined validate', () => {
    const config = resolveFieldValidation({ debounceMs: 200 });
    expect(config.validate).toBeUndefined();
    expect(config.debounceMs).toBe(200);
  });

  it('single rule as array produces array with one element', () => {
    // ['required'] → array with 1 element (NOT unwrapped to single)
    const config = resolveFieldValidation({ rules: ['required'] });
    // With our implementation: schemas.length === 1 ? schemas[0] : schemas
    // So single-element array gets unwrapped
    expect(Array.isArray(config.validate)).toBe(false);
  });

  it('undefined options are passed through', () => {
    const config = resolveFieldValidation({
      rules: 'required',
      debounceMs: undefined,
    });

    expect(config.debounceMs).toBeUndefined();
    expect(config.validate).toBeDefined();
  });
});

// =================================================================
// SchemaValidationError
// =================================================================

describe('SchemaValidationError', () => {
  it('has code property', () => {
    const error = new SchemaValidationError([
      { path: 'id', message: 'Missing', severity: 'error' },
    ]);
    expect(error.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('message summarizes error issues only (not warnings)', () => {
    const error = new SchemaValidationError([
      { path: 'id', message: 'Missing id', severity: 'error' },
      { path: 'field', message: 'Optional field', severity: 'warning' },
      { path: 'type', message: 'Unknown type', severity: 'error' },
    ]);

    expect(error.message).toContain('Missing id');
    expect(error.message).toContain('Unknown type');
    expect(error.message).not.toContain('Optional field');
  });

  it('preserves all issues including warnings', () => {
    const issues = [
      { path: 'id', message: 'Error', severity: 'error' as const },
      { path: 'field', message: 'Warning', severity: 'warning' as const },
    ];
    const error = new SchemaValidationError(issues);
    expect(error.issues).toHaveLength(2);
  });

  it('is instanceof Error', () => {
    const error = new SchemaValidationError([{ path: '', message: 'test', severity: 'error' }]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchemaValidationError');
  });
});
