import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { compileForm } from '../../src/schema/compile-form';
import type { FormSchema } from '../../src/schema/types';
import { SchemaValidationError } from '../../src/schema/types';

/**
 * Round 22: model-authored / corrupted schema JSON is UNTRUSTED. Two recursive
 * walkers over that input had no depth bound and threw a raw
 * `RangeError: Maximum call stack size exceeded`, escaping the documented
 * "compileForm only throws SchemaValidationError" contract (and crashing the
 * ShowForm/ShowFlow render, which catches only SchemaValidationError). Both must
 * now reject cleanly — mirroring ShowComponent's own MAX_NODE_DEPTH bound.
 */
const makeCatalog = () =>
  ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
  });

/** A composite condition tree nested `depth` levels deep (built iteratively). */
function deepConditionTree(depth: number): unknown {
  let node: unknown = { field: 'x', operator: 'exists' };
  for (let i = 0; i < depth; i++) {
    node = { logicalOperator: 'and', conditions: [node] };
  }
  return node;
}

/** A plain object nested `depth` levels deep (built iteratively). */
function deepObject(depth: number): unknown {
  let node: unknown = { leaf: 1 };
  for (let i = 0; i < depth; i++) {
    node = { nested: node };
  }
  return node;
}

/** compileForm typed against a well-formed schema; these are deliberately hostile. */
function compileHostile(schema: unknown): void {
  compileForm(schema as unknown as FormSchema, makeCatalog());
}

describe('Round 22: deeply nested untrusted schema input rejects cleanly', () => {
  it('deeply nested field conditions do not stack-overflow the compiler', () => {
    let threw: unknown;
    try {
      compileHostile({
        id: 'f',
        fields: [
          { id: 'a', type: 'text', props: {}, conditions: { visible: deepConditionTree(50000) } },
        ],
      });
    } catch (error) {
      threw = error;
    }
    // Never a raw RangeError: either it validates or it is a typed schema error.
    expect(threw === undefined || threw instanceof SchemaValidationError).toBe(true);
  });

  it('deeply nested defaultValues do not stack-overflow the deep clone', () => {
    let threw: unknown;
    try {
      compileHostile({
        id: 'f',
        fields: [{ id: 'a', type: 'text', props: {} }],
        defaultValues: { a: deepObject(50000) },
      });
    } catch (error) {
      threw = error;
    }
    expect(threw === undefined || threw instanceof SchemaValidationError).toBe(true);
  });
});
