// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril, required, email, type FormConfiguration } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fromSchema, isFormSchema } from '../../src/schema/from-schema';
import { SchemaValidationError } from '../../src/schema/types';
import type { FormSchema, SchemaRegistry } from '../../src/schema/types';

// =================================================================
// SHARED SETUP
// =================================================================

let rilConfig;

beforeEach(() => {
  rilConfig = ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '', placeholder: 'Enter text' },
    })
    .addComponent('email', {
      name: 'Email Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '', required: false },
      validation: { validateOnChange: true },
    })
    .addComponent('select', {
      name: 'Select',
      renderer: () => React.createElement('select'),
      defaultProps: { label: '', options: [] },
    })
    .addComponent('number', {
      name: 'Number',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '', min: 0 },
    });
});

// =================================================================
// isFormSchema
// =================================================================

describe('isFormSchema', () => {
  it('returns true for a valid schema with fields', () => {
    const schema = {
      id: 'test-form',
      fields: [{ id: 'name', type: 'text' }],
    };

    expect(isFormSchema(schema)).toBe(true);
  });

  it('returns true for a valid schema with rows', () => {
    const schema = {
      id: 'test-form',
      rows: [{ fields: [{ id: 'name', type: 'text' }] }],
    };

    expect(isFormSchema(schema)).toBe(true);
  });

  it('returns false for null, undefined, and non-object values', () => {
    expect(isFormSchema(null)).toBe(false);
    expect(isFormSchema(undefined)).toBe(false);
    expect(isFormSchema(42)).toBe(false);
    expect(isFormSchema('string')).toBe(false);
  });

  it('returns false when id is missing', () => {
    const schema = {
      fields: [{ id: 'name', type: 'text' }],
    };

    expect(isFormSchema(schema)).toBe(false);
  });

  it('returns false when both fields and rows are missing', () => {
    const schema = { id: 'test-form' };

    expect(isFormSchema(schema)).toBe(false);
  });

  it('returns false when both fields and rows are present', () => {
    const schema = {
      id: 'test-form',
      fields: [{ id: 'name', type: 'text' }],
      rows: [{ fields: [{ id: 'name', type: 'text' }] }],
    };

    expect(isFormSchema(schema)).toBe(false);
  });

  it('returns false for an invalid version', () => {
    const schema = {
      id: 'test-form',
      version: 2,
      fields: [{ id: 'name', type: 'text' }],
    };

    expect(isFormSchema(schema)).toBe(false);
  });
});

// =================================================================
// fromSchema
// =================================================================

