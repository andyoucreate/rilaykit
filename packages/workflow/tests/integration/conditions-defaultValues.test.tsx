import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('Workflow - Conditions with DefaultValues', () => {
  // Mock components
  const MockSelect = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label>{props.label}</label>
      <select
        value={Array.isArray(value) ? value[0] || '' : value || ''}
        onChange={(e) => onChange?.(props.multiple ? [e.target.value] : e.target.value)}
        data-testid={`select-${id}`}
        multiple={props.multiple}
      >
        {props.options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const MockInput = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label>{props.label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  // Test component to check step visibility
  const StepVisibilityChecker = () => {
    const { workflowConfig, conditionsHelpers } = useWorkflowContext();

    return (
      <div data-testid="step-visibility-checker">
        {workflowConfig.steps.map((step, index) => (
          <div key={step.id} data-testid={`step-${step.id}-visible`}>
            {conditionsHelpers.isStepVisible(index) ? 'true' : 'false'}
          </div>
        ))}
      </div>
    );
  };

  let config: ril<Record<string, any>>;
  let workflowConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('select', {
        name: 'Select Input',
        renderer: MockSelect,
      })
      .addComponent('input', {
        name: 'Text Input',
        renderer: MockInput,
      })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      });

    // Create workflow similar to QuotePricingFlow
    workflowConfig = flow
      .create(config, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'products',
        title: 'Select Products',
        formConfig: form.create(config).add({
          id: 'requestedProducts',
          type: 'select',
          props: {
            label: 'Products',
            multiple: true,
            options: [
              { label: 'Health', value: 'health' },
              { label: 'Provident', value: 'provident' },
            ],
          },
        }),
      })
      .addStep({
        id: 'company',
        title: 'Company Info',
        conditions: {
          visible: when('products.requestedProducts').contains('provident'),
        },
        formConfig: form.create(config).add({
          id: 'companyName',
          type: 'input',
          props: { label: 'Company Name' },
        }),
      })
      .addStep({
        id: 'legal',
        title: 'Legal Form',
        conditions: {
          visible: when('products.requestedProducts').contains('provident'),
        },
        formConfig: form.create(config).add({
          id: 'legalForm',
          type: 'select',
          props: {
            label: 'Legal Form',
            options: [
              { label: 'SARL', value: 'sarl' },
              { label: 'SAS', value: 'sas' },
            ],
          },
        }),
      })
      .build();
  });

  it('should show conditional steps when defaultValues trigger conditions', async () => {
    const defaultValues = {
      products: {
        requestedProducts: ['provident'], // This should make steps 2 and 3 visible
      },
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Step 0 (products) should always be visible
      expect(screen.getByTestId('step-products-visible')).toHaveTextContent('true');

      // Steps 1 and 2 should be visible because defaultValues contains 'provident'
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('step-legal-visible')).toHaveTextContent('true');
    });
  });

  it('should hide conditional steps when defaultValues do not trigger conditions', async () => {
    const defaultValues = {
      products: {
        requestedProducts: ['health'], // Only health, not provident
      },
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Step 0 should be visible
      expect(screen.getByTestId('step-products-visible')).toHaveTextContent('true');

      // Steps 1 and 2 should be hidden because condition is not met
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('false');
      expect(screen.getByTestId('step-legal-visible')).toHaveTextContent('false');
    });
  });

  it('should handle empty defaultValues correctly', async () => {
    const defaultValues = {};

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // Step 0 should be visible
      expect(screen.getByTestId('step-products-visible')).toHaveTextContent('true');

      // Steps 1 and 2 should be hidden because no data matches the condition
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('false');
      expect(screen.getByTestId('step-legal-visible')).toHaveTextContent('false');
    });
  });

  it('should work with complex nested defaultValues (real-world scenario)', async () => {
    // This reproduces the exact structure from QuotePricingFlow
    const defaultValues = {
      products: {
        requestedProducts: ['provident'],
      },
      company: {
        companyName: 'Test Company',
        siren: '123456789',
      },
      legal: {
        legalForm: 'sarl',
      },
      // Additional nested data
      user: {
        profile: {
          email: 'test@example.com',
        },
      },
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      // All steps should be visible because 'provident' is in the defaultValues
      expect(screen.getByTestId('step-products-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('step-legal-visible')).toHaveTextContent('true');
    });
  });

  it('should handle multiple conditions correctly', async () => {
    // Create a workflow with multiple condition types
    const complexWorkflow = flow
      .create(config, 'complex-workflow', 'Complex Workflow')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: form.create(config).add({
          id: 'field1',
          type: 'select',
          props: {
            label: 'Field 1',
            options: [
              { label: 'Option A', value: 'a' },
              { label: 'Option B', value: 'b' },
            ],
          },
        }),
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        conditions: {
          visible: when('step1.field1').equals('a'),
        },
        formConfig: form.create(config).add({
          id: 'field2',
          type: 'input',
          props: { label: 'Field 2' },
        }),
      })
      .addStep({
        id: 'step3',
        title: 'Step 3',
        conditions: {
          visible: when('step1.field1').equals('b'),
        },
        formConfig: form.create(config).add({
          id: 'field3',
          type: 'input',
          props: { label: 'Field 3' },
        }),
      })
      .build();

    const defaultValues = {
      step1: {
        field1: 'a', // This should show step2 but hide step3
      },
    };

    const ComplexStepChecker = () => {
      const { workflowConfig, conditionsHelpers } = useWorkflowContext();

      return (
        <div data-testid="complex-step-checker">
          {workflowConfig.steps.map((step, index) => (
            <div key={step.id} data-testid={`complex-step-${step.id}-visible`}>
              {conditionsHelpers.isStepVisible(index) ? 'true' : 'false'}
            </div>
          ))}
        </div>
      );
    };

    render(
      <WorkflowProvider workflowConfig={complexWorkflow} defaultValues={defaultValues}>
        <ComplexStepChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('complex-step-step1-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('complex-step-step2-visible')).toHaveTextContent('true'); // field1 = 'a'
      expect(screen.getByTestId('complex-step-step3-visible')).toHaveTextContent('false'); // field1 != 'b'
    });
  });
});
