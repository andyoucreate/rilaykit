// @ts-nocheck - Disable TypeScript checking for test file: these schemas carry
// deliberately hostile untrusted input that the public types forbid.
import { ril } from '@rilaykit/core';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SchemaValidationError, compileForm } from '../../src/schema';

/**
 * Spec §7 self-correction promises `{ error, issues, expectedKeys }` so an agent
 * can repair its OWN emission. An issue that says only "the props of field `a`
 * are wrong" is not actionable: the offending prop key and the set of keys the
 * component actually accepts must both survive into the issue.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: () => React.createElement('input'),
    propsSchema: z.object({ label: z.string(), options: z.array(z.string()) }),
  });
}

describe('compileForm validateProps actionability', () => {
  it('paths the issue at the offending prop key and carries expectedKeys', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 42 } }],
    };

    expect(() => compileForm(schema, makeCatalog(), { validateProps: true })).toThrow(
      SchemaValidationError
    );

    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
      expect.unreachable('compileForm must reject props violating the propsSchema');
    } catch (error) {
      const { issues } = error as SchemaValidationError;

      const labelIssue = issues.find((issue) => issue.path === 'fields[0].props.label');
      expect(labelIssue).toBeDefined();
      expect(labelIssue?.severity).toBe('error');
      expect(labelIssue?.expectedKeys).toEqual(['label', 'options']);
    }
  });

  it('paths a missing required prop at that prop key', () => {
    const schema = {
      version: 1,
      id: 'f',
      fields: [{ id: 'a', type: 'text', props: { label: 'ok' } }],
    };

    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
      expect.unreachable('compileForm must reject a missing required prop');
    } catch (error) {
      const { issues } = error as SchemaValidationError;
      expect(issues.map((issue) => issue.path)).toContain('fields[0].props.options');
    }
  });

  it('paths issues through a rows schema', () => {
    const schema = {
      version: 1,
      id: 'f',
      rows: [
        {
          kind: 'fields',
          fields: [
            { id: 'a', type: 'text', props: { label: 'ok', options: [] } },
            { id: 'b', type: 'text', props: { label: 42, options: [] } },
          ],
        },
      ],
    };

    try {
      compileForm(schema, makeCatalog(), { validateProps: true });
      expect.unreachable('compileForm must reject props violating the propsSchema');
    } catch (error) {
      const { issues } = error as SchemaValidationError;
      expect(issues.map((issue) => issue.path)).toContain('rows[0].fields[1].props.label');
    }
  });
});
