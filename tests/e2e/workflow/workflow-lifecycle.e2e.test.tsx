import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import {
  flow,
  WorkflowProvider,
  useWorkflowContext,
  WorkflowBody,
  WorkflowNextButton,
  WorkflowPreviousButton,
} from '@rilaykit/workflow';
import { useWorkflowStore, useCurrentStepIndex, useWorkflowAllData } from '@rilaykit/workflow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockTextInput, MockSelectInput } from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

function createWorkflowRilConfig() {
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
        <button data-testid="next-btn" onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Loading...' : 'Next'}
        </button>
      ),
      previousButtonRenderer: ({ onPrevious, canGoPrevious }) => (
        <button data-testid="prev-btn" onClick={onPrevious} disabled={!canGoPrevious}>
          Previous
        </button>
      ),
    });
}

let rilConfig: ReturnType<typeof createWorkflowRilConfig>;

// ============================================================================
// HELPER COMPONENT
// ============================================================================

function WorkflowStateDisplay() {
  const { workflowState, context } = useWorkflowContext();
  return (
    <div>
      <span data-testid="current-step">{workflowState.currentStepIndex}</span>
      <span data-testid="visited-count">{workflowState.visitedSteps.size}</span>
      <span data-testid="is-first">{context.isFirstStep ? 'true' : 'false'}</span>
      <span data-testid="is-last">{context.isLastStep ? 'true' : 'false'}</span>
      <pre data-testid="all-data">{JSON.stringify(workflowState.allData)}</pre>
    </div>
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe('Workflow Lifecycle — E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createWorkflowRilConfig();
  });

  // --------------------------------------------------------------------------
  // Helper: build a 3-step workflow
  // --------------------------------------------------------------------------

  function buildThreeStepWorkflow() {
    const step1Form = form
      .create(rilConfig, 'step1-form')
      .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
      .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
      .build();

    const step2Form = form
      .create(rilConfig, 'step2-form')
      .add({ id: 'email', type: 'text', props: { label: 'Email' } })
      .add({ id: 'phone', type: 'text', props: { label: 'Phone' } })
      .build();

    const step3Form = form
      .create(rilConfig, 'step3-form')
      .add({ id: 'company', type: 'text', props: { label: 'Company' } })
      .add({ id: 'role', type: 'text', props: { label: 'Role' } })
      .build();

    return flow
      .create(rilConfig, 'test-workflow', 'Test Workflow')
      .addStep({ id: 'step1', title: 'Personal Info', formConfig: step1Form })
      .addStep({ id: 'step2', title: 'Contact Info', formConfig: step2Form })
      .addStep({ id: 'step3', title: 'Professional Info', formConfig: step3Form })
      .build();
  }

  // --------------------------------------------------------------------------
  // 1. Render first step on mount
  // --------------------------------------------------------------------------

  it('should render the first step fields on mount', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    // Act
    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('field-lastName')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('field-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-company')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-step')).toHaveTextContent('0');
  });

  // --------------------------------------------------------------------------
  // 2. Navigate forward through all steps
  // --------------------------------------------------------------------------

  it('should navigate forward through all steps', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    // Assert step 1 is visible
    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Act — navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert step 2 is visible
    await waitFor(() => {
      expect(screen.getByTestId('field-email')).toBeInTheDocument();
      expect(screen.getByTestId('field-phone')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field-firstName')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-step')).toHaveTextContent('1');

    // Act — navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert step 3 is visible
    await waitFor(() => {
      expect(screen.getByTestId('field-company')).toBeInTheDocument();
      expect(screen.getByTestId('field-role')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field-email')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-step')).toHaveTextContent('2');
  });

  // --------------------------------------------------------------------------
  // 3. Navigate backward
  // --------------------------------------------------------------------------

  it('should navigate backward to the previous step', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    // Navigate forward to step 3
    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });

    // Act — go back to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('field-email')).toBeInTheDocument();
      expect(screen.getByTestId('field-phone')).toBeInTheDocument();
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });
    expect(screen.queryByTestId('field-company')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 4. Preserve data across navigation
  // --------------------------------------------------------------------------

  it('should preserve data when navigating between steps', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Act — enter values in step 1
    fireEvent.change(screen.getByTestId('input-firstName'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByTestId('input-lastName'), {
      target: { value: 'Smith' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-firstName')).toHaveValue('Alice');
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Navigate back to step 1
    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    // Assert — data should be preserved
    await waitFor(() => {
      expect(screen.getByTestId('input-firstName')).toHaveValue('Alice');
      expect(screen.getByTestId('input-lastName')).toHaveValue('Smith');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Track visited steps
  // --------------------------------------------------------------------------

  it('should track visited steps as user navigates', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Initially only the first step is visited (automatically)
    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert — at least step1 and step2 should be visited
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
      // step1, step2, and step3 all visited
      const visitedCount = Number(screen.getByTestId('visited-count').textContent);
      expect(visitedCount).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Call onStepChange callback
  // --------------------------------------------------------------------------

  it('should call onStepChange when navigating between steps', async () => {
    // Arrange
    const onStepChange = vi.fn();
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onStepChange={onStepChange}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Act — navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert
    await waitFor(() => {
      expect(onStepChange).toHaveBeenCalledTimes(1);
      expect(onStepChange).toHaveBeenCalledWith(
        0, // fromStep index
        1, // toStep index
        expect.objectContaining({
          workflowId: 'test-workflow',
          currentStepIndex: expect.any(Number),
        }),
      );
    });

    // Act — navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(onStepChange).toHaveBeenCalledTimes(2);
      expect(onStepChange).toHaveBeenLastCalledWith(
        1, // fromStep index
        2, // toStep index
        expect.objectContaining({
          workflowId: 'test-workflow',
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. Call onWorkflowComplete on last step submit
  // --------------------------------------------------------------------------

  it('should call onWorkflowComplete when submitting the last step', async () => {
    // Arrange
    const onWorkflowComplete = vi.fn();
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        onWorkflowComplete={onWorkflowComplete}
      >
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });

    // Act — submit on last step
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert
    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
      expect(onWorkflowComplete).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  // --------------------------------------------------------------------------
  // 8. Initialize with defaultStep
  // --------------------------------------------------------------------------

  it('should initialize at the specified defaultStep with previous steps marked as visited', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} defaultStep="step2">
        <WorkflowBody />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    // Assert — should start at step 2 (index 1)
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      expect(screen.getByTestId('field-email')).toBeInTheDocument();
      expect(screen.getByTestId('field-phone')).toBeInTheDocument();
    });

    // Previous steps should be marked as visited
    await waitFor(() => {
      const visitedCount = Number(screen.getByTestId('visited-count').textContent);
      // step1 should be marked as visited (pre-populated)
      expect(visitedCount).toBeGreaterThanOrEqual(1);
    });

    // First step fields should not be rendered
    expect(screen.queryByTestId('field-firstName')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 9. isFirstStep / isLastStep flags
  // --------------------------------------------------------------------------

  it('should correctly report isFirstStep and isLastStep flags at each position', async () => {
    // Arrange
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    // Assert — step 1: isFirstStep=true, isLastStep=false
    await waitFor(() => {
      expect(screen.getByTestId('is-first')).toHaveTextContent('true');
      expect(screen.getByTestId('is-last')).toHaveTextContent('false');
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert — step 2: isFirstStep=false, isLastStep=false
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      expect(screen.getByTestId('is-first')).toHaveTextContent('false');
      expect(screen.getByTestId('is-last')).toHaveTextContent('false');
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert — step 3: isFirstStep=false, isLastStep=true
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
      expect(screen.getByTestId('is-first')).toHaveTextContent('false');
      expect(screen.getByTestId('is-last')).toHaveTextContent('true');
    });
  });

  // --------------------------------------------------------------------------
  // 10. BUG HUNT: workflow data accumulation across all steps
  // --------------------------------------------------------------------------

  it('should accumulate data from all steps in onWorkflowComplete', async () => {
    // Arrange
    const onWorkflowComplete = vi.fn();
    const workflowConfig = buildThreeStepWorkflow();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        onWorkflowComplete={onWorkflowComplete}
      >
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    // Step 1 — enter personal info
    fireEvent.change(screen.getByTestId('input-firstName'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByTestId('input-lastName'), {
      target: { value: 'Dupont' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-firstName')).toHaveValue('Alice');
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Step 2 — enter contact info
    fireEvent.change(screen.getByTestId('input-email'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByTestId('input-phone'), {
      target: { value: '+33612345678' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-email')).toHaveValue('alice@example.com');
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });

    // Step 3 — enter professional info
    fireEvent.change(screen.getByTestId('input-company'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByTestId('input-role'), {
      target: { value: 'Engineer' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-company')).toHaveValue('Acme Corp');
    });

    // Submit workflow on last step
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Assert — onWorkflowComplete should receive ALL data from every step
    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const submittedData = onWorkflowComplete.mock.calls[0][0];

    // Step 1 data must be present (keyed by step ID)
    expect(submittedData.step1).toBeDefined();
    expect(submittedData.step1).toEqual(
      expect.objectContaining({
        firstName: 'Alice',
        lastName: 'Dupont',
      }),
    );

    // Step 2 data must be present
    expect(submittedData.step2).toBeDefined();
    expect(submittedData.step2).toEqual(
      expect.objectContaining({
        email: 'alice@example.com',
        phone: '+33612345678',
      }),
    );

    // Step 3 data must be present — not just the last step
    expect(submittedData.step3).toBeDefined();
    expect(submittedData.step3).toEqual(
      expect.objectContaining({
        company: 'Acme Corp',
        role: 'Engineer',
      }),
    );
  });
});
