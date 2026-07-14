import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import {
  FlowBody,
  WorkflowProvider,
  flow,
  useWorkflowContext,
} from '@rilaykit/workflow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockCheckboxInput, MockSelectInput, MockTextInput } from '../_setup/test-helpers';
import { NextButton, PrevButton } from '../_setup/nav-buttons';

// ============================================================================
// SETUP — Reproduces the playground conditional-steps example
// ============================================================================

let rilConfig: ReturnType<typeof createRilConfig>;

function createRilConfig() {
  return ril
    .create()
    .component('text', {
      name: 'Text',
      renderer: MockTextInput,
      defaultProps: { label: '' },
    })
    .component('select', {
      name: 'Select',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .component('checkbox', {
      name: 'Checkbox',
      renderer: MockCheckboxInput,
      defaultProps: { label: '' },
    })
    .configure({
      bodyRenderer: ({ children }) => <div>{children}</div>,
      rowRenderer: ({ children }) => <div>{children}</div>,
    });
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function WorkflowStateDisplay() {
  const { workflowState, currentStep, context } = useWorkflowContext();
  return (
    <div>
      <span data-testid="current-step">{workflowState.currentStepIndex}</span>
      <span data-testid="current-step-id">{currentStep?.id}</span>
      <span data-testid="is-first">{context.isFirstStep ? 'true' : 'false'}</span>
      <span data-testid="is-last">{context.isLastStep ? 'true' : 'false'}</span>
      <pre data-testid="all-data">{JSON.stringify(workflowState.allData)}</pre>
    </div>
  );
}

function StepVisibilityDisplay({ stepCount }: { stepCount: number }) {
  const { conditionsHelpers } = useWorkflowContext();
  const steps = Array.from({ length: stepCount }, (_, i) => i);
  return (
    <div>
      {steps.map((stepIndex) => (
        <span key={stepIndex} data-testid={`step-visible-${stepIndex}`}>
          {conditionsHelpers.isStepVisible(stepIndex) ? 'true' : 'false'}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// TESTS — Conditional steps navigation (playground bug reproduction)
// ============================================================================

describe('Workflow Conditional Steps Navigation -- E2E', () => {
  let accountTypeForm: any;
  let companyDetailsForm: any;
  let enterpriseForm: any;
  let confirmationForm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createRilConfig();

    accountTypeForm = form
      .create(rilConfig, 'account-type')
      .add({
        id: 'accountType',
        type: 'select',
        props: {
          label: 'Account Type',
          options: [
            { value: '', label: 'Select...' },
            { value: 'personal', label: 'Personal' },
            { value: 'business', label: 'Business' },
            { value: 'enterprise', label: 'Enterprise' },
          ],
        },
      })
      .add({ id: 'fullName', type: 'text', props: { label: 'Full Name' } })
      .build();

    companyDetailsForm = form
      .create(rilConfig, 'company-details')
      .add({ id: 'companyName', type: 'text', props: { label: 'Company Name' } })
      .add({
        id: 'companySize',
        type: 'select',
        props: {
          label: 'Company Size',
          options: [
            { value: '', label: 'Select...' },
            { value: '1-10', label: '1-10' },
            { value: '11-50', label: '11-50' },
            { value: '51-200', label: '51-200' },
          ],
        },
      })
      .add({ id: 'website', type: 'text', props: { label: 'Website' } })
      .build();

    enterpriseForm = form
      .create(rilConfig, 'enterprise-setup')
      .add({ id: 'contractId', type: 'text', props: { label: 'Contract ID' } })
      .add({
        id: 'ssoProvider',
        type: 'select',
        props: {
          label: 'SSO Provider',
          options: [
            { value: '', label: 'Select...' },
            { value: 'okta', label: 'Okta' },
            { value: 'azure', label: 'Azure AD' },
          ],
        },
      })
      .build();

    confirmationForm = form
      .create(rilConfig, 'confirmation')
      .add({ id: 'agreeTerms', type: 'checkbox', props: { label: 'I agree to the terms' } })
      .build();
  });

  // Helper to build the conditional flow (same as playground)
  function buildConditionalFlow() {
    return flow
      .create(rilConfig, 'conditional', 'Account Setup')
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
  }

  // --------------------------------------------------------------------------
  // 1. Enterprise full flow — conditions stay visible across all steps
  // --------------------------------------------------------------------------

  it('should navigate through all enterprise conditional steps without them disappearing', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // -- Step 0: Account Type --
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('type');
    });

    // Both conditional steps hidden initially
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('false');

    // Select "Enterprise"
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'enterprise' } });

    // Both conditional steps become visible
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');
    });

    // Fill full name
    fireEvent.change(screen.getByTestId('input-fullName'), { target: { value: 'Karl MAZIER' } });

    // Navigate to Company Details
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // -- Step 1: Company Details --
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Conditional steps MUST remain visible
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');

    // Fill company details
    fireEvent.change(screen.getByTestId('input-companyName'), {
      target: { value: 'Tech Innovation SAS' },
    });
    fireEvent.change(screen.getByTestId('input-companySize'), { target: { value: '11-50' } });
    fireEvent.change(screen.getByTestId('input-website'), {
      target: { value: 'https://www.test.fr' },
    });

    // Navigate to Enterprise Setup
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // -- Step 2: Enterprise Setup --
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });

    // Conditional steps STILL visible
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');

    // Fill enterprise details
    fireEvent.change(screen.getByTestId('input-contractId'), {
      target: { value: 'ENT-2024-001' },
    });
    fireEvent.change(screen.getByTestId('input-ssoProvider'), { target: { value: 'okta' } });

    // Navigate to Confirmation
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // -- Step 3: Confirmation --
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
      expect(screen.getByTestId('is-last')).toHaveTextContent('true');
    });

    // ALL steps still visible
    expect(screen.getByTestId('step-visible-0')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-3')).toHaveTextContent('true');
  });

  // --------------------------------------------------------------------------
  // 2. Business flow — only company step visible, enterprise hidden
  // --------------------------------------------------------------------------

  it('should show only company step for business account type', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // Select "Business"
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'business' } });
    fireEvent.change(screen.getByTestId('input-fullName'), { target: { value: 'Karl MAZIER' } });

    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true'); // company
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('false'); // enterprise
    });

    // Navigate to Company Details
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Fill company details
    fireEvent.change(screen.getByTestId('input-companyName'), {
      target: { value: 'My Business SARL' },
    });
    fireEvent.change(screen.getByTestId('input-companySize'), { target: { value: '1-10' } });

    // Company step still visible after filling
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');

    // Navigate to Confirmation (should skip enterprise)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
      expect(screen.getByTestId('is-last')).toHaveTextContent('true');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Personal flow — no conditional steps
  // --------------------------------------------------------------------------

  it('should skip all conditional steps for personal account type', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // Select "Personal"
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'personal' } });
    fireEvent.change(screen.getByTestId('input-fullName'), { target: { value: 'Karl MAZIER' } });

    // No conditional steps visible
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('false');
    });

    // Navigate — should go directly to confirmation
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Data integrity — no step data contamination
  // --------------------------------------------------------------------------

  it('should not leak step data between steps during navigation', async () => {
    const onComplete = vi.fn();
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onComplete}>
        <FlowBody />
        <NextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Step 0: Select enterprise + fill name
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'enterprise' } });
    fireEvent.change(screen.getByTestId('input-fullName'), { target: { value: 'Karl MAZIER' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Step 1: Fill company details
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    fireEvent.change(screen.getByTestId('input-companyName'), {
      target: { value: 'Tech Innovation SAS' },
    });
    fireEvent.change(screen.getByTestId('input-companySize'), { target: { value: '11-50' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Step 2: Fill enterprise details
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });

    fireEvent.change(screen.getByTestId('input-contractId'), {
      target: { value: 'ENT-2024-001' },
    });
    fireEvent.change(screen.getByTestId('input-ssoProvider'), { target: { value: 'okta' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Step 3: Check agreeTerms
    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
    });

    fireEvent.click(screen.getByTestId('input-agreeTerms'));

    // Verify data isolation via allData
    await waitFor(() => {
      const allData = JSON.parse(screen.getByTestId('all-data').textContent || '{}');

      // type step: only its own fields
      expect(allData.type).toEqual(
        expect.objectContaining({
          accountType: 'enterprise',
          fullName: 'Karl MAZIER',
        })
      );

      // company step: only its own fields (no accountType, no fullName)
      expect(allData.company?.companyName).toBe('Tech Innovation SAS');
      expect(allData.company?.accountType).toBeUndefined();
      expect(allData.company?.fullName).toBeUndefined();

      // enterprise step: only its own fields (no company data)
      expect(allData.enterprise?.contractId).toBe('ENT-2024-001');
      expect(allData.enterprise?.companyName).toBeUndefined();

      // confirm step: only agreeTerms (no leakage from other steps)
      expect(allData.confirm?.agreeTerms).toBe(true);
      expect(allData.confirm?.contractId).toBeUndefined();
      expect(allData.confirm?.companyName).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Back navigation — conditional steps persist when going back
  // --------------------------------------------------------------------------

  it('should keep conditional steps visible when navigating back and forth', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // Select enterprise
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'enterprise' } });
    fireEvent.change(screen.getByTestId('input-fullName'), { target: { value: 'Karl' } });

    // Navigate to Company Details
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Fill company name
    fireEvent.change(screen.getByTestId('input-companyName'), { target: { value: 'ACME' } });

    // Go back to step 0
    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('type');
    });

    // Steps still visible
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');

    // Navigate forward again — company data should be preserved
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Continue to enterprise
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });

    // Still visible
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');
  });

  // --------------------------------------------------------------------------
  // 6. Switch account type — conditional steps update correctly
  // --------------------------------------------------------------------------

  it('should update visible steps when switching from enterprise to business', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <PrevButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // Start with enterprise — both conditional steps visible
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'enterprise' } });

    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');
    });

    // Switch to business — only company step visible
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'business' } });

    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('false');
    });

    // Switch to personal — no conditional steps
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'personal' } });

    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
      expect(screen.getByTestId('step-visible-2')).toHaveTextContent('false');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Conditions using field name (not dot-notation) work across steps
  // --------------------------------------------------------------------------

  it('should evaluate when() with simple field name across step boundaries', async () => {
    const workflowConfig = buildConditionalFlow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <FlowBody />
        <NextButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={4} />
      </WorkflowProvider>
    );

    // Select enterprise on step 0
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'enterprise' } });

    // Navigate to company (step 1)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('company');
    });

    // Even though we're now on a different step, the condition
    // when('accountType').equals('enterprise') still evaluates to true
    // because accountType is extracted from allData.type.accountType
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');

    // Navigate to enterprise (step 2)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('enterprise');
    });

    // Navigate to confirmation (step 3)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step-id')).toHaveTextContent('confirm');
    });

    // Still visible from confirmation step
    expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    expect(screen.getByTestId('step-visible-2')).toHaveTextContent('true');
  });
});
