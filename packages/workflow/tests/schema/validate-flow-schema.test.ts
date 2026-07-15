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

  it('accepts a version-less schema (version is optional)', () => {
    const result = validateFlowSchema(
      {
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

  it('reports missing id and name', () => {
    const issues = issuesOf(() =>
      validateFlowSchema({ version: 1, id: '', name: '', steps: [] }, makeCatalog())
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
        message: 'Unsupported Flow schema version "2". Only version 1 is supported.',
        severity: 'error',
      },
    ]);
  });

  it('does not throw on a warning-only schema', () => {
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
            conditions: { visible: { field: '', operator: 'equals', value: true } },
          },
        ],
      },
      makeCatalog()
    );
    expect(result).toBeUndefined();
  });

  it('reports warnings alongside errors in the thrown payload', () => {
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
              conditions: { visible: { field: '', operator: 'equals', value: true } },
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
      {
        path: 'steps[0].conditions.visible.field',
        message: 'Leaf condition must have a non-empty "field"',
        severity: 'warning',
      },
      { path: 'steps[1].id', message: 'Duplicate step id "a"', severity: 'error' },
    ]);
  });

  it('resolves a step form effect handler through the supplied bindings', () => {
    const schema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: {
            version: 1,
            id: 'a',
            fields: [{ id: 'x', type: 'text', effects: [{ watch: 'x', handler: 'h', set: 'x' }] }],
          },
        },
      ],
    } as const;

    expect(
      validateFlowSchema(schema as never, makeCatalog(), {
        effects: { h: () => ({ value: 'ok' }) },
      })
    ).toBeUndefined();

    expect(issuesOf(() => validateFlowSchema(schema as never, makeCatalog()))).toEqual([
      {
        path: 'steps[0].form.fields[0].effects[0].handler',
        message: 'Effect handler "h" not found in registry',
        severity: 'error',
      },
    ]);
  });

  it('reports a missing "steps" array', () => {
    const issues = issuesOf(() =>
      validateFlowSchema({ version: 1, id: 'wf', name: 'W' } as never, makeCatalog())
    );
    expect(issues).toEqual([
      { path: 'steps', message: 'Flow schema must have a "steps" array', severity: 'error' },
    ]);
  });

  it('reports a non-array "steps"', () => {
    const issues = issuesOf(() =>
      validateFlowSchema({ version: 1, id: 'wf', name: 'W', steps: 'nope' } as never, makeCatalog())
    );
    expect(issues).toEqual([
      { path: 'steps', message: 'Flow schema must have a "steps" array', severity: 'error' },
    ]);
  });

  it('re-maps a path-less form issue onto "steps[i].form" without a trailing dot', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(
        {
          version: 1,
          id: 'wf',
          name: 'W',
          steps: [{ id: 'a', title: 'A', form: { version: 1, id: 'a' } }],
        } as never,
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].form',
        message: 'Form schema must have either "fields" or "rows"',
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
                  operator: 'exists',
                  logicalOperator: 'and',
                  conditions: [{ field: 'x', operator: 'matches', value: /abc/ }],
                },
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

  it('flags a non-string "matches" value in a step\'s skippable condition', () => {
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
              conditions: { skippable: { field: 'x', operator: 'matches', value: /abc/ } },
            },
          ],
        },
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].conditions.skippable.value',
        message: 'matches must use a string pattern in a serialized schema',
        severity: 'error',
      },
    ]);
  });

  it('flags an invalid operator in a step condition (same rule as field conditions)', () => {
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
              conditions: { visible: { field: 'x', operator: 'ghost' } },
            },
          ],
        } as never,
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].conditions.visible.operator',
        message: 'Invalid condition operator "ghost"',
        severity: 'error',
      },
    ]);
  });

  it('flags a non-string "matches" value in a field condition inside a step form', () => {
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
              form: {
                version: 1,
                id: 'a',
                fields: [
                  {
                    id: 'x',
                    type: 'text',
                    conditions: { visible: { field: 'y', operator: 'matches', value: /abc/ } },
                  },
                ],
              },
            },
          ],
        },
        makeCatalog()
      )
    );
    expect(issues).toEqual([
      {
        path: 'steps[0].form.fields[0].conditions.visible.value',
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
    expect(isFlowSchema({ id: '', name: 'W', steps: [] })).toBe(false);
    expect(isFlowSchema({ id: 'w', name: 'W', version: 2, steps: [] })).toBe(false);
    expect(isFlowSchema({ id: 'w', name: 'W', version: 1, steps: [] })).toBe(true);
  });
});

describe('validateFlowSchema — step title', () => {
  function makeSchema(step: Record<string, unknown>) {
    return {
      version: 1 as const,
      id: 'wf',
      name: 'W',
      steps: [
        { id: 'a', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] }, ...step },
      ],
    };
  }

  for (const [label, title] of [
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
  ] as const) {
    it(`reports a step whose title is ${label}`, () => {
      // @ts-expect-error — untrusted JSON: the public type declares title: string
      const issues = issuesOf(() => validateFlowSchema(makeSchema({ title }), makeCatalog()));

      expect(issues).toEqual([
        {
          path: 'steps[0].title',
          message: 'Step must have a non-empty "title"',
          severity: 'error',
        },
      ]);
    });
  }

  it('accepts a step with a non-empty title', () => {
    expect(() => validateFlowSchema(makeSchema({ title: 'A' }), makeCatalog())).not.toThrow();
  });
});

describe('validateFlowSchema — binding resolution', () => {
  function makeSchema(step: Record<string, unknown>) {
    return {
      version: 1 as const,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          ...step,
        },
      ],
    };
  }

  it('reports an unresolvable allowSkip binding when bindings are supplied', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(makeSchema({ allowSkip: { binding: 'missing' } }), makeCatalog(), {
        allowSkip: {},
      })
    );

    expect(issues).toEqual([
      {
        path: 'steps[0].allowSkip',
        message: 'allowSkip binding "missing" not found in bindings',
        severity: 'error',
      },
    ]);
  });

  it('reports an unresolvable onAfterValidation binding when bindings are supplied', () => {
    const issues = issuesOf(() =>
      validateFlowSchema(makeSchema({ onAfterValidation: 'missing' }), makeCatalog(), { after: {} })
    );

    expect(issues).toEqual([
      {
        path: 'steps[0].onAfterValidation',
        message: 'onAfterValidation binding "missing" not found in bindings',
        severity: 'error',
      },
    ]);
  });

  it('resolves bindings that are present', () => {
    expect(() =>
      validateFlowSchema(
        makeSchema({ allowSkip: { binding: 'ok' }, onAfterValidation: 'done' }),
        makeCatalog(),
        { allowSkip: { ok: () => true }, after: { done: () => {} } }
      )
    ).not.toThrow();
  });

  it('skips binding checks entirely when no bindings are supplied (structure-only pass)', () => {
    expect(() =>
      validateFlowSchema(
        makeSchema({ allowSkip: { binding: 'missing' }, onAfterValidation: 'missing' }),
        makeCatalog()
      )
    ).not.toThrow();
  });
});
