// @ts-nocheck - Disable TypeScript checking for test file: these schemas and
// bindings carry deliberately hostile input that the public types forbid.
import { ril } from '@rilaykit/core';
import { SchemaValidationError } from '@rilaykit/forms';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { compileFlow, validateFlowSchema } from '../../src/schema';

/**
 * `compileFlow` presents ONE error contract: every defect of the schema AS
 * HANDED IN — including a binding reference nothing resolves, and a binding that
 * resolves to something that is not callable — is a SchemaValidationError with
 * `issues[]`. Structure-only validation (no bindings supplied) stays a
 * legitimate, binding-agnostic use.
 */

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

function makeStep(extra: Record<string, unknown>) {
  return {
    id: 's1',
    title: 'Step 1',
    form: {
      version: 1,
      id: 'f1',
      fields: [{ id: 'a', type: 'text', props: {} }],
    },
    ...extra,
  };
}

function makeSchema(extra: Record<string, unknown>) {
  return { version: 1, id: 'flow', name: 'Flow', steps: [makeStep(extra)] };
}

function expectIssue(fn: () => unknown, path: string, message: string) {
  expect(fn).toThrow(SchemaValidationError);
  try {
    fn();
  } catch (error) {
    expect((error as SchemaValidationError).issues).toContainEqual({
      path,
      message,
      severity: 'error',
    });
  }
}

describe('compileFlow binding error contract', () => {
  it('reports an allowSkip reference when NO bindings are supplied at all', () => {
    // Validation skips binding checks when bindings are absent (structure-only
    // validation is legitimate), and compileFlow's resolve then throws an
    // UNTYPED NotFoundError with no issues[] — the one escape from the contract.
    expectIssue(
      () => compileFlow(makeSchema({ allowSkip: { binding: 'canSkip' } }), makeCatalog()),
      'steps[0].allowSkip',
      'allowSkip binding "canSkip" not found in bindings'
    );
  });

  it('reports an onAfterValidation reference when NO bindings are supplied at all', () => {
    expectIssue(
      () => compileFlow(makeSchema({ onAfterValidation: 'prefill' }), makeCatalog()),
      'steps[0].onAfterValidation',
      'onAfterValidation binding "prefill" not found in bindings'
    );
  });

  it('keeps structure-only validation binding-agnostic', () => {
    // The same schema, validated without bindings, is structurally sound: a
    // reference to a binding that does not exist YET is not a structural defect.
    expect(() =>
      validateFlowSchema(makeSchema({ allowSkip: { binding: 'canSkip' } }), makeCatalog())
    ).not.toThrow();
  });

  it('reports a NON-FUNCTION allowSkip binding as an issue naming the binding', () => {
    expectIssue(
      () =>
        compileFlow(makeSchema({ allowSkip: { binding: 'canSkip' } }), makeCatalog(), {
          bindings: { allowSkip: { canSkip: 'yes' } },
        }),
      'steps[0].allowSkip',
      'allowSkip binding "canSkip" in bindings is not a function'
    );
  });

  it('reports a NON-FUNCTION onAfterValidation binding as an issue naming the binding', () => {
    expectIssue(
      () =>
        compileFlow(makeSchema({ onAfterValidation: 'prefill' }), makeCatalog(), {
          bindings: { after: { prefill: { not: 'a function' } } },
        }),
      'steps[0].onAfterValidation',
      'onAfterValidation binding "prefill" in bindings is not a function'
    );
  });
});
