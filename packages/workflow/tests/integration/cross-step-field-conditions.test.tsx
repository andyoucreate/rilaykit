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
