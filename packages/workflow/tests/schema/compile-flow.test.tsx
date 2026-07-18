import type {
  StandardSchema,
  StepConditionalBehavior,
  StepDataHelper,
  WorkflowContext,
} from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { SchemaValidationError } from '@rilaykit/forms';
import {
  type FlowBindings,
  type FlowSchema,
  type StepContext,
  compileFlow,
} from '@rilaykit/workflow';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

function makeCatalog() {
  return ril
    .create()
    .component('text', { name: 'Text', renderer: () => React.createElement('input') });
}

function makeHelper(allData: Record<string, Record<string, unknown>>): StepDataHelper {
  return {
    setStepData: () => {},
    setStepFields: () => {},
    getStepData: (stepId) => allData[stepId] ?? {},
    setNextStepField: () => {},
    setNextStepFields: () => {},
    getAllData: () => allData,
    getSteps: () => [],
  };
}

function makeWorkflowContext(): WorkflowContext {
  return {
    workflowId: 'wf',
    currentStepIndex: 0,
    totalSteps: 1,
    allData: {},
    stepData: {},
    isFirstStep: true,
    isLastStep: true,
    visitedSteps: new Set<string>(),
    visibleVisitedSteps: new Set<string>(),
    passedSteps: new Set<string>(),
  };
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

    const { workflowConfig: config } = compileFlow(schema, makeCatalog());

    expect(config.id).toBe('wf');
    expect(config.name).toBe('Onboarding');
    expect(config.description).toBe('Sign-up flow');
    expect(config.steps.map((s) => s.id)).toEqual(['personal', 'company']);
    expect(config.steps.map((s) => s.title)).toEqual(['Personal', 'Company']);
    expect(config.steps[0]?.description).toBe('Who you are');
    expect(config.steps[0]?.formConfig.allFields.map((f) => f.id)).toEqual(['name']);
    expect(config.steps[1]?.formConfig.allFields.map((f) => f.id)).toEqual(['siren']);
  });

  it('returns each step’s compiled defaults keyed by step id', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'personal',
          title: 'Personal',
          form: {
            version: 1,
            id: 'personal',
            fields: [{ id: 'name', type: 'text', default: 'Ada' }],
          },
        },
        {
          id: 'company',
          title: 'Company',
          form: {
            version: 1,
            id: 'company',
            fields: [{ id: 'siren', type: 'text', default: 'inline' }],
            // The schema-level block is the explicit override and wins.
            defaultValues: { siren: '123' },
          },
        },
        // Declares no defaults — contributes no key.
        {
          id: 'bare',
          title: 'Bare',
          form: { version: 1, id: 'bare', fields: [{ id: 'x', type: 'text' }] },
        },
      ],
    };

    const { defaultValues } = compileFlow(schema, makeCatalog());

    expect(defaultValues).toEqual({ personal: { name: 'Ada' }, company: { siren: '123' } });
  });

  it('does not resolve an allowSkip binding named "toString" off Object.prototype', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          allowSkip: { binding: 'toString' },
        },
      ],
    };

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog(), { bindings: { allowSkip: {} } });
    } catch (error) {
      caught = error;
    }

    // Reported by validateFlowSchema up front (bindings were supplied), so the
    // reference never reaches resolveBinding's NotFoundError.
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'steps[0].allowSkip',
        message: 'allowSkip binding "toString" not found in bindings',
        severity: 'error',
      },
    ]);
  });

  it('keeps a step id of "__proto__" as a real defaultValues key', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: '__proto__',
          title: 'Proto',
          form: {
            version: 1,
            id: 'proto',
            fields: [{ id: 'name', type: 'text', default: 'Ada' }],
          },
        },
      ],
    };

    const { defaultValues } = compileFlow(schema, makeCatalog());

    expect(defaultValues).toBeDefined();
    expect(Object.keys(defaultValues as Record<string, unknown>)).toEqual(['__proto__']);
    expect(
      Object.getOwnPropertyDescriptor(defaultValues as Record<string, unknown>, '__proto__')?.value
    ).toEqual({ name: 'Ada' });
  });

  it('returns per-step defaultValues detached from the input schema', () => {
    const schema: FlowSchema = {
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
            fields: [{ id: 'x', type: 'text' }],
            defaultValues: { x: 'original' },
          },
        },
      ],
    };

    const first = compileFlow(schema, makeCatalog());
    const second = compileFlow(schema, makeCatalog());

    (first.defaultValues?.a as Record<string, unknown>).x = 'mutated';

    expect(second.defaultValues).toEqual({ a: { x: 'original' } });
    expect(schema.steps[0].form.defaultValues).toEqual({ x: 'original' });
  });

  it('omits defaultValues when no step declares any', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        { id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] } },
      ],
    };

    expect(compileFlow(schema, makeCatalog()).defaultValues).toBeUndefined();
  });

  it('resolves allowSkip predicate and onAfterValidation via bindings', () => {
    const after = vi.fn();
    const bindings: FlowBindings = {
      allowSkip: { vip: (ctx) => ctx.allData.vip === true },
      after: { lookup: after },
    };
    const metadata = { icon: 'user' };
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
          metadata,
        },
      ],
    };

    const { workflowConfig: config } = compileFlow(schema, makeCatalog(), { bindings });

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
    // The builder wraps the modern `after` handler into the legacy 3-arg
    // `onAfterValidation` shape, so identity no longer holds — invoke it and
    // assert the bound handler received a StepContext.
    const onAfterValidation = config.steps[0]?.onAfterValidation;
    expect(typeof onAfterValidation).toBe('function');
    onAfterValidation?.({ x: 'v' }, makeHelper({ a: { x: 'v' } }), makeWorkflowContext());

    expect(after).toHaveBeenCalledTimes(1);
    const ctx = after.mock.calls[0]?.[0] as StepContext;
    expect(ctx.data).toEqual({ x: 'v' });
    expect(ctx.meta).toEqual(metadata);
    expect(ctx.isFirst).toBe(true);
    expect(ctx.isLast).toBe(true);
    expect(ctx.workflow.all()).toEqual({ a: { x: 'v' } });
    expect(ctx.workflow.get('a')).toEqual({ x: 'v' });
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

    const { workflowConfig: config } = compileFlow(schema, makeCatalog());

    expect(config.steps[0]?.allowSkip).toBe(true);
    expect(config.steps[1]?.allowSkip).toBe(false);
  });

  it('passes conditions and metadata through untouched', () => {
    const conditions: StepConditionalBehavior = {
      visible: { field: 'x', operator: 'equals', value: 1 },
    };
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
          conditions,
          metadata,
        },
      ],
    };

    const { workflowConfig: config } = compileFlow(schema, makeCatalog());

    expect(config.steps[0]?.conditions).toEqual(conditions);
    expect(config.steps[0]?.metadata).toEqual(metadata);
  });

  it('throws SchemaValidationError for a structurally invalid flow schema', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'dup',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
        },
        {
          id: 'dup',
          title: 'B',
          form: { version: 1, id: 'b', fields: [{ id: 'y', type: 'text' }] },
        },
      ],
    };

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      { path: 'steps[1].id', message: 'Duplicate step id "dup"', severity: 'error' },
    ]);
  });

  it('reports an invalid step form through the flow-prefixed issue path', () => {
    const schema: FlowSchema = {
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
    };

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'steps[0].form.fields[0].type',
        message: 'Unknown component type "ghost". Must be registered in ril config.',
        severity: 'error',
      },
    ]);
  });

  it('forwards field-level bindings to compileForm', () => {
    const bindings: FlowBindings = {
      validators: {
        notFoo: (_params, message) => ({
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value) =>
              value === 'foo' ? { issues: [{ message: message ?? 'no foo' }] } : { value },
          },
        }),
      },
    };
    const schema: FlowSchema = {
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
            fields: [{ id: 'x', type: 'text', validation: { rules: [{ type: 'notFoo' }] } }],
          },
        },
      ],
    };

    const { workflowConfig: config } = compileFlow(schema, makeCatalog(), { bindings });

    const validate = config.steps[0]?.formConfig.allFields[0]?.validation
      ?.validate as StandardSchema;
    expect(validate['~standard'].validate('foo')).toEqual({ issues: [{ message: 'no foo' }] });
    expect(validate['~standard'].validate('bar')).toEqual({ value: 'bar' });
  });

  // An unresolved binding is a defect of the schema as handed in, and
  // `compileFlow` presents ONE error contract for those: SchemaValidationError
  // with an issue path'd at the offending declaration. It used to escape as an
  // untyped NotFoundError with no `issues[]` whenever no bindings at all were
  // supplied.
  it('throws SchemaValidationError for an unresolved allowSkip binding', () => {
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

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'steps[0].allowSkip',
        message: 'allowSkip binding "missing" not found in bindings',
        severity: 'error',
      },
    ]);
  });

  it('throws SchemaValidationError for a malformed allowSkip payload', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'a',
          title: 'A',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
          allowSkip: null as unknown as boolean,
        },
      ],
    };

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'steps[0].allowSkip',
        message: 'Step "allowSkip" must be a boolean or a { binding } reference',
        severity: 'error',
      },
    ]);
  });

  it('throws SchemaValidationError for an unresolved onAfterValidation binding', () => {
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

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalog());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).issues).toEqual([
      {
        path: 'steps[0].onAfterValidation',
        message: 'onAfterValidation binding "ghost" not found in bindings',
        severity: 'error',
      },
    ]);
  });
});

describe('compileFlow — step identity in errors', () => {
  function makeCatalogLocal() {
    return ril
      .create()
      .component('text', { name: 'Text', renderer: () => React.createElement('input') });
  }

  // A form the STRUCTURAL pass accepts but the BUILDER rejects: two fields
  // sharing an id. The failure therefore escapes from inside the per-step
  // compileForm, where step identity is otherwise lost.
  const duplicateIdForm = {
    version: 1 as const,
    id: 'second-form',
    fields: [
      { id: 'dup', type: 'text' },
      { id: 'dup', type: 'text' },
    ],
  };

  it("names the failing step's id and index when its form fails to compile", () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'W',
      steps: [
        {
          id: 'first',
          title: 'First',
          form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] },
        },
        { id: 'second', title: 'Second', form: duplicateIdForm },
      ],
    };

    let caught: unknown;
    try {
      compileFlow(schema, makeCatalogLocal());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('steps[1]');
    expect((caught as Error).message).toContain('second');
    // The original failure is preserved, not swallowed.
    expect((caught as Error).message).toContain('dup');
  });
});
