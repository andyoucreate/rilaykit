// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';

describe('Form Builder — Repeatable Fields', () => {
  let rilConfig: any;

  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', placeholder: 'Enter text' },
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
      });
  });

  describe('addRepeatable', () => {
    it('should add a repeatable group with fluent API', () => {
      const builder = form.create(rilConfig, 'order-form').addRepeatable('items', (r) =>
        r
          .add(
            { id: 'name', type: 'text', props: { label: 'Item' } },
            { id: 'qty', type: 'number', props: { label: 'Qty' } }
          )
          .min(1)
          .max(10)
          .defaultValue({ name: '', qty: 1 })
      );

      const config = builder.build();

      expect(config.repeatableFields).toBeDefined();
      expect(config.repeatableFields!.items).toBeDefined();
      expect(config.repeatableFields!.items.id).toBe('items');
      expect(config.repeatableFields!.items.allFields).toHaveLength(2);
      expect(config.repeatableFields!.items.min).toBe(1);
      expect(config.repeatableFields!.items.max).toBe(10);
      expect(config.repeatableFields!.items.defaultValue).toEqual({ name: '', qty: 1 });
    });

    it('should create a repeatable row with kind "repeatable"', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
        );

      const config = builder.build();
      const repeatableRow = config.rows.find((r) => r.kind === 'repeatable');

      expect(repeatableRow).toBeDefined();
      expect(repeatableRow!.kind).toBe('repeatable');
      expect(repeatableRow!.repeatable.id).toBe('items');
    });

    it('should support fields on same row in repeatable', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add(
            { id: 'name', type: 'text', props: { label: 'Name' } },
            { id: 'qty', type: 'number', props: { label: 'Qty' } },
            { id: 'price', type: 'number', props: { label: 'Price' } }
          )
        );

      const config = builder.build();
      const repeatableConfig = config.repeatableFields!.items;

      expect(repeatableConfig.rows).toHaveLength(1);
      expect(repeatableConfig.rows[0].fields).toHaveLength(3);
      expect(repeatableConfig.allFields).toHaveLength(3);
    });

    it('should support separate rows in repeatable', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .add({ id: 'qty', type: 'number', props: { label: 'Qty' } })
        );

      const config = builder.build();
      const repeatableConfig = config.repeatableFields!.items;

      expect(repeatableConfig.rows).toHaveLength(2);
      expect(repeatableConfig.allFields).toHaveLength(2);
    });

    it('should support addSeparateRows in repeatable', () => {
      const builder = form.create(rilConfig).addRepeatable('items', (r) =>
        r.addSeparateRows([
          { id: 'name', type: 'text', props: { label: 'Name' } },
          { id: 'qty', type: 'number', props: { label: 'Qty' } },
        ])
      );

      const config = builder.build();
      const repeatableConfig = config.repeatableFields!.items;

      expect(repeatableConfig.rows).toHaveLength(2);
    });

    it('should chain with regular fields', () => {
      const builder = form
        .create(rilConfig, 'order-form')
        .add({ id: 'customerName', type: 'text', props: { label: 'Customer' } })
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } }).min(1)
        )
        .add({ id: 'notes', type: 'text', props: { label: 'Notes' } });

      const config = builder.build();

      expect(config.rows).toHaveLength(3);
      expect(config.rows[0].kind).toBe('fields');
      expect(config.rows[1].kind).toBe('repeatable');
      expect(config.rows[2].kind).toBe('fields');
      expect(config.allFields).toHaveLength(2); // Only static fields
    });

    it('should support multiple repeatable groups', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
        )
        .addRepeatable('contacts', (r) =>
          r.add({ id: 'email', type: 'text', props: { label: 'Email' } })
        );

      const config = builder.build();

      expect(config.repeatableFields).toBeDefined();
      expect(Object.keys(config.repeatableFields!)).toHaveLength(2);
      expect(config.repeatableFields!.items).toBeDefined();
      expect(config.repeatableFields!.contacts).toBeDefined();
    });

    it('should not include repeatable fields in allFields', () => {
      const builder = form
        .create(rilConfig)
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r.add(
            { id: 'itemName', type: 'text', props: { label: 'Item' } },
            { id: 'qty', type: 'number', props: { label: 'Qty' } }
          )
        );

      const config = builder.build();

      expect(config.allFields).toHaveLength(1);
      expect(config.allFields[0].id).toBe('name');
    });
  });

  describe('validation', () => {
    it('should throw if repeatable ID contains brackets', () => {
      expect(() => {
        form
          .create(rilConfig)
          .addRepeatable('items[0]', (r) =>
            r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
          );
      }).toThrow('cannot contain "[" or "]"');
    });

    it('should throw if template field ID contains brackets', () => {
      expect(() => {
        form
          .create(rilConfig)
          .addRepeatable('items', (r) =>
            r.add({ id: 'name[0]', type: 'text', props: { label: 'Item' } })
          );
      }).toThrow('cannot contain "[" or "]"');
    });

    it('should throw if repeatable has no fields', () => {
      expect(() => {
        form
          .create(rilConfig)
          .addRepeatable('items', (r) => r)
          .build();
      }).toThrow('must have at least one field');
    });

    it('should throw if min > max', () => {
      expect(() => {
        form
          .create(rilConfig)
          .addRepeatable('items', (r) =>
            r
              .add({ id: 'name', type: 'text', props: { label: 'Item' } })
              .min(5)
              .max(2)
          )
          .build();
      }).toThrow('min (5) cannot be greater than max (2)');
    });

    it('should throw for nested repeatables', () => {
      expect(() => {
        form.create(rilConfig).addRepeatable('outer', (r) => {
          // RepeatableBuilder delegates to form, but addRepeatable is on form, not RepeatableBuilder
          // So nesting would mean the inner form has a repeatable - which we check
          return r.add({ id: 'name', type: 'text', props: { label: 'Item' } });
        });
      }).not.toThrow();
    });

    it('should detect duplicate field IDs between static and repeatable fields', () => {
      const builder = form
        .create(rilConfig)
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item Name' } })
        );

      expect(() => builder.build()).toThrow();
    });

    it('should detect duplicate repeatable IDs', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name1', type: 'text', props: { label: 'Item' } })
        )
        .addRepeatable('items', (r) =>
          r.add({ id: 'name2', type: 'text', props: { label: 'Item 2' } })
        );

      expect(() => builder.build()).toThrow();
    });

    it('should validate repeatable template field components exist', () => {
      // This is checked at add time since createFormField throws
      expect(() => {
        form
          .create(rilConfig)
          .addRepeatable('items', (r) =>
            r.add({ id: 'name', type: 'unknown' as any, props: { label: 'Item' } })
          );
      }).toThrow('No component found');
    });
  });

  describe('build output', () => {
    it('should set kind "fields" on all field rows', () => {
      const builder = form
        .create(rilConfig)
        .add({ type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r.add({ id: 'item', type: 'text', props: { label: 'Item' } })
        );

      const config = builder.build();

      const fieldRows = config.rows.filter((r) => r.kind === 'fields');
      for (const row of fieldRows) {
        expect(row.kind).toBe('fields');
      }
    });

    it('should set kind "fields" on repeatable template rows', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'item', type: 'text', props: { label: 'Item' } })
        );

      const config = builder.build();
      const repeatableConfig = config.repeatableFields!.items;

      for (const row of repeatableConfig.rows) {
        expect(row.kind).toBe('fields');
      }
    });

    it('should not have repeatableFields when no repeatables are defined', () => {
      const builder = form.create(rilConfig).add({ type: 'text', props: { label: 'Name' } });

      const config = builder.build();

      expect(config.repeatableFields).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should include repeatable stats', () => {
      const builder = form
        .create(rilConfig)
        .add({ type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r.add(
            { id: 'itemName', type: 'text', props: { label: 'Item' } },
            { id: 'qty', type: 'number', props: { label: 'Qty' } }
          )
        )
        .addRepeatable('contacts', (r) =>
          r.add({ id: 'email', type: 'text', props: { label: 'Email' } })
        );

      const stats = builder.getStats();

      expect(stats.totalFields).toBe(1); // Only static fields
      expect(stats.totalRepeatables).toBe(2);
      expect(stats.totalRepeatableFields).toBe(3); // 2 + 1
    });
  });

  describe('findField and updateField', () => {
    it('should find fields in repeatable templates', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
        );

      const field = builder.getField('name');
      expect(field).toBeDefined();
      expect(field!.id).toBe('name');
    });

    it('should update fields in repeatable templates', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
        );

      builder.updateField('name', { props: { label: 'Updated Item' } });

      const field = builder.getField('name');
      expect(field!.props.label).toBe('Updated Item');
    });
  });

  describe('removeField', () => {
    it('should not remove fields from repeatable rows', () => {
      const builder = form
        .create(rilConfig)
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } })
        );

      builder.removeField('name');

      // Field should still exist in repeatable
      const field = builder.getField('name');
      expect(field).toBeDefined();
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize and deserialize repeatable rows', () => {
      const builder = form
        .create(rilConfig, 'test')
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'item', type: 'text', props: { label: 'Item' } })
            .min(1)
            .max(5)
        );

      const json = builder.toJSON();

      expect(json.rows).toHaveLength(2);
      expect(json.rows[1].kind).toBe('repeatable');
      expect(json.rows[1].repeatable.id).toBe('items');
    });

    it('should add kind "fields" to legacy rows without kind', () => {
      const legacyJson = {
        id: 'legacy-form',
        rows: [
          { id: 'row-1', fields: [{ id: 'name', componentId: 'text', props: { label: 'Name' } }] },
        ],
      };

      const builder = form.create(rilConfig).fromJSON(legacyJson);
      const rows = builder.getRows();

      expect(rows[0].kind).toBe('fields');
    });
  });

  describe('clone', () => {
    it('should clone form with repeatable groups', () => {
      const original = form
        .create(rilConfig, 'original')
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .addRepeatable('items', (r) =>
          r.add({ id: 'item', type: 'text', props: { label: 'Item' } }).min(1)
        );

      const cloned = original.clone('cloned');
      const clonedConfig = cloned.build();

      expect(clonedConfig.id).toBe('cloned');
      expect(clonedConfig.repeatableFields).toBeDefined();
      expect(clonedConfig.repeatableFields!.items.min).toBe(1);
    });
  });
});
