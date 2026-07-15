// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type Bindings, SchemaValidationError, compileForm, fromSchema } from '../../src/schema';

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
}

function makeBindings(): Bindings {
  return {
    validators: {
      notFoo: (_params, message) => ({
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value) =>
            value === 'foo' ? { issues: [{ message: message ?? 'no foo' }] } : { value },
        },
      }),
    },
  };
}

function makeNotFooSchema() {
  return {
    version: 1 as const,
    id: 'f',
    fields: [{ id: 'name', type: 'text', validation: { rules: [{ type: 'notFoo' }] } }],
  };
}

describe('compileForm', () => {
  it('compiles a flat FormSchema through the builder and returns formConfig + defaultValues', () => {
    const schema = {
      version: 1 as const,
      id: 'login',
      fields: [{ id: 'email', type: 'text', props: { label: 'Email' } }],
      defaultValues: { email: 'a@b.c' },
    };

    const result = compileForm(schema, makeCatalog());

    expect(result.formConfig.id).toBe('login');
    expect(result.formConfig.allFields.map((f) => f.id)).toEqual(['email']);
    expect(result.formConfig.allFields[0].componentId).toBe('text');
    expect(result.defaultValues).toEqual({ email: 'a@b.c' });
  });

  it('resolves a registry validator through options.bindings', () => {
    const result = compileForm(makeNotFooSchema(), makeCatalog(), { bindings: makeBindings() });

    const validate = result.formConfig.allFields[0].validation.validate;
    expect(validate['~standard'].validate('foo')).toEqual({ issues: [{ message: 'no foo' }] });
    expect(validate['~standard'].validate('bar')).toEqual({ value: 'bar' });
  });

  it('keeps fromSchema working as a deprecated alias', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 'a', type: 'text' }] };

    const result = fromSchema(schema, makeCatalog());

    expect(result.formConfig.id).toBe('f');
    expect(result.formConfig.allFields.map((f) => f.id)).toEqual(['a']);
  });

  it('forwards bindings from the deprecated fromSchema registry argument', () => {
    const result = fromSchema(makeNotFooSchema(), makeCatalog(), makeBindings());

    const validate = result.formConfig.allFields[0].validation.validate;
    expect(validate['~standard'].validate('foo')).toEqual({ issues: [{ message: 'no foo' }] });
  });

  it('carries props, conditions and effects onto the resolved field config', () => {
    const conditions = { visible: { field: 'other', operator: 'equals', value: 'yes' } };
    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'other', type: 'text' },
        {
          id: 'name',
          type: 'text',
          props: { label: 'Name' },
          conditions,
          effects: [{ watch: 'other', handler: 'setName', params: { to: 'Ada' } }],
        },
      ],
    };
    const bindings: Bindings = {
      effects: { setName: (_value, context, params) => context.setValue('name', params.to) },
    };

    const field = compileForm(schema, makeCatalog(), { bindings }).formConfig.allFields[1];

    expect(field.props).toEqual({ label: 'Name' });
    expect(field.conditions).toEqual(conditions);
    expect(field.effects).toHaveLength(1);
    expect(field.effects[0].trigger).toBe('change');
    expect(field.effects[0].watchFieldId).toBe('other');

    // The bound handler is curried with its schema params — drive it to prove it.
    const setValue = vi.fn();
    field.effects[0].handler('trigger', { setValue });
    expect(setValue).toHaveBeenCalledWith('name', 'Ada');
  });

  it('leaves validation, conditions and effects unset when the schema field declares none', () => {
    const schema = { version: 1 as const, id: 'f', fields: [{ id: 'a', type: 'text' }] };

    const field = compileForm(schema, makeCatalog()).formConfig.allFields[0];

    expect(field.validation).toBeUndefined();
    expect(field.conditions).toBeUndefined();
    expect(field.effects).toBeUndefined();
  });

  // `operator: 'bogus'` is caught by validateSchema alone — the builder passes
  // conditions through untouched — so it isolates the structural pass.
  function makeBadOperatorSchema() {
    return {
      version: 1 as const,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', conditions: { visible: { field: 'b', operator: 'bogus' } } },
      ],
    };
  }

  it('throws SchemaValidationError for an invalid condition operator', () => {
    let caught: unknown;
    try {
      compileForm(makeBadOperatorSchema(), makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'fields[0].conditions.visible.operator',
        message: 'Invalid condition operator "bogus"',
        severity: 'error',
      },
    ]);
  });
});

describe('compileForm — malformed entries inside a repeatable', () => {
  // The same guard exists at validateRow and validateField: a null/non-object
  // entry must funnel into the typed SchemaValidationError, never a raw TypeError.
  function makeRepeatableSchema(rowEntry: unknown) {
    return {
      version: 1 as const,
      id: 'f',
      rows: [{ kind: 'repeatable' as const, repeatable: { id: 'r', rows: [rowEntry] } }],
    };
  }

  for (const [label, entry] of [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
  ] as const) {
    it(`throws SchemaValidationError when a repeatable row entry is ${label}`, () => {
      let caught: unknown;
      try {
        compileForm(makeRepeatableSchema(entry), makeCatalog());
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SchemaValidationError);
      expect((caught as SchemaValidationError).issues).toEqual([
        {
          path: 'rows[0].repeatable.rows[0]',
          message: 'Row entry must be an object',
          severity: 'error',
        },
      ]);
    });
  }
});
