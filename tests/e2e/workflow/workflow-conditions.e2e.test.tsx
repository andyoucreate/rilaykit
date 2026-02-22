import { ril, when } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import {
  WorkflowBody,
  WorkflowNextButton,
  WorkflowPreviousButton,
  WorkflowProvider,
  WorkflowSkipButton,
  flow,
  useWorkflowContext,
} from '@rilaykit/workflow';
import { useCurrentStepIndex } from '@rilaykit/workflow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockSelectInput, MockTextInput, SetValueButton } from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

let rilConfig: ReturnType<typeof createRilConfig>;

function createRilConfig() {
  return ril
    .create()
    .addComponent('text', {
      name: 'Text',
      renderer: MockTextInput,
      defaultProps: { label: '' },
    })
    .addComponent('select', {
      name: 'Select',
      renderer: MockSelectInput,
      defaultProps: { label: '', options: [] },
    })
    .configure({
      bodyRenderer: ({ children }) => <div>{children}</div>,
      rowRenderer: ({ children }) => <div>{children}</div>,
      nextButtonRenderer: ({ onSubmit, isSubmitting }) => (
        <button type="button" data-testid="next-btn" onClick={onSubmit} disabled={isSubmitting}>
          Next
        </button>
      ),
      previousButtonRenderer: ({ onPrevious, canGoPrevious }) => (
        <button type="button" data-testid="prev-btn" onClick={onPrevious} disabled={!canGoPrevious}>
          Previous
        </button>
      ),
      skipButtonRenderer: ({ onSkip, canSkip }) => (
        <button type="button" data-testid="skip-btn" onClick={onSkip} disabled={!canSkip}>
          Skip
        </button>
      ),
    });
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function WorkflowStateDisplay() {
  const { workflowState, context } = useWorkflowContext();
  return (
    <div>
      <span data-testid="current-step">{workflowState.currentStepIndex}</span>
      <span data-testid="is-first">{context.isFirstStep ? 'true' : 'false'}</span>
      <span data-testid="is-last">{context.isLastStep ? 'true' : 'false'}</span>
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
// TESTS
// ============================================================================

describe('Workflow Conditions -- E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createRilConfig();
  });

  // --------------------------------------------------------------------------
  // 1. Show/hide steps by condition
  // --------------------------------------------------------------------------

  it('should show/hide steps based on condition evaluation', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({
        id: 'role',
        type: 'select',
        props: {
          label: 'Role',
          options: [
            { value: '', label: 'Select...' },
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ],
        },
      })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'permissions', type: 'text', props: { label: 'Permissions' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'confirm', type: 'text', props: { label: 'Confirm' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'cond-test-1', 'Conditions Test')
      .addStep({ id: 'step1', title: 'Step 1', formConfig: step1Form })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: step2Form,
        conditions: { visible: when('step1.role').equals('admin') },
      })
      .addStep({ id: 'step3', title: 'Step 3', formConfig: step3Form })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={3} />
      </WorkflowProvider>
    );

    // Assert -- step 2 should be hidden initially (role is not 'admin')
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    });

    // Act -- set role to 'admin'
    fireEvent.change(screen.getByTestId('input-role'), { target: { value: 'admin' } });

    // Assert -- step 2 should become visible
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Skip hidden steps on Next
  // --------------------------------------------------------------------------

  it('should skip hidden steps when navigating forward', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'showStep2', type: 'text', props: { label: 'Show Step 2' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'field2', type: 'text', props: { label: 'Field 2' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'field3', type: 'text', props: { label: 'Field 3' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'skip-hidden-test', 'Skip Hidden Test')
      .addStep({ id: 'step1', title: 'Step 1', formConfig: step1Form })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: step2Form,
        conditions: { visible: when('step1.showStep2').equals('yes') },
      })
      .addStep({ id: 'step3', title: 'Step 3', formConfig: step3Form })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Assert -- starts at step 0
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    // Act -- click Next (showStep2 is not 'yes', so step 2 is hidden)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert -- should jump to step 2 (index 2), skipping hidden step 1 (index 1)
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Dynamic step visibility
  // --------------------------------------------------------------------------

  it('should dynamically show/hide steps when controlling value changes', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({
        id: 'plan',
        type: 'select',
        props: {
          label: 'Plan',
          options: [
            { value: '', label: 'Select...' },
            { value: 'basic', label: 'Basic' },
            { value: 'premium', label: 'Premium' },
          ],
        },
      })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'premiumFeature', type: 'text', props: { label: 'Premium Feature' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'summary', type: 'text', props: { label: 'Summary' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'dynamic-visibility-test', 'Dynamic Visibility Test')
      .addStep({ id: 'step1', title: 'Choose Plan', formConfig: step1Form })
      .addStep({
        id: 'step2',
        title: 'Premium Features',
        formConfig: step2Form,
        conditions: { visible: when('step1.plan').equals('premium') },
      })
      .addStep({ id: 'step3', title: 'Summary', formConfig: step3Form })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={3} />
      </WorkflowProvider>
    );

    // Assert -- step 2 hidden initially
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    });

    // Act -- select premium plan
    fireEvent.change(screen.getByTestId('input-plan'), { target: { value: 'premium' } });

    // Assert -- step 2 becomes visible
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    });

    // Act -- switch back to basic
    fireEvent.change(screen.getByTestId('input-plan'), { target: { value: 'basic' } });

    // Assert -- step 2 hides again
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Recalculate isLastStep with hidden steps
  // --------------------------------------------------------------------------

  it('should recalculate isLastStep when the last step is hidden', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'email', type: 'text', props: { label: 'Email' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'extra', type: 'text', props: { label: 'Extra' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'last-step-test', 'Last Step Test')
      .addStep({ id: 'step1', title: 'Step 1', formConfig: step1Form })
      .addStep({ id: 'step2', title: 'Step 2', formConfig: step2Form })
      .addStep({
        id: 'step3',
        title: 'Step 3',
        formConfig: step3Form,
        conditions: { visible: when('step1.name').equals('showExtra') },
      })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Act -- navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert -- step 2 (index 1) should be the last visible step since step 3 is hidden
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      expect(screen.getByTestId('is-last')).toHaveTextContent('true');
    });
  });

  // --------------------------------------------------------------------------
  // 5. BUG HUNT: current step becomes hidden
  // --------------------------------------------------------------------------

  it('should auto-navigate when current step becomes hidden', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({
        id: 'accountType',
        type: 'select',
        props: {
          label: 'Account Type',
          options: [
            { value: '', label: 'Select...' },
            { value: 'business', label: 'Business' },
            { value: 'personal', label: 'Personal' },
          ],
        },
      })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'companyName', type: 'text', props: { label: 'Company Name' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'done', type: 'text', props: { label: 'Done' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'hidden-current-test', 'Hidden Current Test')
      .addStep({ id: 'step1', title: 'Account Type', formConfig: step1Form })
      .addStep({
        id: 'step2',
        title: 'Company Info',
        formConfig: step2Form,
        conditions: { visible: when('step1.accountType').equals('business') },
      })
      .addStep({ id: 'step3', title: 'Finish', formConfig: step3Form })
      .build();

    // Start with business to make step 2 visible
    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{ step1: { accountType: 'business' } }}
      >
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={3} />
      </WorkflowProvider>
    );

    // Assert -- step 2 visible initially
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    });

    // Act -- navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Act -- go back to step 1 and change account type to 'personal'
    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    // Change value to hide step 2
    fireEvent.change(screen.getByTestId('input-accountType'), { target: { value: 'personal' } });

    // Assert -- step 2 should now be hidden
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    });

    // Act -- navigate forward, should skip step 2 and go to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Default values trigger conditions
  // --------------------------------------------------------------------------

  it('should evaluate conditions from defaultValues on initial render', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({
        id: 'role',
        type: 'select',
        props: {
          label: 'Role',
          options: [
            { value: '', label: 'Select...' },
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ],
        },
      })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'adminPanel', type: 'text', props: { label: 'Admin Panel' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'finish', type: 'text', props: { label: 'Finish' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'default-vals-test', 'Default Values Test')
      .addStep({ id: 'step1', title: 'Step 1', formConfig: step1Form })
      .addStep({
        id: 'step2',
        title: 'Admin Step',
        formConfig: step2Form,
        conditions: { visible: when('step1.role').equals('admin') },
      })
      .addStep({ id: 'step3', title: 'Step 3', formConfig: step3Form })
      .build();

    // Act -- render with defaultValues that satisfy the condition
    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{ step1: { role: 'admin' } }}
      >
        <WorkflowBody />
        <WorkflowStateDisplay />
        <StepVisibilityDisplay stepCount={3} />
      </WorkflowProvider>
    );

    // Assert -- step 2 should be visible from the start
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('true');
    });
  });

  // --------------------------------------------------------------------------
  // 7. allowSkip step
  // --------------------------------------------------------------------------

  it('should allow skipping a step when allowSkip is true', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'optional', type: 'text', props: { label: 'Optional Info' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'confirm', type: 'text', props: { label: 'Confirm' } })
      .build();

    const workflowConfig = flow
      .create(rilConfig, 'skip-test', 'Skip Test')
      .addStep({ id: 'step1', title: 'Step 1', formConfig: step1Form })
      .addStep({ id: 'step2', title: 'Step 2', formConfig: step2Form, allowSkip: true })
      .addStep({ id: 'step3', title: 'Step 3', formConfig: step3Form })
      .build();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowSkipButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Act -- navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Assert -- skip button should be enabled
    expect(screen.getByTestId('skip-btn')).not.toBeDisabled();

    // Act -- click skip
    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-btn'));
    });

    // Assert -- should advance to step 3
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });
  });

  // --------------------------------------------------------------------------
  // 8. BUG HUNT: all steps hidden
  // --------------------------------------------------------------------------

  it('should handle gracefully when all steps become hidden', async () => {
    // Arrange
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'trigger', type: 'text', props: { label: 'Trigger' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'field2', type: 'text', props: { label: 'Field 2' } })
      .build();

    // Both steps have conditions that are never satisfied by default
    const workflowConfig = flow
      .create(rilConfig, 'all-hidden-test', 'All Hidden Test')
      .addStep({
        id: 'step1',
        title: 'Step 1',
        formConfig: step1Form,
        conditions: { visible: when('nonExistent.field').equals('impossible') },
      })
      .addStep({
        id: 'step2',
        title: 'Step 2',
        formConfig: step2Form,
        conditions: { visible: when('nonExistent.other').equals('impossible') },
      })
      .build();

    // Act & Assert -- should render without crashing
    expect(() => {
      render(
        <WorkflowProvider workflowConfig={workflowConfig}>
          <WorkflowBody />
          <WorkflowStateDisplay />
          <StepVisibilityDisplay stepCount={2} />
        </WorkflowProvider>
      );
    }).not.toThrow();

    // Assert -- both steps should be marked as hidden
    await waitFor(() => {
      expect(screen.getByTestId('step-visible-0')).toHaveTextContent('false');
      expect(screen.getByTestId('step-visible-1')).toHaveTextContent('false');
    });
  });
});
