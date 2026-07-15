import type { FlowBindings, FlowSchema } from '@rilaykit/workflow';
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
      ],
    };
    expectTypeOf(schema.steps[0]!.form.id).toEqualTypeOf<string>();
    expectTypeOf<FlowSchema['steps'][number]['allowSkip']>().toEqualTypeOf<
      boolean | { readonly binding: string } | undefined
    >();
    expectTypeOf<FlowSchema['steps'][number]['onAfterValidation']>().toEqualTypeOf<
      string | undefined
    >();

    const bindings: FlowBindings = {
      allowSkip: { vipSkip: (ctx) => ctx.allData.vip === true },
      after: { lookupCompany: async () => {} },
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
    void bindings;
    void combined;
    void bad;
    void missingName;
  });
});
