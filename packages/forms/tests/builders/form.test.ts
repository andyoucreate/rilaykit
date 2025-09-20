// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { email, minLength, required, ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';

describe('Form Builder', () => {
  let rilConfig: any;

  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', placeholder: 'Enter text' },
        validation: {
          validateOnChange: true,
          validators: [],
        },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', required: false },
        validation: {
          validateOnChange: true,
          validators: [email()],
        },
      })
      .addComponent('password', {
        name: 'Password Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', minLength: 8 },
        validation: {
          validateOnBlur: true,
          validators: [required(), minLength(8)],
        },
      })
      .addComponent('number', {
        name: 'Number Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', min: 0 },
      })
      .addComponent('select', {
        name: 'Select',
        renderer: () => React.createElement('select'),
        defaultProps: { label: '', options: [] },
      })
      .addComponent('textarea', {
        name: 'Textarea',
        renderer: () => React.createElement('textarea'),
        defaultProps: { label: '', rows: 3 },
      })
      .addComponent('checkbox', {
        name: 'Checkbox',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', checked: false },
      });
  });

  describe('constructor and static factory', () => {
    it('should create form builder with constructor', () => {
      const builder = new form(rilConfig, 'test-form');
      expect(builder).toBeInstanceOf(form);
    });

    it('should create form builder with static create method', () => {
      const builder = form.create(rilConfig, 'test-form');
      expect(builder).toBeInstanceOf(form);
    });

    it('should generate random ID when not provided', () => {
      const builder1 = form.create(rilConfig);
      const builder2 = form.create(rilConfig);

      const config1 = builder1.build();
      const config2 = builder2.build();

      expect(config1.id).not.toBe(config2.id);
      expect(config1.id).toMatch(/^form-/);
      expect(config2.id).toMatch(/^form-/);
    });

    it('should use provided form ID', () => {
      const builder = form.create(rilConfig, 'custom-form-id');
      const config = builder.build();

      expect(config.id).toBe('custom-form-id');
    });
  });

  describe('field addition', () => {
    describe('add method - single field', () => {
      it('should add single field to its own row', () => {
        const builder = form.create(rilConfig).add({ type: 'text', props: { label: 'Name' } });

        const config = builder.build();

        expect(config.rows).toHaveLength(1);
        expect(config.rows[0].fields).toHaveLength(1);
        expect(config.rows[0].fields[0].componentId).toBe('text');
        expect(config.rows[0].fields[0].props).toEqual({
          label: 'Name',
          placeholder: 'Enter text', // From default props
        });
      });

      it('should generate unique field IDs when not provided', () => {
        const builder = form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 1' } })
          .add({ type: 'text', props: { label: 'Field 2' } });

        const config = builder.build();

        expect(config.allFields).toHaveLength(2);
        expect(config.allFields[0].id).toMatch(/^field-/);
        expect(config.allFields[1].id).toMatch(/^field-/);
        expect(config.allFields[0].id).not.toBe(config.allFields[1].id);
      });

      it('should use provided field ID', () => {
        const builder = form
          .create(rilConfig)
          .add({ id: 'custom-field', type: 'text', props: { label: 'Custom Field' } });

        const config = builder.build();

        expect(config.allFields[0].id).toBe('custom-field');
      });

      it('should merge default props with field props', () => {
        const builder = form.create(rilConfig).add({
          type: 'text',
          props: { label: 'Name', placeholder: 'Enter your name' },
        });

        const config = builder.build();

        expect(config.allFields[0].props).toEqual({
          label: 'Name',
          placeholder: 'Enter your name', // Overrides default
        });
      });

      it('should handle field validation configuration', () => {
        const customValidator = required('This field is required');

        const builder = form.create(rilConfig).add({
          type: 'text',
          props: { label: 'Required Field' },
          validation: {
            validateOnChange: false,
            validateOnBlur: true,
            debounceMs: 500,
            validate: customValidator, // New unified API!
          },
        });

        const config = builder.build();
        const field = config.allFields[0];

        expect(field.validation).toBeDefined();
        expect(field.validation?.validateOnChange).toBe(false);
        expect(field.validation?.validateOnBlur).toBe(true);
        expect(field.validation?.debounceMs).toBe(500);
        expect(field.validation?.validate).toBeDefined();
      });

      it('should combine component validation with field validation', () => {
        const fieldValidator = minLength(5);

        const builder = form.create(rilConfig).add({
          type: 'password', // Has built-in validators
          props: { label: 'Password' },
          validation: {
            validate: fieldValidator, // New unified API!
          },
        });

        const config = builder.build();
        const field = config.allFields[0];

        // Should have field validation (component validation is merged)
        expect(field.validation?.validate).toBeDefined();
      });

      it('should handle field conditional behavior', () => {
        const builder = form.create(rilConfig).add({
          type: 'text',
          props: { label: 'Conditional Field' },
          conditions: {
            visible: { type: 'equals', field: 'showField', value: true },
            disabled: { type: 'equals', field: 'disableField', value: true },
          },
        });

        const config = builder.build();
        const field = config.allFields[0];

        expect(field.conditions).toBeDefined();
        expect(field.conditions?.visible).toEqual({
          type: 'equals',
          field: 'showField',
          value: true,
        });
        expect(field.conditions?.disabled).toEqual({
          type: 'equals',
          field: 'disableField',
          value: true,
        });
      });

      it('should throw error for unknown component type', () => {
        const builder = form.create(rilConfig);

        expect(() => {
          builder.add({ type: 'unknown' as any, props: { label: 'Test' } });
        }).toThrow('No component found with type "unknown"');
      });
    });

    describe('add method - multiple fields in one row', () => {
      it('should add 2 fields to same row using variadic arguments', () => {
        const builder = form
          .create(rilConfig)
          .add(
            { type: 'text', props: { label: 'First Name' } },
            { type: 'text', props: { label: 'Last Name' } }
          );

        const config = builder.build();

        expect(config.rows).toHaveLength(1);
        expect(config.rows[0].fields).toHaveLength(2);
        expect(config.rows[0].fields[0].props.label).toBe('First Name');
        expect(config.rows[0].fields[1].props.label).toBe('Last Name');
      });

      it('should add 3 fields to same row using variadic arguments', () => {
        const builder = form
          .create(rilConfig)
          .add(
            { type: 'text', props: { label: 'First' } },
            { type: 'text', props: { label: 'Middle' } },
            { type: 'text', props: { label: 'Last' } }
          );

        const config = builder.build();

        expect(config.rows).toHaveLength(1);
        expect(config.rows[0].fields).toHaveLength(3);
      });

      it('should add 2 fields to same row using array syntax', () => {
        const builder = form.create(rilConfig).add([
          { type: 'text', props: { label: 'First Name' } },
          { type: 'text', props: { label: 'Last Name' } },
        ]);

        const config = builder.build();

        expect(config.rows).toHaveLength(1);
        expect(config.rows[0].fields).toHaveLength(2);
      });

      it('should add 3 fields to same row using array syntax', () => {
        const builder = form.create(rilConfig).add([
          { type: 'text', props: { label: 'First' } },
          { type: 'text', props: { label: 'Middle' } },
          { type: 'text', props: { label: 'Last' } },
        ]);

        const config = builder.build();

        expect(config.rows).toHaveLength(1);
        expect(config.rows[0].fields).toHaveLength(3);
      });

      it('should throw error when array syntax used with more than 3 fields', () => {
        const builder = form.create(rilConfig);

        expect(() => {
          builder.add([
            { type: 'text', props: { label: 'Field 1' } },
            { type: 'text', props: { label: 'Field 2' } },
            { type: 'text', props: { label: 'Field 3' } },
            { type: 'text', props: { label: 'Field 4' } },
          ]);
        }).toThrow('Maximum 3 fields per row');
      });

      it('should create separate rows when variadic arguments exceed 3 fields', () => {
        const builder = form
          .create(rilConfig)
          .add(
            { type: 'text', props: { label: 'Field 1' } },
            { type: 'text', props: { label: 'Field 2' } },
            { type: 'text', props: { label: 'Field 3' } },
            { type: 'text', props: { label: 'Field 4' } },
            { type: 'text', props: { label: 'Field 5' } }
          );

        const config = builder.build();

        // Should create 5 separate rows since > 3 fields
        expect(config.rows).toHaveLength(5);
        expect(config.rows[0].fields).toHaveLength(1);
        expect(config.rows[1].fields).toHaveLength(1);
        expect(config.rows[2].fields).toHaveLength(1);
        expect(config.rows[3].fields).toHaveLength(1);
        expect(config.rows[4].fields).toHaveLength(1);
      });

      it('should throw error when no fields provided', () => {
        const builder = form.create(rilConfig);

        expect(() => {
          builder.add([]);
        }).toThrow('At least one field is required');
      });

      it('should generate unique row IDs', () => {
        const builder = form
          .create(rilConfig)
          .add({ type: 'text', props: { label: 'Field 1' } })
          .add({ type: 'text', props: { label: 'Field 2' } });

        const config = builder.build();

        expect(config.rows).toHaveLength(2);
        expect(config.rows[0].id).toMatch(/^row-/);
        expect(config.rows[1].id).toMatch(/^row-/);
        expect(config.rows[0].id).not.toBe(config.rows[1].id);
      });
    });

    describe('addSeparateRows method', () => {
      it('should add multiple fields on separate rows', () => {
        const builder = form.create(rilConfig).addSeparateRows([
          { type: 'text', props: { label: 'Field 1' } },
          { type: 'text', props: { label: 'Field 2' } },
          { type: 'text', props: { label: 'Field 3' } },
        ]);

        const config = builder.build();

        expect(config.rows).toHaveLength(3);
        expect(config.rows[0].fields).toHaveLength(1);
        expect(config.rows[1].fields).toHaveLength(1);
        expect(config.rows[2].fields).toHaveLength(1);
      });

      it('should handle empty array', () => {
        const builder = form.create(rilConfig).addSeparateRows([]);
        const config = builder.build();

        expect(config.rows).toHaveLength(0);
      });

      it('should work with method chaining', () => {
        const builder = form
          .create(rilConfig)
          .addSeparateRows([
            { type: 'text', props: { label: 'Field 1' } },
            { type: 'text', props: { label: 'Field 2' } },
          ])
          .add({ type: 'text', props: { label: 'Field 3' } });

        const config = builder.build();

        expect(config.rows).toHaveLength(3);
      });
    });
  });

  describe('form configuration and validation', () => {
    it('should validate form configuration before building', () => {
      const builder = form.create(rilConfig);

      // Empty form should be valid
      expect(() => builder.build()).not.toThrow();
    });

    it('should include correct form configuration properties', () => {
      const builder = form
        .create(rilConfig, 'test-form')
        .add({ type: 'text', props: { label: 'Name' } })
        .add({ type: 'email', props: { label: 'Email' } });

      const config = builder.build();

      expect(config).toHaveProperty('id', 'test-form');
      expect(config).toHaveProperty('rows');
      expect(config).toHaveProperty('allFields');
      expect(config).toHaveProperty('config');
      expect(config).toHaveProperty('renderConfig');
      expect(config).toHaveProperty('validation');

      expect(config.allFields).toHaveLength(2);
      expect(config.rows).toHaveLength(2);
      expect(config.config).toBe(rilConfig);
    });

    it('should provide flattened allFields array', () => {
      const builder = form
        .create(rilConfig)
        .add(
          { type: 'text', props: { label: 'First' } },
          { type: 'text', props: { label: 'Last' } }
        )
        .add({ type: 'email', props: { label: 'Email' } });

      const config = builder.build();

      expect(config.allFields).toHaveLength(3);
      expect(config.allFields[0].props.label).toBe('First');
      expect(config.allFields[1].props.label).toBe('Last');
      expect(config.allFields[2].props.label).toBe('Email');
    });

    it('should clone rows to prevent external modification', () => {
      const builder = form.create(rilConfig).add({ type: 'text', props: { label: 'Test' } });

      const config = builder.build();
      const originalRowsCount = config.rows.length;

      // Attempt to modify the returned configuration
      config.rows.push({
        id: 'malicious-row',
        fields: [],
      });

      // Building again should not include the malicious row
      const config2 = builder.build();
      expect(config2.rows).toHaveLength(originalRowsCount);
    });
  });

  describe('complex form scenarios', () => {
    it('should handle mixed field types and layouts', () => {
      const builder = form
        .create(rilConfig, 'complex-form')
        .add({ type: 'text', props: { label: 'Full Name' } })
        .add(
          { type: 'text', props: { label: 'First Name' } },
          { type: 'text', props: { label: 'Last Name' } }
        )
        .add({ type: 'email', props: { label: 'Email Address' } })
        .add(
          { type: 'password', props: { label: 'Password' } },
          { type: 'password', props: { label: 'Confirm Password' } }
        )
        .add({ type: 'textarea', props: { label: 'Bio', rows: 5 } })
        .add([
          { type: 'select', props: { label: 'Country', options: [] } },
          { type: 'select', props: { label: 'State', options: [] } },
          { type: 'text', props: { label: 'City' } },
        ])
        .add({ type: 'checkbox', props: { label: 'I agree to terms' } });

      const config = builder.build();

      expect(config.rows).toHaveLength(7);
      expect(config.allFields).toHaveLength(11); // 1+2+1+2+1+3+1 = 11 fields total

      // Check row layouts
      expect(config.rows[0].fields).toHaveLength(1); // Full Name
      expect(config.rows[1].fields).toHaveLength(2); // First + Last Name
      expect(config.rows[2].fields).toHaveLength(1); // Email
      expect(config.rows[3].fields).toHaveLength(2); // Password + Confirm
      expect(config.rows[4].fields).toHaveLength(1); // Bio
      expect(config.rows[5].fields).toHaveLength(3); // Country + State + City
      expect(config.rows[6].fields).toHaveLength(1); // Checkbox
    });

    it('should handle form with validation and conditions', () => {
      const builder = form
        .create(rilConfig)
        .add({
          id: 'userType',
          type: 'select',
          props: {
            label: 'User Type',
            options: [
              { value: 'individual', label: 'Individual' },
              { value: 'business', label: 'Business' },
            ],
          },
        })
        .add({
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name' },
          validation: {
            validators: [required('First name is required')],
          },
        })
        .add({
          id: 'companyName',
          type: 'text',
          props: { label: 'Company Name' },
          conditions: {
            visible: { type: 'equals', field: 'userType', value: 'business' },
          },
          validation: {
            validate: required('Company name is required'), // New unified API!
          },
        });

      const config = builder.build();

      expect(config.allFields).toHaveLength(3);

      const companyField = config.allFields.find((f) => f.id === 'companyName');
      expect(companyField?.conditions?.visible).toEqual({
        type: 'equals',
        field: 'userType',
        value: 'business',
      });
      expect(companyField?.validation?.validate).toBeDefined();
    });

    it('should maintain builder state across multiple operations', () => {
      const builder = form.create(rilConfig, 'stateful-form');

      // Add fields in multiple steps
      builder.add({ type: 'text', props: { label: 'Step 1' } });

      let config = builder.build();
      expect(config.allFields).toHaveLength(1);

      // Add more fields
      builder.add(
        { type: 'text', props: { label: 'Step 2A' } },
        { type: 'text', props: { label: 'Step 2B' } }
      );

      config = builder.build();
      expect(config.allFields).toHaveLength(3);
      expect(config.rows).toHaveLength(2);

      // Add final field
      builder.addSeparateRows([{ type: 'email', props: { label: 'Step 3' } }]);

      config = builder.build();
      expect(config.allFields).toHaveLength(4);
      expect(config.rows).toHaveLength(3);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle building empty form', () => {
      const builder = form.create(rilConfig, 'empty-form');
      const config = builder.build();

      expect(config.id).toBe('empty-form');
      expect(config.rows).toHaveLength(0);
      expect(config.allFields).toHaveLength(0);
    });

    it('should handle field with no props', () => {
      const builder = form.create(rilConfig).add({ type: 'text' });

      const config = builder.build();

      expect(config.allFields[0].props).toEqual({
        label: '', // From default props
        placeholder: 'Enter text', // From default props
      });
    });

    it('should handle field with null/undefined validation', () => {
      const builder = form.create(rilConfig).add({
        type: 'text',
        props: { label: 'Test' },
        validation: undefined,
      });

      const config = builder.build();

      // Should still have component validation
      expect(config.allFields[0].validation).toBeDefined();
      expect(config.allFields[0].validation?.validateOnChange).toBe(true);
    });

    it('should handle field with empty validation object', () => {
      const builder = form.create(rilConfig).add({
        type: 'text',
        props: { label: 'Test' },
        validation: {},
      });

      const config = builder.build();

      expect(config.allFields[0].validation).toBeDefined();
      expect(config.allFields[0].validation?.validate).toBeUndefined();
    });

    it('should handle multiple builds from same builder instance', () => {
      const builder = form.create(rilConfig).add({ type: 'text', props: { label: 'Test' } });

      const config1 = builder.build();
      const config2 = builder.build();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });

  describe('type safety', () => {
    it('should enforce component type constraints', () => {
      const builder = form.create(rilConfig);

      // This should work (valid component type)
      expect(() => {
        builder.add({ type: 'text', props: { label: 'Valid' } });
      }).not.toThrow();

      // TypeScript should catch this at compile time, but we test runtime behavior
      expect(() => {
        builder.add({ type: 'invalid-type' as any, props: { label: 'Invalid' } });
      }).toThrow();
    });

    it('should provide correct prop types for components', () => {
      const builder = form.create(rilConfig).add({
        type: 'select',
        props: {
          label: 'Test Select',
          options: [
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' },
          ],
        },
      });

      const config = builder.build();
      const selectField = config.allFields[0];

      expect(selectField.props).toHaveProperty('options');
      expect(Array.isArray(selectField.props.options)).toBe(true);
      expect(selectField.props.options).toHaveLength(2);
    });
  });

  describe('integration with ril configuration', () => {
    it('should use ril form render configuration', () => {
      // Set up a render config on ril
      const configuredRil = rilConfig.configure({
        bodyRenderer: vi.fn(),
        rowRenderer: vi.fn(),
        fieldRenderer: vi.fn(),
      });

      const builder = form.create(configuredRil).add({ type: 'text', props: { label: 'Test' } });

      const config = builder.build();

      expect(config.renderConfig).toBeDefined();
      expect(config.renderConfig?.bodyRenderer).toBeDefined();
      expect(config.renderConfig?.rowRenderer).toBeDefined();
      expect(config.renderConfig?.fieldRenderer).toBeDefined();
    });

    it('should reference the same ril config instance', () => {
      const builder = form.create(rilConfig).add({ type: 'text', props: { label: 'Test' } });

      const config = builder.build();

      expect(config.config).toBe(rilConfig);
    });
  });
});
