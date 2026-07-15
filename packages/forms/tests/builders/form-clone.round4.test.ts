import { ril } from '@rilaykit/core';
// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';

describe('form.clone() round-4 hardening', () => {
  let rilConfig: any;

  beforeEach(() => {
    rilConfig = ril.create().component('text', {
      name: 'Text Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '' },
    });
  });

  // BUG 1
  it('preserves form-level validation and submitOptions', () => {
    const cloned = form
      .create(rilConfig, 'base')
      .add({ id: 'a', type: 'text' })
      .setValidation({ validate: () => ({ valid: false, errors: ['x'] }) })
      .setSubmitOptions({ force: true })
      .clone('c')
      .build();

    expect(cloned.validation).toBeDefined();
    expect(cloned.validation?.validate).toBeInstanceOf(Function);
    expect(cloned.submitOptions?.force).toBe(true);
  });

  // BUG 2
  it('continues id numbering after clone so no duplicate ids are generated', () => {
    const c = form.create(rilConfig).add({ type: 'text' }).clone();
    c.add({ type: 'text' });

    expect(() => c.build()).not.toThrow();

    const ids = c.getFields().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
