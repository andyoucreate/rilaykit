import { ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';

const TestComponent = () => React.createElement('div', null, 'test');
const TestEmailComponent = () => React.createElement('input', { type: 'email' });
const TestNumberComponent = () => React.createElement('input', { type: 'number' });

describe('Form Builder', () => {
  let config: ril<Record<string, any>>;

  beforeEach(() => {
    config = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps: { placeholder: 'Enter text...' },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: TestEmailComponent,
        defaultProps: { placeholder: 'Enter email...' },
      })
      .addComponent('number', {
        name: 'Number Input',
        renderer: TestNumberComponent,
        defaultProps: { placeholder: 'Enter number...' },
      });
  });

  describe('Basic Form Creation', () => {
    it('should create a form with default ID', () => {
      const formBuilder = form.create(config);
      const formConfig = formBuilder.build();

      expect(formConfig.id).toMatch(/^form-\d+$/);
      expect(formConfig.rows).toEqual([]);
      expect(formConfig.allFields).toEqual([]);
    });

    it('should create a form with custom ID', () => {
      const formBuilder = form.create(config, 'custom-form');
      const formConfig = formBuilder.build();

      expect(formConfig.id).toBe('custom-form');
    });

    it('should allow setting custom ID after creation', () => {
      const formBuilder = form.create(config);
      formBuilder.setId('updated-form');

      const formConfig = formBuilder.build();
      expect(formConfig.id).toBe('updated-form');
    });

    it('should throw error for non-existent component type', () => {
      const formBuilder = form.create(config);

      expect(() => {
        formBuilder.add({ id: 'test', type: 'non-existent' as any });
      }).toThrow('No component found with type "non-existent"');
    });
  });

  describe('Single Field Operations', () => {
    it('should add a single field', () => {
      const formBuilder = form.create(config);
      formBuilder.add({
        id: 'username',
        type: 'text',
        props: { label: 'Username', required: true },
      });

      const formConfig = formBuilder.build();

      expect(formConfig.rows).toHaveLength(1);
      expect(formConfig.rows[0].fields).toHaveLength(1);
      expect(formConfig.rows[0].fields[0].id).toBe('username');
      expect(formConfig.rows[0].fields[0].props.label).toBe('Username');
      expect(formConfig.rows[0].fields[0].props.required).toBe(true);
      expect(formConfig.allFields).toHaveLength(1);
    });

    it('should add field with validation', () => {
      const mockValidator = () => ({ isValid: true, errors: [] });

      const formBuilder = form.create(config);
      formBuilder.add({
        id: 'email',
        type: 'email',
        props: { label: 'Email' },
        validation: { validators: [mockValidator] },
      });

      const formConfig = formBuilder.build();
      const field = formConfig.rows[0].fields[0];

      expect(field.validation?.validators).toContain(mockValidator);
    });

    it('should merge default props with custom props', () => {
      const formBuilder = form.create(config);
      formBuilder.add({
        id: 'username',
        type: 'text',
        props: {
          label: 'Username',
          placeholder: 'Custom placeholder',
        },
      });

      const formConfig = formBuilder.build();
      const field = formConfig.rows[0].fields[0];

      // Should merge default props with custom props
      expect(field.props.placeholder).toBe('Custom placeholder'); // Custom overrides default
      expect(field.props.label).toBe('Username');
    });
  });

  describe('Row Field Operations', () => {
    it('should add multiple fields on same row', () => {
      const formBuilder = form.create(config);
      formBuilder.add([
        { id: 'firstName', type: 'text', props: { label: 'First Name' } },
        { id: 'lastName', type: 'text', props: { label: 'Last Name' } },
      ]);

      const formConfig = formBuilder.build();

      expect(formConfig.rows).toHaveLength(1);
      expect(formConfig.rows[0].fields).toHaveLength(2);
      expect(formConfig.rows[0].maxColumns).toBe(2);
      expect(formConfig.allFields).toHaveLength(2);
    });

    it('should throw error for empty field array', () => {
      const formBuilder = form.create(config);

      expect(() => {
        formBuilder.add([]);
      }).toThrow('At least one field is required');
    });

    it('should throw error for more than 3 fields per row', () => {
      const formBuilder = form.create(config);

      expect(() => {
        formBuilder.add([
          { id: 'field1', type: 'text' },
          { id: 'field2', type: 'text' },
          { id: 'field3', type: 'text' },
          { id: 'field4', type: 'text' },
        ]);
      }).toThrow('Maximum 3 fields per row');
    });
  });

  describe('Multiple Fields Operations', () => {
    it('should add multiple fields each on separate rows', () => {
      const formBuilder = form.create(config);
      formBuilder.addSeparateRows([
        { id: 'username', type: 'text', props: { label: 'Username' } },
        { id: 'email', type: 'email', props: { label: 'Email' } },
        { id: 'age', type: 'number', props: { label: 'Age' } },
      ]);

      const formConfig = formBuilder.build();

      expect(formConfig.rows).toHaveLength(3);
      expect(formConfig.allFields).toHaveLength(3);

      // Each row should have one field
      for (const row of formConfig.rows) {
        expect(row.fields).toHaveLength(1);
      }
    });
  });

  describe('Field Management', () => {
    it('should update existing field', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .updateField('username', {
          props: { label: 'Updated Username', required: true },
        });

      const formConfig = formBuilder.build();
      const field = formConfig.rows[0].fields[0];

      expect(field.props.label).toBe('Updated Username');
      expect(field.props.required).toBe(true);
    });

    it('should merge props when updating field', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add({
          id: 'username',
          type: 'text',
          props: { label: 'Username', placeholder: 'Enter username' },
        })
        .updateField('username', {
          props: { label: 'Updated Username' },
        });

      const formConfig = formBuilder.build();
      const field = formConfig.rows[0].fields[0];

      expect(field.props.label).toBe('Updated Username');
      expect(field.props.placeholder).toBe('Enter username'); // Should preserve existing props
    });

    it('should throw error when updating non-existent field', () => {
      const formBuilder = form.create(config);

      expect(() => {
        formBuilder.updateField('non-existent', { props: { label: 'Test' } });
      }).toThrow('Field with ID "non-existent" not found');
    });

    it('should remove field correctly', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .add({ id: 'email', type: 'email', props: { label: 'Email' } })
        .removeField('username');

      const formConfig = formBuilder.build();

      expect(formConfig.allFields).toHaveLength(1);
      expect(formConfig.allFields[0].id).toBe('email');
    });

    it('should remove empty rows after field removal', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .removeField('username');

      const formConfig = formBuilder.build();

      expect(formConfig.rows).toHaveLength(0);
      expect(formConfig.allFields).toHaveLength(0);
    });

    it('should get field by ID', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text', props: { label: 'Username' } });

      const field = formBuilder.getField('username');

      expect(field).toBeDefined();
      expect(field?.id).toBe('username');
      expect(field?.props.label).toBe('Username');
    });

    it('should return undefined for non-existent field', () => {
      const formBuilder = form.create(config);

      const field = formBuilder.getField('non-existent');

      expect(field).toBeUndefined();
    });

    it('should get all fields as flat array', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add([
          { id: 'firstName', type: 'text' },
          { id: 'lastName', type: 'text' },
        ])
        .add({ id: 'email', type: 'email' });

      const fields = formBuilder.getFields();

      expect(fields).toHaveLength(3);
      expect(fields.map((f) => f.id)).toEqual(['firstName', 'lastName', 'email']);
    });

    it('should get all rows', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'field1', type: 'text' }).add({ id: 'field2', type: 'text' });

      const rows = formBuilder.getRows();

      expect(rows).toHaveLength(2);
      expect(rows[0].fields[0].id).toBe('field1');
      expect(rows[1].fields[0].id).toBe('field2');
    });
  });

  describe('Form Operations', () => {
    it('should clear all fields and rows', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'field1', type: 'text' }).add({ id: 'field2', type: 'text' }).clear();

      const formConfig = formBuilder.build();

      expect(formConfig.rows).toHaveLength(0);
      expect(formConfig.allFields).toHaveLength(0);
    });

    it('should reset row counter after clear', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'field1', type: 'text' }).clear().add({ id: 'field2', type: 'text' });

      const formConfig = formBuilder.build();

      expect(formConfig.rows[0].id).toBe('row-1'); // Counter should reset
    });
  });

  describe('Form Cloning', () => {
    it('should clone form with new ID', () => {
      const originalBuilder = form.create(config, 'original-form');
      originalBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .add({ id: 'email', type: 'email', props: { label: 'Email' } });

      const clonedBuilder = originalBuilder.clone('cloned-form');
      const clonedConfig = clonedBuilder.build();

      expect(clonedConfig.id).toBe('cloned-form');
      expect(clonedConfig.rows).toHaveLength(2);
      expect(clonedConfig.allFields).toHaveLength(2);
    });

    it('should clone form with auto-generated ID', () => {
      const originalBuilder = form.create(config, 'original-form');
      originalBuilder.add({ id: 'username', type: 'text' });

      const clonedBuilder = originalBuilder.clone();
      const clonedConfig = clonedBuilder.build();

      expect(clonedConfig.id).not.toBe('original-form');
      expect(clonedConfig.id).toBe('original-form-clone');
    });

    it('should create independent clone', () => {
      const originalBuilder = form.create(config);
      originalBuilder.add({ id: 'username', type: 'text' });

      const clonedBuilder = originalBuilder.clone();
      clonedBuilder.add({ id: 'email', type: 'email' });

      const originalConfig = originalBuilder.build();
      const clonedConfig = clonedBuilder.build();

      expect(originalConfig.allFields).toHaveLength(1);
      expect(clonedConfig.allFields).toHaveLength(2);
    });
  });

  describe('Validation', () => {
    it('should validate form without errors', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text' });

      const errors = formBuilder.validate();

      expect(errors).toHaveLength(0);
    });

    it('should detect duplicate field IDs', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text' });

      // Manually add a duplicate field to the internal rows
      const rows = formBuilder.getRows();
      const duplicateField = {
        id: 'username', // Duplicate ID
        componentId: rows[0].fields[0].componentId,
        props: {},
      };

      // Add duplicate field to existing row
      (rows[0] as any).fields.push(duplicateField);

      const errors = formBuilder.validate();
      expect(errors).toContain('Duplicate field IDs: username');
    });

    it('should detect missing components', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text' });

      // Manually corrupt the component reference
      const field = formBuilder.getField('username');
      if (field) {
        (field as any).componentId = 'non-existent-component';
      }

      const errors = formBuilder.validate();
      expect(errors).toContain('Component "non-existent-component" not found for field "username"');
    });

    it('should detect invalid row constraints', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text' });

      // Manually create invalid row by emptying the fields array
      const rows = formBuilder.getRows();
      (rows[0] as any).fields = []; // Empty the row

      const errors = formBuilder.validate();
      expect(errors).toContain('Row "row-1" is empty');
    });

    it('should throw error when building invalid form', () => {
      const formBuilder = form.create(config);
      formBuilder.add({ id: 'username', type: 'text' });

      // Corrupt the form
      const field = formBuilder.getField('username');
      if (field) {
        (field as any).componentId = 'non-existent';
      }

      expect(() => {
        formBuilder.build();
      }).toThrow(/Form validation failed/);
    });
  });

  describe('JSON Import/Export', () => {
    it('should export form to JSON', () => {
      const formBuilder = form.create(config, 'test-form');
      formBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .add({ id: 'email', type: 'email', props: { label: 'Email' } });

      const json = formBuilder.toJSON();

      expect(json.id).toBe('test-form');
      expect(json.rows).toHaveLength(2);
    });

    it('should import form from JSON', () => {
      const json = {
        id: 'imported-form',
        rows: [
          {
            id: 'row-1',
            fields: [
              {
                id: 'username',
                componentId: 'test-component',
                props: { label: 'Username' },
              },
            ],
            maxColumns: 1,
            spacing: 'normal',
            alignment: 'stretch',
          },
        ],
      };

      const formBuilder = form.create(config);
      formBuilder.fromJSON(json);

      expect(formBuilder.getField('username')).toBeDefined();
    });

    it('should handle partial JSON import', () => {
      const formBuilder = form.create(config, 'original-id');

      // Get a valid component ID from the config
      const textComponent = config.getComponent('text');
      const validComponentId = textComponent!.id;

      const json = {
        rows: [
          {
            id: 'row-1',
            fields: [
              {
                id: 'imported-field',
                componentId: validComponentId, // Use valid component ID
                props: {},
              },
            ],
            maxColumns: 1,
            spacing: 'normal',
            alignment: 'stretch',
          },
        ],
      };

      formBuilder.fromJSON(json);

      // Should keep original ID when not provided in JSON
      const formConfig = formBuilder.build();
      expect(formConfig.id).toBe('original-id');
      expect(formBuilder.getField('imported-field')).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should calculate form statistics correctly', () => {
      const formBuilder = form.create(config);
      formBuilder
        .add([
          { id: 'firstName', type: 'text' },
          { id: 'lastName', type: 'text' },
          { id: 'age', type: 'number' },
        ])
        .add({ id: 'email', type: 'email' })
        .add({ id: 'bio', type: 'text' });

      const stats = formBuilder.getStats();

      expect(stats.totalFields).toBe(5);
      expect(stats.totalRows).toBe(3); // 1 row with 3 fields + 1 row with email + 1 row with bio
      expect(stats.averageFieldsPerRow).toBeCloseTo(5 / 3, 1); // 5 fields / 3 rows
      expect(stats.maxFieldsInRow).toBe(3);
      expect(stats.minFieldsInRow).toBe(1);
    });

    it('should handle empty form statistics', () => {
      const formBuilder = form.create(config);

      const stats = formBuilder.getStats();

      expect(stats.totalFields).toBe(0);
      expect(stats.totalRows).toBe(0);
      expect(stats.averageFieldsPerRow).toBe(0);
      expect(stats.maxFieldsInRow).toBe(0);
      expect(stats.minFieldsInRow).toBe(0);
    });
  });

  describe('Method Chaining', () => {
    it('should support fluent API chaining', () => {
      const formBuilder = form.create(config);

      const result = formBuilder
        .add({ id: 'username', type: 'text', props: { label: 'Username' } })
        .add({ id: 'email', type: 'email', props: { label: 'Email' } })
        .setId('chained-form')
        .updateField('username', { props: { required: true } })
        .build();

      expect(result.id).toBe('chained-form');
      expect(result.allFields).toHaveLength(2);
      expect(result.allFields[0].props.required).toBe(true);
    });
  });
});

describe('Module Augmentation API', () => {
  it('should create form using config.form()', () => {
    const config = ril.create().addComponent('text', {
      name: 'Text Input',
      renderer: vi.fn(),
    });

    const formInstance = config.form('test-form');
    expect(formInstance).toBeInstanceOf(form);
    expect(formInstance.build().id).toBe('test-form');
  });

  it('should create form with default ID using config.form()', () => {
    const config = ril.create().addComponent('text', {
      name: 'Text Input',
      renderer: vi.fn(),
    });

    const formInstance = config.form();
    expect(formInstance).toBeInstanceOf(form);
    expect(formInstance.build().id).toMatch(/^form-\d+$/);
  });
});
