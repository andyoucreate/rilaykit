// @ts-nocheck - Disable TypeScript checking for test file: these schemas carry
// deliberately hostile untrusted input that the public types forbid.
import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { SchemaValidationError, compileForm } from '../../src/schema';

/**
 * ONE error contract for every hostile-JSON path: a structural defect must
 * surface as a SchemaValidationError carrying usable `issues[]` (path + message
 * + severity), never as a raw TypeError and never as a silent drop. P3
 * self-correction reads these issues to repair its own emission.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });
}

function expectIssue(fn: () => unknown, path: string, message: string) {
  expect(fn).toThrow(SchemaValidationError);
  try {
    fn();
  } catch (error) {
    const issues = (error as SchemaValidationError).issues;
    expect(issues).toContainEqual({ path, message, severity: 'error' });
  }
}

describe('compileForm error contract', () => {
  it('reports a null effects entry as an issue instead of throwing a raw TypeError', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {}, effects: [null] }],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[0].effects[0]',
      'Effect entry must be an object'
    );
  });

  it('reports a null child in a composite condition tree instead of throwing a raw TypeError', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [
        {
          id: 'a',
          type: 'text',
          props: {},
          conditions: {
            visible: { operator: 'and', conditions: [null] },
          },
        },
      ],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[0].conditions.visible.conditions[0]',
      'Condition entry must be an object'
    );
  });

  it('reports a non-object "validation" instead of silently dropping it', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {}, validation: 'required' }],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[0].validation',
      'Field "validation" must be an object'
    );
  });

  it('reports a non-array "effects" instead of silently dropping it', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {}, effects: { trigger: 'change' } }],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[0].effects',
      'Field "effects" must be an array'
    );
  });

  it('reports a null schema root instead of throwing a raw TypeError', () => {
    expectIssue(() => compileForm(null, makeCatalog()), '', 'Form schema must be an object');
  });

  it('re-surfaces duplicate field ids as SchemaValidationError issues', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [
        { id: 'dup', type: 'text', props: {} },
        { id: 'dup', type: 'text', props: {} },
      ],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[1].id',
      'Duplicate field ID "dup"'
    );
  });

  it('reports a truthy NON-ARRAY "rows" instead of throwing a raw TypeError', () => {
    // `hasRows` is an Array.isArray check, so a non-array `rows` reads as absent
    // and the valid `fields` satisfies the one-of guard — then normalizeToRows
    // hands the non-array straight to a for..of and it explodes as a TypeError.
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {} }],
      rows: { kind: 'fields', fields: [] },
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'rows',
      'Form schema "rows" must be an array'
    );
  });

  it('reports a non-array "fields" instead of silently compiling an empty form', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: { id: 'a', type: 'text', props: {} },
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields',
      'Form schema "fields" must be an array'
    );
  });

  it('reports a NON-FUNCTION validator binding as an issue naming the binding', () => {
    // The effects side of this was fixed in r1; validators were missed. The
    // existence check is `!== undefined`, so a non-function binding passes
    // validation and then blows up as a raw TypeError when invoked as a factory.
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: {}, validation: { rules: [{ type: 'notAFn' }] } }],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog(), { bindings: { validators: { notAFn: 'nope' } } }),
      'fields[0].validation.rules[0]',
      'Validator "notAFn" in bindings is not a function'
    );
  });

  it('reports an invalid "logicalOperator" on a COMPOSITE condition node', () => {
    // The walker checks the operator whitelist on LEAF nodes only, and a
    // composite returns before it. A miscased "OR" therefore compiles, and the
    // evaluator (`logicalOperator === 'or'`) silently reads it as AND —
    // inverting the author's intent with no error anywhere.
    const schema = {
      version: 1,
      id: 'f',
      fields: [
        { id: 'a', type: 'text', props: {} },
        {
          id: 'b',
          type: 'text',
          props: {},
          conditions: {
            visible: {
              logicalOperator: 'OR',
              conditions: [
                { field: 'a', operator: 'equals', value: 'x' },
                { field: 'a', operator: 'equals', value: 'y' },
              ],
            },
          },
        },
      ],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'fields[1].conditions.visible.logicalOperator',
      'Invalid condition logicalOperator "OR"'
    );
  });

  it('re-surfaces a builder ConfigurationError as SchemaValidationError issues', () => {
    // A bracket in a repeatable id is rejected by the BUILDER, which throws its
    // own ConfigurationError from the assembly phase — outside the `build()`
    // try/catch that re-surfaces the builder's ValidationError. The schema path
    // must present ONE error contract, whichever error class the builder picks.
    const schema = {
      version: 1,
      id: 'f',
      rows: [
        {
          kind: 'repeatable',
          repeatable: {
            id: 'items[0]',
            rows: [{ kind: 'fields', fields: [{ id: 'name', type: 'text', props: {} }] }],
          },
        },
      ],
    };

    expectIssue(
      () => compileForm(schema, makeCatalog()),
      'rows[0].repeatable.id',
      'Repeatable ID "items[0]" cannot contain "[" or "]" (reserved for composite keys)'
    );
  });
});
