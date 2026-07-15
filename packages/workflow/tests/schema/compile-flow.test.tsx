import { NotFoundError, ril } from '@rilaykit/core';
import { type FlowBindings, type FlowSchema, compileFlow } from '@rilaykit/workflow';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

describe('compileFlow', () => {
  it('compiles a FlowSchema into a WorkflowConfig with per-step compiled forms', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Onboarding',
      description: 'Sign-up flow',
      steps: [
        {
          id: 'personal',
          title: 'Personal',
          description: 'Who you are',
          form: { version: 1, id: 'personal', fields: [{ id: 'name', type: 'text' }] },
        },
        {
          id: 'company',
          title: 'Company',
          form: { version: 1, id: 'company', fields: [{ id: 'siren', type: 'text' }] },
        },
      ],
    };

    const config = compileFlow(schema, makeCatalog());

    expect(config.id).toBe('wf');
    expect(config.name).toBe('Onboarding');
    expect(config.description).toBe('Sign-up flow');
    expect(config.steps.map((s) => s.id)).toEqual(['personal', 'company']);
    expect(config.steps.map((s) => s.title)).toEqual(['Personal', 'Company']);
    expect(config.steps[0]?.description).toBe('Who you are');
    expect(config.steps[0]?.formConfig.allFields.map((f) => f.id)).toEqual(['name']);
    expect(config.steps[1]?.formConfig.allFields.map((f) => f.id)).toEqual(['siren']);
  });

  it('resolves allowSkip predicate and onAfterValidation via bindings', () => {
    const after = vi.fn();
    const bindings: FlowBindings = {
      allowSkip: { vip: (ctx) => ctx.allData.vip === true },
      after: { lookup: after },
    };
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          allowSkip: { binding: 'vip' },
          onAfterValidation: 'lookup',
        },
      ],
    };

    const config = compileFlow(schema, makeCatalog(), { bindings });

    const allowSkip = config.steps[0]?.allowSkip;
    expect(typeof allowSkip).toBe('function');
    expect(
      (allowSkip as (ctx: { allData: Record<string, unknown> }) => boolean)({
        allData: { vip: true },
      })
    ).toBe(true);
    expect(
      (allowSkip as (ctx: { allData: Record<string, unknown> }) => boolean)({
        allData: { vip: false },
      })
    ).toBe(false);
    expect(config.steps[0]?.onAfterValidation).toBe(after);
  });

  it('passes a static boolean allowSkip through and defaults to false', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          allowSkip: true,
        },
        { id: 'b', title: 'B', form: { version: 1, id: 'b', fields: [{ id: 'x', type: 'text' }] } },
      ],
    };

    const config = compileFlow(schema, makeCatalog());

    expect(config.steps[0]?.allowSkip).toBe(true);
    expect(config.steps[1]?.allowSkip).toBe(false);
  });

  it('passes conditions and metadata through untouched', () => {
    const conditions = { visible: { field: 'x', operator: 'equals' as const, value: 1 } };
    const metadata = { analyticsId: 'step-a' };
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          conditions: conditions as never,
          metadata,
        },
      ],
    };

    const config = compileFlow(schema, makeCatalog());

    expect(config.steps[0]?.conditions).toEqual(conditions);
    expect(config.steps[0]?.metadata).toEqual(metadata);
  });

  it('throws NotFoundError for an unresolved allowSkip binding', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          allowSkip: { binding: 'missing' },
        },
      ],
    };

    expect(() => compileFlow(schema, makeCatalog())).toThrowError(NotFoundError);
    expect(() => compileFlow(schema, makeCatalog())).toThrowError(/missing/);
  });

  it('throws NotFoundError for an unresolved onAfterValidation binding', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          onAfterValidation: 'ghost',
        },
      ],
    };

    expect(() => compileFlow(schema, makeCatalog())).toThrowError(NotFoundError);
    expect(() => compileFlow(schema, makeCatalog())).toThrowError(/ghost/);
  });
});
