import { ril, when } from '@rilaykit/core';
import { form, useFormConfigContext, useFormStoreApi } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowProvider, useWorkflowContext } from '../../src';
import { flow } from '../../src/builders/flow';

/**
 * Integration test reproducing the conditional steps navigation bug:
 * When navigating through conditional steps (triggered by a field in step 1),
 * the conditional steps disappear after filling in the first conditional step
 * because stepData no longer contains the triggering field value.
 */
describe('Conditional steps - navigation bug', () => {
  const MockSelect = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`select-${id}`}
      >
        <option value="">Select...</option>
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

  const MockCheckbox = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="checkbox"
        checked={value || false}
        onChange={(e) => onChange?.(e.target.checked)}
        data-testid={`checkbox-${id}`}
      />
    </div>
  );

  let config: any;
  let conditionalFlow: any;

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
      .addComponent('checkbox', {
        name: 'Checkbox',
        renderer: MockCheckbox,
      })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      });

    // Reproduce the playground conditional-steps example
    const accountTypeForm = form
      .create(config)
      .add({
        id: 'accountType',
        type: 'select',
        props: {
          label: 'Account Type',
          options: [
            { label: 'Personal', value: 'personal' },
            { label: 'Business', value: 'business' },
            { label: 'Enterprise', value: 'enterprise' },
          ],
        },
      })
      .add({ id: 'fullName', type: 'input', props: { label: 'Full Name' } })
      .build();

    const companyDetailsForm = form
      .create(config)
      .add({ id: 'companyName', type: 'input', props: { label: 'Company Name' } })
      .add({
        id: 'companySize',
        type: 'select',
        props: {
          label: 'Company Size',
          options: [
            { label: '1-10', value: '1-10' },
            { label: '11-50', value: '11-50' },
          ],
        },
      })
      .build();

    const enterpriseForm = form
      .create(config)
      .add({ id: 'contractId', type: 'input', props: { label: 'Contract ID' } })
      .build();

    const confirmationForm = form
      .create(config)
      .add({ id: 'agreeTerms', type: 'checkbox', props: { label: 'I agree' } })
      .build();

    conditionalFlow = flow
      .create(config, 'conditional', 'Account Setup')
      .addStep({
        id: 'type',
        title: 'Account Type',
        formConfig: accountTypeForm,
      })
      .addStep({
        id: 'company',
        title: 'Company Details',
        formConfig: companyDetailsForm,
        conditions: {
          visible: when('accountType').in(['business', 'enterprise']).build(),
        },
      })
      .addStep({
        id: 'enterprise',
        title: 'Enterprise Setup',
        formConfig: enterpriseForm,
        conditions: {
          visible: when('accountType').equals('enterprise').build(),
        },
      })
      .addStep({
        id: 'confirm',
        title: 'Confirmation',
        formConfig: confirmationForm,
      })
      .build();
  });

  // Test helper component
  function WorkflowTestHarness() {
    const {
      workflowState,
      workflowConfig,
      conditionsHelpers,
      goNext,
      setValue,
      currentStep,
    } = useWorkflowContext();

    return (
      <div>
        <div data-testid="current-step-index">{workflowState.currentStepIndex}</div>
        <div data-testid="current-step-id">{currentStep?.id}</div>
        <div data-testid="all-data">{JSON.stringify(workflowState.allData)}</div>
        <div data-testid="step-data">{JSON.stringify(workflowState.stepData)}</div>

        {workflowConfig.steps.map((step, index) => (
          <div key={step.id} data-testid={`step-${step.id}-visible`}>
            {conditionsHelpers.isStepVisible(index) ? 'true' : 'false'}
          </div>
        ))}

        <button
          type="button"
          data-testid="go-next"
          onClick={() => goNext()}
        >
          Next
        </button>

        <button
          type="button"
          data-testid="set-enterprise"
          onClick={() => setValue('accountType', 'enterprise')}
        >
          Set Enterprise
        </button>

        <button
          type="button"
          data-testid="set-business"
          onClick={() => setValue('accountType', 'business')}
        >
          Set Business
        </button>

        <button
          type="button"
          data-testid="set-company-name"
          onClick={() => setValue('companyName', 'Tech Innovation SAS')}
        >
          Set Company Name
        </button>

        <button
          type="button"
          data-testid="set-company-size"
          onClick={() => setValue('companySize', '11-50')}
        >
          Set Company Size
        </button>

        <button
          type="button"
          data-testid="set-contract-id"
          onClick={() => setValue('contractId', 'ENT-001')}
        >
          Set Contract ID
        </button>

        <button
          type="button"
          data-testid="set-agree-terms"
          onClick={() => setValue('agreeTerms', true)}
        >
          Agree Terms
        </button>
      </div>
    );
  }

  it('should keep conditional steps visible after navigating away from the triggering step', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <WorkflowTestHarness />
      </WorkflowProvider>
    );

    // Step 0: Set accountType = enterprise
    fireEvent.click(screen.getByTestId('set-enterprise'));

    await waitFor(() => {
      // Both conditional steps should be visible
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('step-enterprise-visible')).toHaveTextContent('true');
    });

    // Navigate to step 1 (Company Details)
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Fill in company details
    fireEvent.click(screen.getByTestId('set-company-name'));
    fireEvent.click(screen.getByTestId('set-company-size'));

    // Navigate to step 2 (Enterprise Setup)
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      // BUG: This is where the conditional steps disappear!
      // The enterprise step should still be visible
      expect(screen.getByTestId('step-enterprise-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });
  });

  it('should keep business conditional step visible after filling company details', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <WorkflowTestHarness />
      </WorkflowProvider>
    );

    // Step 0: Set accountType = business
    fireEvent.click(screen.getByTestId('set-business'));

    await waitFor(() => {
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('step-enterprise-visible')).toHaveTextContent('false');
    });

    // Navigate to Company Details
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Fill in company details
    fireEvent.click(screen.getByTestId('set-company-name'));

    // The company step should STILL be visible
    await waitFor(() => {
      expect(screen.getByTestId('step-company-visible')).toHaveTextContent('true');
    });

    // Navigate to confirmation (next visible step after company, since enterprise is hidden)
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
    });
  });

  it('should not contaminate step data when navigating between steps', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <WorkflowTestHarness />
      </WorkflowProvider>
    );

    // Step 0: Set accountType = enterprise
    fireEvent.click(screen.getByTestId('set-enterprise'));

    // Navigate to Company Details
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Fill in company details
    fireEvent.click(screen.getByTestId('set-company-name'));
    fireEvent.click(screen.getByTestId('set-company-size'));

    // Navigate to Enterprise Setup
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });

    // Fill enterprise data
    fireEvent.click(screen.getByTestId('set-contract-id'));

    // Navigate to confirmation
    fireEvent.click(screen.getByTestId('go-next'));

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
    });

    // Set agree terms
    fireEvent.click(screen.getByTestId('set-agree-terms'));

    // Verify allData: confirm step should only have its own field
    await waitFor(() => {
      const allData = JSON.parse(screen.getByTestId('all-data').textContent || '{}');

      // type step data
      expect(allData.type?.accountType).toBe('enterprise');

      // company step data should only have company fields
      expect(allData.company?.companyName).toBe('Tech Innovation SAS');
      expect(allData.company?.companySize).toBe('11-50');
      expect(allData.company?.accountType).toBeUndefined();

      // enterprise step data should only have enterprise fields
      expect(allData.enterprise?.contractId).toBe('ENT-001');
      expect(allData.enterprise?.companyName).toBeUndefined();

      // confirm step data should only have confirm fields
      expect(allData.confirm?.agreeTerms).toBe(true);
      expect(allData.confirm?.companyName).toBeUndefined();
      expect(allData.confirm?.contractId).toBeUndefined();
    });
  });
});

