// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateSchema } from '../../src/schema/from-schema';
import type { SchemaRegistry } from '../../src/schema/types';
import { SchemaValidationError } from '../../src/schema/types';

// =================================================================
// HELPERS
// =================================================================

function expectSchemaError(schema, config, registry?: SchemaRegistry) {
  try {
    validateSchema(schema, config, registry);
    throw new Error('Expected SchemaValidationError');
  } catch (e) {
    expect(e).toBeInstanceOf(SchemaValidationError);
    return e as SchemaValidationError;
  }
}

function validField(overrides = {}) {
  return { id: 'name', type: 'text', ...overrides };
}

function validSchema(overrides = {}) {
  return { id: 'test-form', fields: [validField()], ...overrides };
}

// =================================================================
// TESTS
// =================================================================

describe('validateSchema', () => {
  let rilConfig;

  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text',
        renderer: () => React.createElement('input'),
      })
      .addComponent('email', {
        name: 'Email',
        renderer: () => React.createElement('input'),
      })
      .addComponent('select', {
        name: 'Select',
        renderer: () => React.createElement('select'),
      });
  });

  // ---------------------------------------------------------------
  // TOP-LEVEL STRUCTURE
  // ---------------------------------------------------------------

  describe('top-level structure', () => {
    it('should pass with a valid schema using fields', () => {
      expect(() => validateSchema(validSchema(), rilConfig)).not.toThrow();
    });

    it('should pass with a valid schema using rows', () => {
      const schema = {
        id: 'test-form',
        rows: [{ kind: 'fields', fields: [validField()] }],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should reject a schema with missing id', () => {
      const err = expectSchemaError({ fields: [validField()] }, rilConfig);
      expect(err.issues.some((i) => i.path === 'id')).toBe(true);
    });

    it('should reject a schema with empty id', () => {
      const err = expectSchemaError({ id: '', fields: [validField()] }, rilConfig);
      expect(err.issues.some((i) => i.path === 'id')).toBe(true);
    });

    it('should reject a schema with invalid version', () => {
      const err = expectSchemaError(validSchema({ version: 2 }), rilConfig);
      expect(err.issues.some((i) => i.path === 'version')).toBe(true);
    });

    it('should reject a schema with neither fields nor rows', () => {
      const err = expectSchemaError({ id: 'test-form' }, rilConfig);
      expect(err.issues.some((i) => i.message.includes('fields'))).toBe(true);
    });

    it('should reject a schema with both fields and rows', () => {
      const schema = {
        id: 'test-form',
        fields: [validField()],
        rows: [{ kind: 'fields', fields: [validField()] }],
      };
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.message.includes('both'))).toBe(true);
    });

    it('should reject a schema with empty fields array', () => {
      const err = expectSchemaError(validSchema({ fields: [] }), rilConfig);
      expect(err.issues.some((i) => i.path === 'fields')).toBe(true);
    });

    it('should reject a schema with empty rows array', () => {
      const err = expectSchemaError({ id: 'test-form', rows: [] }, rilConfig);
      expect(err.issues.some((i) => i.path === 'rows')).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // FIELD VALIDATION
  // ---------------------------------------------------------------

  describe('field validation', () => {
    it('should reject a field without id', () => {
      const err = expectSchemaError(
        validSchema({ fields: [{ type: 'text' }] }),
        rilConfig,
      );
      expect(err.issues.some((i) => i.path === 'fields[0].id')).toBe(true);
    });

    it('should reject a field without id in rows layout', () => {
      const schema = {
        id: 'test-form',
        rows: [{ kind: 'fields', fields: [{ type: 'text' }] }],
      };
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path === 'rows[0].fields[0].id')).toBe(true);
    });

    it('should reject a field without type', () => {
      const err = expectSchemaError(
        validSchema({ fields: [{ id: 'name' }] }),
        rilConfig,
      );
      expect(err.issues.some((i) => i.path.endsWith('.type'))).toBe(true);
    });

    it('should reject a field with unknown component type', () => {
      const err = expectSchemaError(
        validSchema({ fields: [{ id: 'name', type: 'unknown-widget' }] }),
        rilConfig,
      );
      expect(err.issues.some((i) => i.message.includes('unknown-widget'))).toBe(true);
    });

    it('should pass a field with validation config', () => {
      const schema = validSchema({
        fields: [{ id: 'name', type: 'text', validation: { rules: 'required' } }],
      });
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should pass a field with conditions config', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            conditions: {
              visible: { field: 'toggle', operator: 'equals', value: true },
            },
          },
        ],
      });
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // VALIDATION DESCRIPTORS
  // ---------------------------------------------------------------

  describe('validation descriptors', () => {
    it('should pass with a valid string shortcut', () => {
      const schema = validSchema({
        fields: [{ id: 'email', type: 'email', validation: { rules: 'email' } }],
      });
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should reject an unknown string shortcut', () => {
      const schema = validSchema({
        fields: [{ id: 'name', type: 'text', validation: { rules: 'notAValidator' } }],
      });
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.message.includes('notAValidator'))).toBe(true);
    });

    it('should pass with a valid parameterized built-in', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: { type: 'minLength', params: { min: 3 } } },
          },
        ],
      });
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should reject a parameterized built-in with missing required param', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: { type: 'minLength', params: {} } },
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path.includes('params.min'))).toBe(true);
    });

    it('should reject an unknown validator type without registry', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: { type: 'customValidator' } },
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.message.includes('customValidator'))).toBe(true);
    });

    it('should pass with a custom validator type found in registry', () => {
      const registry: SchemaRegistry = {
        validators: {
          customValidator: () => ({ '~standard': { version: 1, vendor: 'test', validate: () => ({ value: '' }) } }),
        },
      };
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: { type: 'customValidator' } },
          },
        ],
      });
      expect(() => validateSchema(schema, rilConfig, registry)).not.toThrow();
    });

    it('should reject a custom validator type not found in registry', () => {
      const registry: SchemaRegistry = {
        validators: {
          otherValidator: () => ({ '~standard': { version: 1, vendor: 'test', validate: () => ({ value: '' }) } }),
        },
      };
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            validation: { rules: { type: 'missingValidator' } },
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig, registry);
      expect(err.issues.some((i) => i.message.includes('missingValidator'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // EFFECTS
  // ---------------------------------------------------------------

  describe('effects', () => {
    it('should pass with a valid effect and handler in registry', () => {
      const registry: SchemaRegistry = {
        effects: {
          onCountryChange: () => {},
        },
      };
      const schema = validSchema({
        fields: [
          {
            id: 'country',
            type: 'select',
            effects: [{ trigger: 'change', watch: 'country', handler: 'onCountryChange' }],
          },
        ],
      });
      expect(() => validateSchema(schema, rilConfig, registry)).not.toThrow();
    });

    it('should reject an effect without watch', () => {
      const registry: SchemaRegistry = {
        effects: { onCountryChange: () => {} },
      };
      const schema = validSchema({
        fields: [
          {
            id: 'country',
            type: 'select',
            effects: [{ trigger: 'change', watch: '', handler: 'onCountryChange' }],
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig, registry);
      expect(err.issues.some((i) => i.path.includes('watch'))).toBe(true);
    });

    it('should reject an effect without handler', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'country',
            type: 'select',
            effects: [{ trigger: 'change', watch: 'country', handler: '' }],
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path.includes('handler'))).toBe(true);
    });

    it('should reject an effect with handler not found in registry', () => {
      const registry: SchemaRegistry = {
        effects: { someOtherHandler: () => {} },
      };
      const schema = validSchema({
        fields: [
          {
            id: 'country',
            type: 'select',
            effects: [{ trigger: 'change', watch: 'country', handler: 'missingHandler' }],
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig, registry);
      expect(err.issues.some((i) => i.message.includes('missingHandler'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // REPEATABLES
  // ---------------------------------------------------------------

  describe('repeatables', () => {
    it('should pass with a valid repeatable', () => {
      const schema = {
        id: 'test-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [validField()] }],
              min: 1,
              max: 5,
            },
          },
        ],
      };
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should reject a repeatable without id', () => {
      const schema = {
        id: 'test-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: '',
              rows: [{ fields: [validField()] }],
            },
          },
        ],
      };
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path.includes('repeatable.id'))).toBe(true);
    });

    it('should reject a repeatable where min > max', () => {
      const schema = {
        id: 'test-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [{ fields: [validField()] }],
              min: 10,
              max: 3,
            },
          },
        ],
      };
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.message.includes('min') && i.message.includes('max'))).toBe(true);
    });

    it('should reject a repeatable with empty rows', () => {
      const schema = {
        id: 'test-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [],
            },
          },
        ],
      };
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path.includes('repeatable.rows'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // CONDITIONS
  // ---------------------------------------------------------------

  describe('conditions', () => {
    it('should pass with a valid condition', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            conditions: {
              visible: { field: 'toggle', operator: 'equals', value: true },
            },
          },
        ],
      });
      expect(() => validateSchema(schema, rilConfig)).not.toThrow();
    });

    it('should reject a condition with an invalid operator', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            conditions: {
              visible: { field: 'toggle', operator: 'invalidOp', value: true },
            },
          },
        ],
      });
      const err = expectSchemaError(schema, rilConfig);
      expect(err.issues.some((i) => i.path.includes('operator'))).toBe(true);
    });

    it('should emit a warning for a leaf condition with empty field', () => {
      const schema = validSchema({
        fields: [
          {
            id: 'name',
            type: 'text',
            conditions: {
              visible: { field: '', operator: 'equals', value: true },
            },
          },
        ],
      });
      // Warning-only issues should NOT throw (only errors throw)
      // But we need to verify the warning is generated.
      // validateSchema only throws when there are error-severity issues.
      // A warning with no errors means no throw, so we call directly.
      validateSchema(schema, rilConfig);
      // Since validateSchema does not return issues when there are no errors,
      // we verify by checking that it does NOT throw (warning only).
      // To verify the warning is actually generated, we construct a schema
      // that also has an error so we can inspect the issues array.
      const schemaWithError = {
        id: '',
        fields: [
          {
            id: 'name',
            type: 'text',
            conditions: {
              visible: { field: '', operator: 'equals', value: true },
            },
          },
        ],
      };
      const err = expectSchemaError(schemaWithError, rilConfig);
      const warning = err.issues.find(
        (i) => i.severity === 'warning' && i.path.includes('field'),
      );
      expect(warning).toBeDefined();
    });
  });
});
