// @ts-nocheck - Disable TypeScript checking for test file: these schemas carry
// deliberately hostile untrusted input that the public types forbid.
import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  type Bindings,
  SchemaValidationError,
  compileForm,
  resolveValidationDescriptor,
} from '../../src/schema';

/**
 * Every key that resolves on `Object.prototype`. A plain-object lookup indexed
 * by untrusted schema input returns a truthy value for each of them, so each
 * must be proven inert on every schema-indexed table.
 */
const PROTOTYPE_KEYS = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'];

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
}

function makeValidatorSchema(type: string) {
  return {
    version: 1 as const,
    id: 'f',
    fields: [{ id: 'a', type: 'text', validation: { rules: [{ type }] } }],
  };
}

function makeEffectSchema(handler: string) {
  return {
    version: 1 as const,
    id: 'f',
    fields: [
      { id: 'a', type: 'text' },
      { id: 'b', type: 'text', effects: [{ trigger: 'change' as const, watch: 'a', handler }] },
    ],
  };
}

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('compileForm — prototype-key lookups', () => {
  describe('validator descriptor type', () => {
    for (const type of PROTOTYPE_KEYS) {
      it(`rejects "${type}" as an unknown validator type instead of resolving Object.prototype`, () => {
        const caught = catchError(() => compileForm(makeValidatorSchema(type), makeCatalog()));

        expect(caught).toBeInstanceOf(SchemaValidationError);
        expect((caught as SchemaValidationError).issues).toEqual([
          {
            path: 'fields[0].validation.rules[0]',
            message: `Unknown validator type "${type}". Not a built-in and not found in registry.`,
            severity: 'error',
          },
        ]);
      });

      it(`rejects "${type}" as an unknown validator type even with a bindings table present`, () => {
        const bindings: Bindings = { validators: {} };

        const caught = catchError(() =>
          compileForm(makeValidatorSchema(type), makeCatalog(), { bindings })
        );

        expect(caught).toBeInstanceOf(SchemaValidationError);
        expect((caught as SchemaValidationError).issues).toEqual([
          {
            path: 'fields[0].validation.rules[0]',
            message: `Unknown validator type "${type}". Not a built-in and not found in registry.`,
            severity: 'error',
          },
        ]);
      });
    }
  });

  describe('resolveValidationDescriptor', () => {
    for (const type of PROTOTYPE_KEYS) {
      it(`throws InvalidSchemaError for "${type}" rather than invoking an inherited method`, () => {
        const caught = catchError(() => resolveValidationDescriptor({ type }, { validators: {} }));

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe(`Unknown validator type: "${type}"`);
      });
    }
  });

  describe('effect handler', () => {
    for (const handler of PROTOTYPE_KEYS) {
      it(`rejects "${handler}" as an unresolved handler instead of compiling a no-op effect`, () => {
        const bindings: Bindings = { effects: {} };

        const caught = catchError(() =>
          compileForm(makeEffectSchema(handler), makeCatalog(), { bindings })
        );

        expect(caught).toBeInstanceOf(SchemaValidationError);
        expect((caught as SchemaValidationError).issues).toEqual([
          {
            path: 'fields[1].effects[0].handler',
            message: `Effect handler "${handler}" not found in registry`,
            severity: 'error',
          },
        ]);
      });
    }

    it('rejects a bound handler that exists but is not a function', () => {
      const bindings = { effects: { notAFn: 'nope' } } as unknown as Bindings;

      const caught = catchError(() =>
        compileForm(makeEffectSchema('notAFn'), makeCatalog(), { bindings })
      );

      expect(caught).toBeInstanceOf(SchemaValidationError);
      expect((caught as SchemaValidationError).issues).toEqual([
        {
          path: 'fields[1].effects[0].handler',
          message: 'Effect handler "notAFn" in bindings is not a function',
          severity: 'error',
        },
      ]);
    });
  });

  describe('inline default accumulation', () => {
    it('keeps a field id of "__proto__" as a real defaultValues key', () => {
      const schema = {
        version: 1 as const,
        id: 'f',
        fields: [{ id: '__proto__', type: 'text', default: 'kept' }],
      };

      const { defaultValues } = compileForm(schema, makeCatalog());

      expect(defaultValues).toBeDefined();
      expect(Object.keys(defaultValues as Record<string, unknown>)).toEqual(['__proto__']);
      expect(
        Object.getOwnPropertyDescriptor(defaultValues as Record<string, unknown>, '__proto__')?.value
      ).toBe('kept');
    });
  });

  describe('effectsMap accumulation', () => {
    it('indexes an effect watching a field named "toString" without corrupting the map', () => {
      const schema = {
        version: 1 as const,
        id: 'f',
        fields: [
          { id: 'toString', type: 'text' },
          {
            id: 'b',
            type: 'text',
            effects: [{ trigger: 'change' as const, watch: 'toString', handler: 'noop' }],
          },
        ],
      };
      const bindings: Bindings = { effects: { noop: () => {} } };

      const { formConfig } = compileForm(schema, makeCatalog(), { bindings });

      expect(formConfig.effectsMap.toString).toHaveLength(1);
      expect(formConfig.effectsMap.toString[0].watchFieldId).toBe('toString');
    });
  });
});
