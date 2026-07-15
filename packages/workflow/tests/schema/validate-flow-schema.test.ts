import { ril } from '@rilaykit/core';
import { SchemaValidationError } from '@rilaykit/forms';
import { isFlowSchema, validateFlowSchema } from '@rilaykit/workflow';
import React from 'react';
import { describe, expect, it } from 'vitest';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

function issuesOf(fn: () => void): { path: string; message: string; severity: string }[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return error.issues.map((i) => ({ path: i.path, message: i.message, severity: i.severity }));
    }
    throw error;
  }
  throw new Error('expected validateFlowSchema to throw');
}

describe('validateFlowSchema', () => {
  it('accepts a valid flow schema and returns void', () => {
    const result = validateFlowSchema(
      {
        version: 1,
        id: 'wf',
        name: 'W',
        steps: [
          {
            id: 'a',
            title: 'A',
            form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          },
        ],
      },
      makeCatalog()
    );
    expect(result).toBeUndefined();
  });

  it('throws SchemaValidationError on duplicate step ids', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        {
          version: 1,
          id: 'wf',
          name: 'W',
          steps: [
            {
              id: 'a',
              title: 'A',
              form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
            },
            {
              id: 'a',
              title: 'A2',
              form: { version: 1, id: 'a2', fields: [{ id: 'y', type: 'text' }] },
            },
          ],
        },
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      { path: 'steps[1].id', message: 'Duplicate step id "a"', severity: 'error' },
    ]);
  });

  it('throws SchemaValidationError when a step form references an unknown component', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        {
          version: 1,
          id: 'wf',
          name: 'W',
          steps: [
            {
              id: 'a',
              title: 'A',
              form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'ghost' }] },
            },
          ],
        },
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].form.fields[0].type',
        message: 'Unknown component type "ghost". Must be registered in ril config.',
        severity: 'error',
      },
    ]);
  });

  it('reports missing id and name', () => {
    const issues = issuesOf(() =>
      validateFlowSchema({ version: 1, id: '', name: '', steps: [] } as never, makeCatalog())
    );
    expect(issues).toEqual([
      { path: 'id', message: 'Flow schema must have a non-empty "id"', severity: 'error' },
      { path: 'name', message: 'Flow schema must have a non-empty "name"', severity: 'error' },
      { path: 'steps', message: 'Steps array must not be empty', severity: 'error' },
    ]);
  });

  it('reports an unsupported version', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        {
          version: 2,
          id: 'wf',
          name: 'W',
          steps: [
            {
              id: 'a',
              title: 'A',
              form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
            },
          ],
        } as never,
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'version',
        message: 'Unsupported flow schema version "2". Only version 1 is supported.',
        severity: 'error',
      },
    ]);
  });

  it('reports a null step entry without throwing a raw TypeError', () => {
    const issues = issuesOf(() =>
      validateFlowSchema({ version: 1, id: 'wf', name: 'W', steps: [null] } as never, makeCatalog())
    );
    expect(issues).toEqual([
      { path: 'steps[0]', message: 'Step entry must be an object', severity: 'error' },
    ]);
  });

  it('reports a step with an empty id and a missing form', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        { version: 1, id: 'wf', name: 'W', steps: [{ id: '', title: 'A' }] } as never,
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      { path: 'steps[0].id', message: 'Step must have a non-empty "id"', severity: 'error' },
      { path: 'steps[0].form', message: 'Step must have a "form" object', severity: 'error' },
    ]);
  });

  it('flags a non-string "matches" value in a step condition tree', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        {
          version: 1,
          id: 'wf',
          name: 'W',
          steps: [
            {
              id: 'a',
              title: 'A',
              form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
              conditions: {
                visible: {
                  field: 'x',
                  operator: 'and',
                  logicalOperator: 'and',
                  conditions: [{ field: 'x', operator: 'matches', value: /abc/ }],
                } as never,
              },
            },
          ],
        },
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].conditions.visible.conditions[0].value',
        message: 'matches must use a string pattern in a serialized schema',
        severity: 'error',
      },
    ]);
  });

  it('accepts a string "matches" pattern', () => {
    const result = validateFlowSchema(
      {
        version: 1,
        id: 'wf',
        name: 'W',
        steps: [
          {
            id: 'a',
            title: 'A',
            form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
            conditions: { skippable: { field: 'x', operator: 'matches', value: '^a' } },
          },
        ],
      },
      makeCatalog()
    );
    expect(result).toBeUndefined();
  });
});

describe('isFlowSchema', () => {
  it('guards structurally', () => {
    expect(isFlowSchema({ id: 'w', name: 'W', steps: [] })).toBe(true);
    expect(isFlowSchema({ id: 'w' })).toBe(false);
    expect(isFlowSchema({ id: 'w', name: 'W', steps: 'nope' })).toBe(false);
    expect(isFlowSchema(null)).toBe(false);
    expect(isFlowSchema('wf')).toBe(false);
  });
});
