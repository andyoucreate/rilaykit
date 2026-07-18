import { ril } from '@rilaykit/core';
import { SchemaValidationError, compileForm } from '@rilaykit/forms';
import type { FormSchema } from '@rilaykit/forms';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileFlow } from '../../src/schema/compile-flow';
import type { FlowSchema } from '../../src/schema/flow-schema-types';

/**
 * `validateProps` is the contract the self-correction loop reads: a compile
 * failure carries `issues[].path` and `issues[].expectedKeys`, so an author —
 * human or agent — can fix the JSON it just emitted.
 *
 * `compileFlow` never forwarded the option, and `CompileFlowOptions` had no
 * slot for it, so a caller could not even ask. A FlowSchema is the agent
 * layer's primary artifact: self-correction worked for forms and was silently
 * blind for flows — the identical bad form compiled clean as a step and its
 * bad props reached the renderer.
 */

const catalog = ril.create().component('text', {
  renderer: () => null as never,
  propsSchema: z.object({ label: z.string(), placeholder: z.string().optional() }),
});

const BAD_FORM = {
  version: 1,
  id: 'account',
  fields: [{ id: 'email', type: 'text', props: { label: 123 } }],
} as unknown as FormSchema;

const BAD_FLOW = {
  version: 1,
  id: 'signup',
  name: 'Signup',
  steps: [{ id: 'account', title: 'Account', form: BAD_FORM }],
} as unknown as FlowSchema;

describe('compileFlow — validateProps parity with compileForm', () => {
  it('reports the same issue compileForm does, at the step-qualified path', () => {
    // The contract, as it already works for a standalone form.
    let fromForm: unknown;
    try {
      compileForm(BAD_FORM, catalog, { validateProps: true });
    } catch (error) {
      fromForm = error;
    }
    expect(fromForm).toBeInstanceOf(SchemaValidationError);
    expect((fromForm as SchemaValidationError).issues[0].expectedKeys).toEqual([
      'label',
      'placeholder',
    ]);

    // The identical form, embedded as a step.
    let fromFlow: unknown;
    try {
      compileFlow(BAD_FLOW, catalog, { validateProps: true });
    } catch (error) {
      fromFlow = error;
    }
    expect(fromFlow).toBeInstanceOf(SchemaValidationError);
    const issue = (fromFlow as SchemaValidationError).issues[0];
    expect(issue.path).toBe('steps[0].form.fields[0].props.label');
    expect(issue.expectedKeys).toEqual(['label', 'placeholder']);
    expect(issue.severity).toBe('error');
  });

  it('accumulates every step in ONE throw, so a correction pass fixes the whole document', () => {
    // Props issues ride the flow's own validation pass rather than the per-step
    // compile, which throws at the first bad step. A self-correction loop that
    // gets one step per round trip is a loop that runs N times for N defects.
    const twoBadSteps = {
      version: 1,
      id: 'signup',
      name: 'Signup',
      steps: [
        { id: 'account', title: 'Account', form: BAD_FORM },
        {
          id: 'profile',
          title: 'Profile',
          form: {
            version: 1,
            id: 'profile',
            fields: [{ id: 'name', type: 'text', props: { label: false } }],
          },
        },
      ],
    } as unknown as FlowSchema;

    let thrown: unknown;
    try {
      compileFlow(twoBadSteps, catalog, { validateProps: true });
    } catch (error) {
      thrown = error;
    }

    const paths = (thrown as SchemaValidationError).issues.map((issue) => issue.path);
    expect(paths).toEqual([
      'steps[0].form.fields[0].props.label',
      'steps[1].form.fields[0].props.label',
    ]);
  });

  it('reports a structural defect and a props defect together', () => {
    // The props pass joins the existing validation rather than replacing it.
    const mixed = {
      version: 1,
      id: 'signup',
      name: 'Signup',
      steps: [{ id: 'account', title: '', form: BAD_FORM }],
    } as unknown as FlowSchema;

    let thrown: unknown;
    try {
      compileFlow(mixed, catalog, { validateProps: true });
    } catch (error) {
      thrown = error;
    }

    const paths = (thrown as SchemaValidationError).issues.map((issue) => issue.path);
    expect(paths).toContain('steps[0].title');
    expect(paths).toContain('steps[0].form.fields[0].props.label');
  });

  it('stays opt-in: bad props compile clean without the option', () => {
    // Parity with `compileForm`, whose default is not to validate props.
    expect(() => compileFlow(BAD_FLOW, catalog)).not.toThrow();
  });

  it('accepts a valid flow with the option on', () => {
    const good = {
      version: 1,
      id: 'signup',
      name: 'Signup',
      steps: [
        {
          id: 'account',
          title: 'Account',
          form: {
            version: 1,
            id: 'account',
            fields: [{ id: 'email', type: 'text', props: { label: 'Email' } }],
          },
        },
      ],
    } as unknown as FlowSchema;

    expect(() => compileFlow(good, catalog, { validateProps: true })).not.toThrow();
  });
});
