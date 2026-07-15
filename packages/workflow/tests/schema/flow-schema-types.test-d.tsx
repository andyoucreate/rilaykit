import type { StepConditionalBehavior } from '@rilaykit/core';
import type {
  AfterValidationHandler,
  AllowSkipPredicate,
  CompileFlowOptions,
  FlowBindings,
  FlowSchema,
  FlowSchemaStep,
  StepContext,
} from '@rilaykit/workflow';
import { describe, expectTypeOf, it } from 'vitest';

describe('FlowSchema types', () => {
  it('is a JSON-serializable flow definition with per-step FormSchema', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Onboarding',
      steps: [
        { id: 'a', title: 'A', form: { version: 1, id: 'a', fields: [{ id: 'x', type: 'text' }] } },
        {
          id: 'b',
          title: 'B',
          form: { version: 1, id: 'b', fields: [] },
          allowSkip: { binding: 'vipSkip' },
          onAfterValidation: 'lookupCompany',
        },
        {
          id: 'c',
          title: 'C',
          description: 'third',
          form: { version: 1, id: 'c', fields: [] },
          conditions: { visible: { field: 'x', operator: 'equals', value: 1 } },
          metadata: { analyticsId: 'c' },
          allowSkip: true,
        },
      ],
    };
    expectTypeOf(schema.steps[0]!.form.id).toEqualTypeOf<string>();
    expectTypeOf<FlowSchema['steps'][number]['allowSkip']>().toEqualTypeOf<
      boolean | { readonly binding: string } | undefined
    >();
    expectTypeOf<FlowSchema['steps'][number]['onAfterValidation']>().toEqualTypeOf<
      string | undefined
    >();

    // Step passthrough fields consumed by `compileFlow` keep their core contract.
    expectTypeOf<FlowSchemaStep['conditions']>().toEqualTypeOf<
      StepConditionalBehavior | undefined
    >();
    expectTypeOf<FlowSchemaStep['metadata']>().toEqualTypeOf<Record<string, unknown> | undefined>();
    expectTypeOf<FlowSchemaStep['description']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<FlowSchema['version']>().toEqualTypeOf<1 | undefined>();

    // @ts-expect-error — version is the literal 1, not an arbitrary number
    const badVersion: FlowSchema = { version: 2, id: 'wf', name: 'n', steps: [] };

    const bindings: FlowBindings = {
      allowSkip: { vipSkip: (ctx) => ctx.allData.vip === true },
      after: {
        lookupCompany: async (step) => {
          void step.data;
          void step.workflow.all();
          step.next.prefill({ companyName: '' });
        },
      },
    };

    // FlowBindings extends the forms `Bindings`: a single object resolves both
    // field-level validators/effects and step-level allowSkip/after handlers.
    const combined: FlowBindings = {
      validators: {
        notFoo: (_props, message) => ({
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value) =>
              value === 'foo' ? { issues: [{ message: message ?? 'no foo' }] } : { value },
          },
        }),
      },
      allowSkip: { vipSkip: () => true },
    };

    // @ts-expect-error — allowSkip predicates receive { allData }, not a bare string
    const bad: FlowBindings = { allowSkip: { vipSkip: (ctx: string) => ctx === 'x' } };

    // @ts-expect-error — `name` is required on a FlowSchema
    const missingName: FlowSchema = { id: 'wf', steps: [] };

    void schema;
    void badVersion;
    void bindings;
    void combined;
    void bad;
    void missingName;
  });

  it('exposes the full binding contracts through the package barrel', () => {
    // `AllowSkipPredicate` stays the predicate arm of core's `StepAllowSkip`.
    expectTypeOf<AllowSkipPredicate>().toEqualTypeOf<
      (ctx: { allData: Record<string, unknown> }) => boolean
    >();

    // `AfterValidationHandler` is the builder's MODERN `after` input — a single
    // StepContext — not the deprecated 3-arg `onAfterValidation`. The builder
    // owns the wrapping into the legacy shape.
    expectTypeOf<Parameters<AfterValidationHandler>>().toEqualTypeOf<[StepContext]>();
    expectTypeOf<ReturnType<AfterValidationHandler>>().toEqualTypeOf<void | Promise<void>>();

    // `CompileFlowOptions` carries the bindings `compileFlow` resolves against.
    expectTypeOf<CompileFlowOptions>().toEqualTypeOf<{ readonly bindings?: FlowBindings }>();
  });
});
