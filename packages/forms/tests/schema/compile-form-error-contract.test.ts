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

    expectIssue(() => compileForm(schema, makeCatalog()), 'fields[1].id', 'Duplicate field ID "dup"');
  });
});
