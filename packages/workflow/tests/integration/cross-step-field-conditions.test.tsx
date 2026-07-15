import { ril, when } from '@rilaykit/core';
import { form, useForm } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { FlowBody, WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { type FlowSchema, compileFlow } from '../../src/schema';

/**
 * The lilycare quote-flow core use case: a field on step B whose visibility (or
 * requiredness) depends on data captured on step A.
 *
 * FormProvider is handed ONLY the current step's values, so a condition that
 * references a step-A field has nothing to resolve against once step B renders.
 */

function makeCatalog() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: ({ id, field }) => (
      <input
        data-testid={id}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
      />
    ),
  });
}

const catalog = makeCatalog();

function Harness() {
  const { goNext, currentStep } = useFlow();
  return (
    <div>
      <output data-testid="step">{currentStep?.id}</output>
      <button type="button" data-testid="next" onClick={() => goNext()}>
        next
      </button>
      <FlowBody />
    </div>
  );
}

async function fillStepAAndAdvance(value: string) {
  fireEvent.change(screen.getByTestId('accountType'), { target: { value } });
  fireEvent.click(screen.getByTestId('next'));
  await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('details'));
}

describe('cross-step FIELD conditions', () => {
  describe('compiled FlowSchema', () => {
    const schema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Quote',
      steps: [
        {
          id: 'type',
          title: 'Type',
          form: {
            version: 1,
            id: 'type-form',
            fields: [{ id: 'accountType', type: 'text', props: {} }],
          },
        },
        {
          id: 'details',
          title: 'Details',
          form: {
            version: 1,
            id: 'details-form',
            fields: [
              {
                id: 'companyName',
                type: 'text',
                props: {},
                conditions: {
                  visible: { field: 'type.accountType', operator: 'equals', value: 'business' },
                },
              },
            ],
          },
        },
      ],
    };

    it('shows the step-B field when the step-A field satisfies the condition', async () => {
      const { workflowConfig } = compileFlow(schema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('business');
      expect(screen.queryByTestId('companyName')).not.toBeNull();
    });

    it('hides the step-B field when the step-A field does not satisfy the condition', async () => {
      const { workflowConfig } = compileFlow(schema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('personal');
      expect(screen.queryByTestId('companyName')).toBeNull();
    });
  });

  describe('compiled FlowSchema — required', () => {
    const requiredSchema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Quote',
      steps: [
        {
          id: 'type',
          title: 'Type',
          form: {
            version: 1,
            id: 'type-form',
            fields: [{ id: 'accountType', type: 'text', props: {} }],
          },
        },
        {
          id: 'details',
          title: 'Details',
          form: {
            version: 1,
            id: 'details-form',
            fields: [
              {
                id: 'companyName',
                type: 'text',
                props: {},
                conditions: {
                  required: { field: 'type.accountType', operator: 'equals', value: 'business' },
                },
              },
            ],
          },
        },
      ],
    };

    function RequiredProbe() {
      const { conditionsHelpers } = useForm();
      return (
        <output data-testid="required">
          {conditionsHelpers.isFieldRequired('companyName') ? 'yes' : 'no'}
        </output>
      );
    }

    it('marks the step-B field required when the step-A field satisfies the condition', async () => {
      const { workflowConfig } = compileFlow(requiredSchema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
          <RequiredProbe />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('business');
      await waitFor(() => expect(screen.getByTestId('required').textContent).toBe('yes'));
    });

    it('leaves the step-B field optional when the step-A field does not satisfy the condition', async () => {
      const { workflowConfig } = compileFlow(requiredSchema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
          <RequiredProbe />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('personal');
      expect(screen.getByTestId('required').textContent).toBe('no');
    });
  });

  /**
   * The other half of the contract: cross-step values are a FALLBACK for keys
   * the current form does not own, never a source for keys it does.
   *
   * Two steps legitimately reuse the id `accountType` (each step's form is its
   * own namespace, and each submits under its own step key). A step-B condition
   * on the bare name `accountType` must therefore resolve against step B's OWN
   * field — including when that field is untouched and so has no store entry
   * yet. Layering the flattened all-step data under the store's values makes an
   * untouched step-B field silently inherit step A's value.
   */
  describe('same id on two steps — the current step owns its name', () => {
    const shadowSchema: FlowSchema = {
      version: 1,
      id: 'wf',
      name: 'Quote',
      steps: [
        {
          id: 'type',
          title: 'Type',
          form: {
            version: 1,
            id: 'type-form',
            fields: [{ id: 'accountType', type: 'text', props: {} }],
          },
        },
        {
          id: 'details',
          title: 'Details',
          form: {
            version: 1,
            id: 'details-form',
            fields: [
              { id: 'accountType', type: 'text', props: {} },
              {
                id: 'companyName',
                type: 'text',
                props: {},
                conditions: {
                  visible: { field: 'accountType', operator: 'equals', value: 'business' },
                },
              },
            ],
          },
        },
      ],
    };

    it('does not resolve an UNTOUCHED current-step field to another step’s value of the same id', async () => {
      const { workflowConfig } = compileFlow(shadowSchema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
        </WorkflowProvider>
      );

      // Step A captured `accountType: business`; step B declares its OWN
      // `accountType` and leaves it untouched, so the condition must not fire.
      await fillStepAAndAdvance('business');
      expect((screen.getByTestId('accountType') as HTMLInputElement).value).toBe('');
      expect(screen.queryByTestId('companyName')).toBeNull();
    });

    it('resolves the condition against the current step’s own field once it is filled', async () => {
      const { workflowConfig } = compileFlow(shadowSchema, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
        </WorkflowProvider>
      );

      // Step A says `personal`, step B's own field says `business` — the local
      // field wins and the condition fires.
      await fillStepAAndAdvance('personal');
      fireEvent.change(screen.getByTestId('accountType'), { target: { value: 'business' } });
      await waitFor(() => expect(screen.queryByTestId('companyName')).not.toBeNull());

      // ...and stops firing when the local field moves away again, even though
      // step A's captured `business` is still in the flow's data.
      fireEvent.change(screen.getByTestId('accountType'), { target: { value: 'personal' } });
      await waitFor(() => expect(screen.queryByTestId('companyName')).toBeNull());
    });

    it('still resolves the QUALIFIED cross-step path for the same shadowed id', async () => {
      const qualified: FlowSchema = {
        ...shadowSchema,
        steps: [
          shadowSchema.steps[0],
          {
            ...shadowSchema.steps[1],
            form: {
              ...shadowSchema.steps[1].form,
              fields: [
                { id: 'accountType', type: 'text', props: {} },
                {
                  id: 'companyName',
                  type: 'text',
                  props: {},
                  conditions: {
                    visible: { field: 'type.accountType', operator: 'equals', value: 'business' },
                  },
                },
              ],
            },
          },
        ],
      };
      const { workflowConfig } = compileFlow(qualified, catalog);
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <Harness />
        </WorkflowProvider>
      );

      // Shadowing the bare name must not break the explicit `type.accountType`
      // reference — that is the whole point of the qualified path.
      await fillStepAAndAdvance('business');
      expect(screen.queryByTestId('companyName')).not.toBeNull();
    });
  });

  describe('hand-built flow', () => {
    function buildFlow() {
      return flow
        .create(catalog, 'wf', 'Quote')
        .addStep({
          id: 'type',
          title: 'Type',
          formConfig: form.create(catalog).add({ id: 'accountType', type: 'text', props: {} }),
        })
        .addStep({
          id: 'details',
          title: 'Details',
          formConfig: form.create(catalog).add({
            id: 'companyName',
            type: 'text',
            props: {},
            conditions: { visible: when('type.accountType').equals('business') },
          }),
        })
        .build();
    }

    it('shows the step-B field when the step-A field satisfies the condition', async () => {
      render(
        <WorkflowProvider workflowConfig={buildFlow()}>
          <Harness />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('business');
      expect(screen.queryByTestId('companyName')).not.toBeNull();
    });

    it('hides the step-B field when the step-A field does not satisfy the condition', async () => {
      render(
        <WorkflowProvider workflowConfig={buildFlow()}>
          <Harness />
        </WorkflowProvider>
      );

      await fillStepAAndAdvance('personal');
      expect(screen.queryByTestId('companyName')).toBeNull();
    });
  });
});
