import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkflowProvider, useFlow } from '../../src';
import { flow } from '../../src/builders/flow';
import { MockInput, MockSelect } from '../_helpers/mock-components';

/**
 * Integration test to reproduce the bug where conditions fail
 * when a step ID and its field ID have identical names
 *
 * User report: "Quand je fais des conditions sur un nom d'étape qui a le même nom
 * qu'une de ses variables dans son formulaire, les conditions ne marche pas."
 */
describe('Identical Step and Field Names - Bug Reproduction', () => {
  // Test component to check step visibility
  const StepVisibilityChecker = () => {
    const { workflowConfig, conditionsHelpers } = useFlow();

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

  let rilConfig: ril;

  beforeEach(() => {
    vi.clearAllMocks();

    rilConfig = ril
      .create()
      .component('products', {
        name: 'Products Selector',
        renderer: MockSelect,
        defaultProps: {},
      })
      .component('text', {
        name: 'Text Input',
        renderer: MockInput,
        defaultProps: {},
      });
  });

  test('should evaluate conditions correctly when step and field have identical names', async () => {
    // This reproduces the exact scenario from QuotePricingFlow
    const workflowConfig = flow
      .create(rilConfig, 'quote-flow', 'Quote Flow')
      // Step 1: products step with requestedProducts field
      .addStep({
        id: 'products',
        title: 'Select Products',
        formConfig: form.create(rilConfig).add({
          id: 'requestedProducts',
          type: 'products',
          props: {
            multiple: true,
            options: [
              { label: 'Health', value: 'health' },
              { label: 'Provident', value: 'provident' },
            ],
          },
        }),
      })
      // Step 2: coveredPersons step with coveredPersons field (IDENTICAL NAMES)
      .addStep({
        id: 'coveredPersons',
        title: 'Covered Persons',
        formConfig: form.create(rilConfig).add({
          id: 'coveredPersons',
          type: 'products',
          props: {
            multiple: true,
            options: [
              { label: 'Spouse', value: 'spouse' },
              { label: 'Children', value: 'children' },
            ],
          },
        }),
        conditions: {
          visible: when('products.requestedProducts').contains('health'),
        },
      })
      // Step 3: Another step that depends on coveredPersons.coveredPersons
      .addStep({
        id: 'childrenInfo',
        title: 'Children Information',
        formConfig: form.create(rilConfig).add({
          id: 'info',
          type: 'text',
          props: {
            label: 'Additional info',
          },
        }),
        conditions: {
          // THIS IS THE PROBLEMATIC CONDITION: stepName.fieldName where both have same name
          visible: when('coveredPersons.coveredPersons').contains('children'),
        },
      })
      .build();

    // Render with defaultValues that include the problematic identical naming
    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{
          products: {
            requestedProducts: ['health'],
          },
          coveredPersons: {
            coveredPersons: ['children', 'spouse'],
          },
        }}
      >
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByTestId('step-visibility-checker')).toBeInTheDocument();
    });

    // Step 1 (products) should be visible
    expect(screen.getByTestId('step-products-visible')).toHaveTextContent('true');

    // Step 2 (coveredPersons) should be visible because products includes 'health'
    expect(screen.getByTestId('step-coveredPersons-visible')).toHaveTextContent('true');

    // The critical test: Step 3 (childrenInfo) should be visible
    // because coveredPersons.coveredPersons contains 'children'
    expect(screen.getByTestId('step-childrenInfo-visible')).toHaveTextContent('true');
  });

  test('should handle multiple identical names (siren.siren, legalForm.legalForm)', async () => {
    const workflowConfig = flow
      .create(rilConfig, 'test-flow', 'Test Flow')
      .addStep({
        id: 'siren',
        title: 'SIREN',
        formConfig: form.create(rilConfig).add({
          id: 'siren',
          type: 'text',
          props: {},
        }),
      })
      .addStep({
        id: 'legalForm',
        title: 'Legal Form',
        formConfig: form.create(rilConfig).add({
          id: 'legalForm',
          type: 'text',
          props: {},
        }),
        conditions: {
          visible: when('siren.siren').exists(),
        },
      })
      .addStep({
        id: 'result',
        title: 'Result',
        formConfig: form.create(rilConfig).add({
          id: 'data',
          type: 'text',
          props: {},
        }),
        conditions: {
          visible: when('legalForm.legalForm').equals('sarl'),
        },
      })
      .build();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{
          siren: {
            siren: '123456789',
          },
          legalForm: {
            legalForm: 'sarl',
          },
        }}
      >
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('step-visibility-checker')).toBeInTheDocument();
    });

    // All steps should be visible with the provided data
    expect(screen.getByTestId('step-siren-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('step-legalForm-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('step-result-visible')).toHaveTextContent('true');
  });

  test('should differentiate between persons.coveredPersons and coveredPersons.coveredPersons', async () => {
    // This test ensures we can distinguish between different step/field combinations
    const workflowConfig = flow
      .create(rilConfig, 'differentiation-test', 'Test')
      .addStep({
        id: 'persons',
        title: 'Persons',
        formConfig: form.create(rilConfig).add({
          id: 'coveredPersons',
          type: 'products',
          props: {
            multiple: true,
            options: [{ label: 'Option 1', value: 'option1' }],
          },
        }),
      })
      .addStep({
        id: 'coveredPersons',
        title: 'Covered Persons Details',
        formConfig: form.create(rilConfig).add({
          id: 'coveredPersons',
          type: 'products',
          props: {
            multiple: true,
            options: [{ label: 'Option 2', value: 'option2' }],
          },
        }),
        conditions: {
          // Should check persons.coveredPersons, NOT coveredPersons.coveredPersons
          visible: when('persons.coveredPersons').contains('option1'),
        },
      })
      .addStep({
        id: 'final',
        title: 'Final',
        formConfig: form.create(rilConfig).add({
          id: 'data',
          type: 'text',
          props: {},
        }),
        conditions: {
          // Should check coveredPersons.coveredPersons from step 2
          visible: when('coveredPersons.coveredPersons').contains('option2'),
        },
      })
      .build();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{
          persons: {
            coveredPersons: ['option1'],
          },
          coveredPersons: {
            coveredPersons: ['option2'],
          },
        }}
      >
        <StepVisibilityChecker />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('step-visibility-checker')).toBeInTheDocument();
    });

    // All steps should be visible with proper data
    expect(screen.getByTestId('step-persons-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('step-coveredPersons-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('step-final-visible')).toHaveTextContent('true');
  });
});
