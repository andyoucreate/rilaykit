import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowBody, WorkflowNextButton, WorkflowProvider, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

describe('Workflow - onAfterValidation Navigation Bug', () => {
  // Mock components
  const MockRadio = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <span>{props.label}</span>
      <div>
        {props.options.map((option: any) => (
          <label key={option.value}>
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange?.(e.target.value)}
              data-testid={`radio-${id}-${option.value}`}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );

  const MockInput = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  // Component to show current step and navigation state
  const NavigationDebugger = () => {
    const {
      currentStep,
      workflowState,
      canGoNext,
      canGoPrevious,
      conditionsHelpers,
      workflowConfig,
    } = useWorkflowContext();

    // Debug step visibility for testing
    const stepVisibilities = workflowConfig.steps.map((step, index) => ({
      id: step.id,
      index,
      visible: conditionsHelpers.isStepVisible(index),
    }));

    return (
      <div data-testid="navigation-debugger">
        <div data-testid="current-step-id">{currentStep?.id || 'none'}</div>
        <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
        <div data-testid="can-go-next">{canGoNext() ? 'true' : 'false'}</div>
        <div data-testid="can-go-previous">{canGoPrevious() ? 'true' : 'false'}</div>
        {stepVisibilities.map((step) => (
          <div key={step.id} data-testid={`step-${step.id}-visibility-debug`}>
            {step.visible ? 'visible' : 'hidden'}
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
      .addComponent('radio', {
        name: 'Radio Input',
        renderer: MockRadio,
      })
      .addComponent('input', {
        name: 'Text Input',
        renderer: MockInput,
      })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        nextButtonRenderer: ({ onClick }: any) => (
          // biome-ignore lint/a11y/useButtonType: test component
          <button onClick={onClick} data-testid="next-button">
            Next
          </button>
        ),
      });

    // Reproduit exactement la structure problématique du QuotePricingFlow
    workflowConfig = flow
      .create(config, 'quote-flow', 'Quote Flow')
      .addStep({
        id: 'products',
        title: 'Products',
        formConfig: form.create(config).add({
          id: 'requestedProducts',
          type: 'radio', // Simplifié pour le test
          props: {
            label: 'Products',
            options: [
              { label: 'Health', value: 'health' },
              { label: 'Provident', value: 'provident' },
            ],
          },
        }),
      })
      .addStep({
        id: 'legalForm',
        title: 'Legal Form',
        conditions: {
          visible: when('products.requestedProducts').contains('provident'),
        },
        formConfig: form.create(config).add({
          id: 'legalForm',
          type: 'radio',
          props: {
            label: 'Legal Form',
            options: [
              { label: 'SARL', value: 'limited_liability_company' },
              { label: 'SAS', value: 'simplified_joint_stock_company' },
              { label: 'EURL', value: 'single_member_limited_liability_company' },
            ],
          },
        }),
        onAfterValidation: (values, helper) => {
          const legalForm = values.legalForm;

          if (legalForm === 'simplified_joint_stock_company') {
            helper.setStepData('clientRole', {
              clientRole: 'company_president',
            });
          }
        },
      })
      .addStep({
        id: 'clientRole',
        title: 'Client Role',
        conditions: {
          visible: when('products.requestedProducts')
            .contains('provident')
            .and(
              when('legalForm.legalForm').notIn([
                'individual_business',
                'micro_business',
                'simplified_joint_stock_company', // ← SAS fait que ce step devient caché !
              ])
            ),
        },
        formConfig: form.create(config).add({
          id: 'clientRole',
          type: 'radio',
          props: {
            label: 'Client Role',
            options: [
              { label: 'Manager', value: 'manager' },
              { label: 'Employee', value: 'employee' },
            ],
          },
        }),
      })
      .addStep({
        id: 'final',
        title: 'Final Step',
        formConfig: form.create(config).add({
          id: 'finalField',
          type: 'input',
          props: { label: 'Final Field' },
        }),
      })
      .build();
  });

  it('should reproduce the navigation bug when onAfterValidation changes conditions', async () => {
    const defaultValues = {
      products: {
        requestedProducts: 'provident', // Rend legalForm visible
      },
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <NavigationDebugger />
        <WorkflowBody />
        <WorkflowNextButton />
      </WorkflowProvider>
    );

    // Vérifier qu'on commence bien au step 0 (products)
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('products');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('0');
    });

    // Aller au step legalForm
    const nextButton = screen.getByTestId('next-button');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('legalForm');
      expect(screen.getByTestId('current-step-index')).toHaveTextContent('1');
    });

    // Sélectionner SAS (simplified_joint_stock_company)
    const sasOption = screen.getByTestId('radio-legalForm-simplified_joint_stock_company');
    fireEvent.click(sasOption);

    // Cliquer sur suivant - CECI DEVRAIT CAUSER LE BUG
    fireEvent.click(nextButton);

    await waitFor(
      () => {
        const currentStepId = screen.getByTestId('current-step-id').textContent;
        const currentStepIndex = screen.getByTestId('current-step-index').textContent;

        // BUG : On s'attend à aller au step 'final' (index 3) car 'clientRole' est caché
        // Mais il se peut qu'on retourne à l'index 0 à cause du bug

        // Le comportement correct devrait être d'aller au step 'final'
        // car 'clientRole' est maintenant caché par la condition
        expect(currentStepId).toBe('final');
        expect(currentStepIndex).toBe('3');
      },
      { timeout: 3000 }
    );
  });

  it('should handle navigation correctly when onAfterValidation does not affect conditions', async () => {
    const defaultValues = {
      products: {
        requestedProducts: 'provident',
      },
    };

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultValues={defaultValues}>
        <NavigationDebugger />
        <WorkflowBody />
        <WorkflowNextButton />
      </WorkflowProvider>
    );

    // Aller au step legalForm
    const nextButton = screen.getByTestId('next-button');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('legalForm');
    });

    // Sélectionner SARL (limited_liability_company) - ne cache PAS clientRole
    const sarlOption = screen.getByTestId('radio-legalForm-limited_liability_company');
    fireEvent.click(sarlOption);

    // Cliquer sur suivant
    fireEvent.click(nextButton);

    await waitFor(() => {
      const currentStepId = screen.getByTestId('current-step-id').textContent;
      const currentStepIndex = screen.getByTestId('current-step-index').textContent;

      // Avec SARL, clientRole devrait être visible, donc on devrait y aller
      expect(currentStepId).toBe('clientRole');
      expect(currentStepIndex).toBe('2');
    });
  });
});
