// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { type Bindings, compileForm, fromSchema } from '../../src/schema';

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
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
    const bindings: Bindings = {
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

    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'name', type: 'text', validation: { rules: [{ type: 'notFoo' }] } }],
    };

    const result = compileForm(schema, makeCatalog(), { bindings });

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
    const bindings: Bindings = {
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

    const schema = {
      version: 1 as const,
      id: 'f',
      fields: [{ id: 'name', type: 'text', validation: { rules: [{ type: 'notFoo' }] } }],
    };

    const result = fromSchema(schema, makeCatalog(), bindings);

    const validate = result.formConfig.allFields[0].validation.validate;
    expect(validate['~standard'].validate('foo')).toEqual({ issues: [{ message: 'no foo' }] });
  });
});