/**
 * Tests using the REAL form submission flow (submit() → handleSubmit → setStepDataAction → goNext).
 * This reproduces the exact behavior of WorkflowNextButton in the playground.
 * The tests above use goNext() directly which bypasses setStepDataAction.
 */
describe('Conditional steps - form submission flow (real WorkflowNextButton path)', () => {
  const MockSelect = ({ id, value, onChange, props }: any) => (
    <div data-testid={`field-${id}`}>
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`select-${id}`}
      >
        <option value="">Select...</option>
        {props.options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const MockInput = ({ id, value, onChange }: any) => (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  const MockCheckbox = ({ id, value, onChange }: any) => (
    <div data-testid={`field-${id}`}>
      <input
        id={id}
        type="checkbox"
        checked={value || false}
        onChange={(e) => onChange?.(e.target.checked)}
        data-testid={`checkbox-${id}`}
      />
    </div>
  );

  let config: any;
  let conditionalFlow: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('select', { name: 'Select', renderer: MockSelect })
      .addComponent('input', { name: 'Input', renderer: MockInput })
      .addComponent('checkbox', { name: 'Checkbox', renderer: MockCheckbox })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      });

    conditionalFlow = flow
      .create(config, 'conditional-submit', 'Account Setup')
      .addStep({
        id: 'type',
        title: 'Account Type',
        formConfig: form
          .create(config)
          .add({
            id: 'accountType',
            type: 'select',
            props: {
              label: 'Account Type',
              options: [
                { label: 'Personal', value: 'personal' },
                { label: 'Business', value: 'business' },
                { label: 'Enterprise', value: 'enterprise' },
              ],
            },
          })
          .add({ id: 'fullName', type: 'input', props: { label: 'Full Name' } })
          .build(),
      })
      .addStep({
        id: 'company',
        title: 'Company Details',
        formConfig: form
          .create(config)
          .add({ id: 'companyName', type: 'input', props: { label: 'Company Name' } })
          .add({
            id: 'companySize',
            type: 'select',
            props: {
              label: 'Company Size',
              options: [
                { label: '1-10', value: '1-10' },
                { label: '11-50', value: '11-50' },
              ],
            },
          })
          .build(),
        conditions: {
          visible: when('accountType').in(['business', 'enterprise']).build(),
        },
      })
      .addStep({
        id: 'enterprise',
        title: 'Enterprise Setup',
        formConfig: form
          .create(config)
          .add({ id: 'contractId', type: 'input', props: { label: 'Contract ID' } })
          .build(),
        conditions: {
          visible: when('accountType').equals('enterprise').build(),
        },
      })
      .addStep({
        id: 'confirm',
        title: 'Confirmation',
        formConfig: form
          .create(config)
          .add({ id: 'agreeTerms', type: 'checkbox', props: { label: 'I agree' } })
          .build(),
      })
      .build();
  });

  /**
   * Test harness that uses submit() from FormProvider (like WorkflowNextButton does),
   * NOT goNext() directly. This tests the real submission flow:
   * submit() → form validation → handleSubmit(values) → setStepDataAction → goNext
   *
   * Uses useFormStoreApi to update the form store (like a real form component would),
   * which triggers onFieldChange → workflow store update. Both stores stay in sync.
   */
  function FormSubmitTestHarness() {
    const {
      workflowState,
      workflowConfig,
      conditionsHelpers,
      currentStep,
    } = useWorkflowContext();

    // Access submit from FormProvider — same as WorkflowNextButton
    const { submit } = useFormConfigContext();

    // Access form store to set values like a real form component would
    const formStore = useFormStoreApi();

    // Set value in the form store (like a form field onChange would do).
    // The FormProvider's onFieldChange subscription then syncs to the workflow store.
    const setFormValue = useCallback(
      (fieldId: string, value: unknown) => {
        formStore.getState()._setValue(fieldId, value);
      },
      [formStore]
    );

    return (
      <div>
        <div data-testid="fs-current-step-id">{currentStep?.id}</div>
        <div data-testid="fs-current-step-index">{workflowState.currentStepIndex}</div>
        <div data-testid="fs-all-data">{JSON.stringify(workflowState.allData)}</div>
        <div data-testid="fs-step-data">{JSON.stringify(workflowState.stepData)}</div>

        {workflowConfig.steps.map((step, index) => (
          <div key={step.id} data-testid={`fs-step-${step.id}-visible`}>
            {conditionsHelpers.isStepVisible(index) ? 'true' : 'false'}
          </div>
        ))}

        {/* Submit button — triggers full form submission flow like WorkflowNextButton */}
        <button type="button" data-testid="fs-submit" onClick={() => submit()}>Submit (Next)</button>

        {/* Value setters: update form store directly (like real form components do) */}
        <button type="button" data-testid="fs-set-enterprise" onClick={() => setFormValue('accountType', 'enterprise')}>Set Enterprise</button>
        <button type="button" data-testid="fs-set-business" onClick={() => setFormValue('accountType', 'business')}>Set Business</button>
        <button type="button" data-testid="fs-set-fullname" onClick={() => setFormValue('fullName', 'Karl MAZIER')}>Set Full Name</button>
        <button type="button" data-testid="fs-set-company-name" onClick={() => setFormValue('companyName', 'Tech Innovation SAS')}>Set Company Name</button>
        <button type="button" data-testid="fs-set-company-size" onClick={() => setFormValue('companySize', '11-50')}>Set Company Size</button>
        <button type="button" data-testid="fs-set-contract-id" onClick={() => setFormValue('contractId', 'ENT-001')}>Set Contract ID</button>
        <button type="button" data-testid="fs-set-agree-terms" onClick={() => setFormValue('agreeTerms', true)}>Agree Terms</button>
      </div>
    );
  }

  it('should keep enterprise steps visible through form submission flow (enterprise full path)', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <FormSubmitTestHarness />
      </WorkflowProvider>
    );

    // Step 0 (type): Select enterprise
    fireEvent.click(screen.getByTestId('fs-set-enterprise'));
    fireEvent.click(screen.getByTestId('fs-set-fullname'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('true');
    });

    // Submit form (like WorkflowNextButton) — goes through handleSubmit → setStepDataAction → goNext
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('company');
    });

    // Verify conditional steps are STILL visible after form submission navigation
    expect(screen.getByTestId('fs-step-company-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('true');

    // Step 1 (company): Fill company details
    fireEvent.click(screen.getByTestId('fs-set-company-name'));
    fireEvent.click(screen.getByTestId('fs-set-company-size'));

    // Verify steps STILL visible after filling company fields
    await waitFor(() => {
      expect(screen.getByTestId('fs-step-company-visible')).toHaveTextContent('true');
      expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('true');
    });

    // Submit form from company step — THIS IS THE CRITICAL TEST
    // In the real app, this calls: submit() → handleSubmit({ companyName, companySize }) → setStepDataAction → goNext
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      // Should navigate to enterprise step, NOT skip to confirmation
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('enterprise');
    });

    // Verify enterprise step is STILL visible (conditions still evaluate correctly)
    expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('fs-step-company-visible')).toHaveTextContent('true');

    // Verify allData integrity
    const allData = JSON.parse(screen.getByTestId('fs-all-data').textContent || '{}');
    expect(allData.type?.accountType).toBe('enterprise');
    expect(allData.company?.companyName).toBe('Tech Innovation SAS');
    expect(allData.company?.accountType).toBeUndefined();
  });

  it('should complete full enterprise flow via form submission without losing conditions', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <FormSubmitTestHarness />
      </WorkflowProvider>
    );

    // Step 0: Set enterprise + full name → submit
    fireEvent.click(screen.getByTestId('fs-set-enterprise'));
    fireEvent.click(screen.getByTestId('fs-set-fullname'));
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('company');
    });

    // Step 1: Fill company → submit
    fireEvent.click(screen.getByTestId('fs-set-company-name'));
    fireEvent.click(screen.getByTestId('fs-set-company-size'));
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('enterprise');
    });

    // Step 2: Fill enterprise → submit
    fireEvent.click(screen.getByTestId('fs-set-contract-id'));
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('confirm');
    });

    // Verify all steps are still visible at the end
    expect(screen.getByTestId('fs-step-type-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('fs-step-company-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('true');
    expect(screen.getByTestId('fs-step-confirm-visible')).toHaveTextContent('true');

    // Verify no data contamination
    const allData = JSON.parse(screen.getByTestId('fs-all-data').textContent || '{}');
    expect(allData.type?.accountType).toBe('enterprise');
    expect(allData.type?.fullName).toBe('Karl MAZIER');
    expect(allData.company?.companyName).toBe('Tech Innovation SAS');
    expect(allData.company?.companySize).toBe('11-50');
    expect(allData.company?.accountType).toBeUndefined();
    expect(allData.enterprise?.contractId).toBe('ENT-001');
    expect(allData.enterprise?.companyName).toBeUndefined();
  });

  it('should handle business flow via form submission (enterprise step stays hidden)', async () => {
    render(
      <WorkflowProvider workflowConfig={conditionalFlow}>
        <FormSubmitTestHarness />
      </WorkflowProvider>
    );

    // Step 0: Set business → submit
    fireEvent.click(screen.getByTestId('fs-set-business'));
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('company');
      expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('false');
    });

    // Step 1: Fill company → submit → should go to confirm (skip enterprise)
    fireEvent.click(screen.getByTestId('fs-set-company-name'));
    fireEvent.click(screen.getByTestId('fs-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('fs-current-step-id')).toHaveTextContent('confirm');
    });

    // Enterprise should still be hidden
    expect(screen.getByTestId('fs-step-enterprise-visible')).toHaveTextContent('false');
  });
});