describe('fromSchema', () => {
  // ---------------------------------------------------------------
  // Flat fields format
  // ---------------------------------------------------------------

  describe('flat fields format', () => {
    it('converts a minimal schema with one field into a correct FormConfiguration', () => {
      const schema: FormSchema = {
        id: 'minimal-form',
        fields: [{ id: 'name', type: 'text' }],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.id).toBe('minimal-form');
      expect(result.formConfig.allFields).toHaveLength(1);
      expect(result.formConfig.allFields[0].id).toBe('name');
      expect(result.formConfig.allFields[0].componentId).toBe('text');
      expect(result.formConfig.rows).toHaveLength(1);
    });

    it('creates one row per field in flat mode', () => {
      const schema: FormSchema = {
        id: 'multi-field-form',
        fields: [
          { id: 'firstName', type: 'text' },
          { id: 'lastName', type: 'text' },
          { id: 'emailField', type: 'email' },
        ],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.rows).toHaveLength(3);
      expect(result.formConfig.allFields).toHaveLength(3);
    });

    it('merges schema props with component defaultProps', () => {
      const schema: FormSchema = {
        id: 'props-form',
        fields: [{ id: 'name', type: 'text', props: { label: 'Name' } }],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.props.label).toBe('Name');
      expect(field.props.placeholder).toBe('Enter text');
    });

    it('returns defaultValues separately from formConfig', () => {
      const schema: FormSchema = {
        id: 'defaults-form',
        fields: [{ id: 'name', type: 'text' }],
        defaultValues: { name: 'John' },
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.defaultValues).toEqual({ name: 'John' });
      expect(result.formConfig).not.toHaveProperty('defaultValues');
    });
  });

  // ---------------------------------------------------------------
  // Rows format
  // ---------------------------------------------------------------

  describe('rows format', () => {
    it('groups multiple fields in the same row', () => {
      const schema: FormSchema = {
        id: 'row-form',
        rows: [
          {
            kind: 'fields',
            fields: [
              { id: 'firstName', type: 'text' },
              { id: 'lastName', type: 'text' },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.rows).toHaveLength(1);
      expect(result.formConfig.rows[0].kind).toBe('fields');
      expect(result.formConfig.rows[0].fields).toHaveLength(2);
    });

    it('preserves multiple rows structure', () => {
      const schema: FormSchema = {
        id: 'multi-row-form',
        rows: [
          { kind: 'fields', fields: [{ id: 'name', type: 'text' }] },
          { kind: 'fields', fields: [{ id: 'emailField', type: 'email' }] },
        ],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.rows).toHaveLength(2);
      expect(result.formConfig.allFields).toHaveLength(2);
    });

    it('handles mixed rows with repeatables', () => {
      const schema: FormSchema = {
        id: 'mixed-form',
        rows: [
          { kind: 'fields', fields: [{ id: 'name', type: 'text' }] },
          {
            kind: 'repeatable',
            repeatable: {
              id: 'addresses',
              rows: [
                {
                  fields: [
                    { id: 'street', type: 'text' },
                    { id: 'city', type: 'text' },
                  ],
                },
              ],
              min: 1,
              max: 3,
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.repeatableFields).toBeDefined();
      expect(result.formConfig.repeatableFields['addresses']).toBeDefined();
      expect(result.formConfig.repeatableFields['addresses'].min).toBe(1);
      expect(result.formConfig.repeatableFields['addresses'].max).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // Validation resolution
  // ---------------------------------------------------------------

  describe('validation resolution', () => {
    it('resolves string shortcut "required" into a field with validation', () => {
      const schema: FormSchema = {
        id: 'validation-form',
        fields: [
          { id: 'name', type: 'text', validation: { rules: 'required' } },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      expect(field.validation.validate).toBeDefined();
    });

    it('resolves multiple rules into a validation array', () => {
      const schema: FormSchema = {
        id: 'multi-validation-form',
        fields: [
          { id: 'emailField', type: 'text', validation: { rules: ['required', 'email'] } },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      expect(Array.isArray(field.validation.validate)).toBe(true);
    });

    it('resolves parameterized validators with params', () => {
      const schema: FormSchema = {
        id: 'param-validation-form',
        fields: [
          {
            id: 'username',
            type: 'text',
            validation: {
              rules: { type: 'minLength', params: { min: 3 } },
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      expect(field.validation.validate).toBeDefined();

      // Verify the validator works
      const schema_ = field.validation.validate;
      const invalid = schema_['~standard'].validate('ab');
      expect(invalid).toHaveProperty('issues');

      const valid = schema_['~standard'].validate('abc');
      expect(valid).toHaveProperty('value');
    });

    it('combines component-level validation with field-level validation', () => {
      const schema: FormSchema = {
        id: 'combined-validation-form',
        fields: [
          {
            id: 'emailField',
            type: 'email',
            validation: { rules: 'required' },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.validation).toBeDefined();
      expect(field.validation.validateOnChange).toBe(true);
      expect(field.validation.validate).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // Conditions pass-through
  // ---------------------------------------------------------------

  describe('conditions pass-through', () => {
    it('passes conditions directly to FormFieldConfig', () => {
      const conditionConfig = {
        visible: {
          field: 'role',
          operator: 'equals' as const,
          value: 'admin',
        },
      };

      const schema: FormSchema = {
        id: 'conditions-form',
        fields: [
          {
            id: 'adminPanel',
            type: 'text',
            conditions: conditionConfig,
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const field = result.formConfig.allFields[0];

      expect(field.conditions).toBeDefined();
      expect(field.conditions.visible).toEqual(conditionConfig.visible);
    });
  });

  // ---------------------------------------------------------------
  // Effects resolution
  // ---------------------------------------------------------------

  describe('effects resolution', () => {
    it('resolves effects via registry into effectsMap', () => {
      const handler = vi.fn();

      const registry: SchemaRegistry = {
        effects: { loadCities: handler },
      };

      const schema: FormSchema = {
        id: 'effects-form',
        fields: [
          {
            id: 'city',
            type: 'text',
            effects: [
              { trigger: 'change', watch: 'country', handler: 'loadCities' },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig, registry);

      expect(result.formConfig.effectsMap).toBeDefined();
      expect(result.formConfig.effectsMap['country']).toBeDefined();
      expect(result.formConfig.effectsMap['country']).toHaveLength(1);
    });

    it('curries params into the effect handler', () => {
      const handler = vi.fn();

      const registry: SchemaRegistry = {
        effects: { loadCities: handler },
      };

      const schema: FormSchema = {
        id: 'effects-params-form',
        fields: [
          {
            id: 'city',
            type: 'text',
            effects: [
              {
                trigger: 'change',
                watch: 'country',
                handler: 'loadCities',
                params: { apiUrl: '/api/cities' },
              },
            ],
          },
        ],
      };

      const result = fromSchema(schema, rilConfig, registry);
      const effect = result.formConfig.effectsMap['country'][0];

      const mockContext = { setValue: vi.fn(), setProps: vi.fn() };
      effect.handler('France', mockContext);

      expect(handler).toHaveBeenCalledWith(
        'France',
        mockContext,
        { apiUrl: '/api/cities' },
      );
    });
  });

  // ---------------------------------------------------------------
  // Repeatables
  // ---------------------------------------------------------------

  describe('repeatables', () => {
    it('creates a RepeatableFieldConfig with correct min, max, and fields', () => {
      const schema: FormSchema = {
        id: 'repeatable-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [
                {
                  fields: [
                    { id: 'itemName', type: 'text' },
                    { id: 'itemQty', type: 'number' },
                  ],
                },
              ],
              min: 1,
              max: 5,
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const rep = result.formConfig.repeatableFields['items'];

      expect(rep.min).toBe(1);
      expect(rep.max).toBe(5);
      expect(rep.allFields).toHaveLength(2);
    });

    it('propagates repeatable defaultValue', () => {
      const schema: FormSchema = {
        id: 'repeatable-defaults-form',
        rows: [
          {
            kind: 'repeatable',
            repeatable: {
              id: 'items',
              rows: [
                { fields: [{ id: 'itemName', type: 'text' }] },
              ],
              defaultValue: { itemName: 'New item' },
            },
          },
        ],
      };

      const result = fromSchema(schema, rilConfig);
      const rep = result.formConfig.repeatableFields['items'];

      expect(rep.defaultValue).toEqual({ itemName: 'New item' });
    });
  });

  // ---------------------------------------------------------------
  // Form-level validation
  // ---------------------------------------------------------------

  describe('form-level validation', () => {
    it('resolves form validation descriptors via registry', () => {
      const crossFieldValidator = (_params, _message) => ({
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value) => ({ value }),
        },
      });

      const registry: SchemaRegistry = {
        validators: { crossField: crossFieldValidator },
      };

      const schema: FormSchema = {
        id: 'form-validation',
        fields: [{ id: 'name', type: 'text' }],
        validation: {
          rules: { type: 'crossField' },
          validateOnSubmit: true,
        },
      };

      const result = fromSchema(schema, rilConfig, registry);

      expect(result.formConfig.validation).toBeDefined();
      expect(result.formConfig.validation.validateOnSubmit).toBe(true);
      expect(result.formConfig.validation.validate).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // Submit options
  // ---------------------------------------------------------------

  describe('submitOptions', () => {
    it('passes submitOptions through to formConfig', () => {
      const schema: FormSchema = {
        id: 'submit-form',
        fields: [{ id: 'name', type: 'text' }],
        submitOptions: { force: true },
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.submitOptions).toBeDefined();
      expect(result.formConfig.submitOptions.force).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------

  describe('error handling', () => {
    it('throws SchemaValidationError for an invalid schema', () => {
      const schema = {
        id: '',
        fields: [],
      } as unknown as FormSchema;

      expect(() => fromSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('throws SchemaValidationError for an unknown component type', () => {
      const schema: FormSchema = {
        id: 'unknown-component-form',
        fields: [{ id: 'field1', type: 'unknown-widget' }],
      };

      expect(() => fromSchema(schema, rilConfig)).toThrow(SchemaValidationError);
    });

    it('sets formConfig.config to the ril instance passed in', () => {
      const schema: FormSchema = {
        id: 'config-ref-form',
        fields: [{ id: 'name', type: 'text' }],
      };

      const result = fromSchema(schema, rilConfig);

      expect(result.formConfig.config).toBe(rilConfig);
    });
  });
});
