// @ts-nocheck - Disable TypeScript checking for test file: a null root is
// deliberately hostile untrusted input that the public types forbid.
import { ril } from '@rilaykit/core';
import { SchemaValidationError } from '@rilaykit/forms';
import { compileFlow } from '@rilaykit/workflow';
import React from 'react';
import { describe, expect, it } from 'vitest';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

describe('compileFlow error contract', () => {
  it('reports a null schema root instead of throwing a raw TypeError', () => {
    expect(() => compileFlow(null, makeCatalog())).toThrow(SchemaValidationError);

    try {
      compileFlow(null, makeCatalog());
    } catch (error) {
      expect((error as SchemaValidationError).issues).toEqual([
        { path: '', message: 'Flow schema must be an object', severity: 'error' },
      ]);
    }
  });
});
