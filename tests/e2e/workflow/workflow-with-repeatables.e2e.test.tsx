import { required, ril } from '@rilaykit/core';
import { form, useFormStoreApi } from '@rilaykit/forms';
import { useRepeatableField } from '@rilaykit/forms';
import {
  WorkflowBody,
  WorkflowNextButton,
  WorkflowPreviousButton,
  WorkflowProvider,
  flow,
  useWorkflowContext,
} from '@rilaykit/workflow';
import { useWorkflowAllData } from '@rilaykit/workflow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockNumberInput, MockTextInput } from '../_setup/test-helpers';

// ============================================================================
// RIL CONFIG
// ============================================================================

const rilConfig = ril
  .create()
  .addComponent('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  })
  .addComponent('number', {
    name: 'Number',
    renderer: MockNumberInput,
    defaultProps: { label: '' },
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
  });

// ============================================================================
// FORM CONFIGS
// ============================================================================

function buildStep1Form() {
  return form
    .create(rilConfig, 'contact-form')
    .add({ id: 'name', type: 'text', props: { label: 'Full Name' } })
    .build();
}

function buildStep2FormWithRepeatables() {
  return form
    .create(rilConfig, 'items-form')
    .add({ id: 'title', type: 'text', props: { label: 'Order Title' } })
    .addRepeatable('items', (r) =>
      r
        .add({ id: 'name', type: 'text', props: { label: 'Item Name' } })
        .add({ id: 'qty', type: 'number', props: { label: 'Quantity' } })
        .min(1)
        .defaultValue({ name: '', qty: 1 })
    )
    .build();
}

function buildStep2FormWithRequiredRepeatables() {
  return form
    .create(rilConfig, 'items-form')
    .add({ id: 'title', type: 'text', props: { label: 'Order Title' } })
    .addRepeatable('items', (r) =>
      r
        .add({
          id: 'name',
          type: 'text',
          props: { label: 'Item Name' },
          validation: { validate: required('Item name is required') },
        })
        .add({ id: 'qty', type: 'number', props: { label: 'Quantity' } })
        .min(1)
        .defaultValue({ name: '', qty: 1 })
    )
    .build();
}

function buildStep3Form() {
  return form
    .create(rilConfig, 'summary-form')
    .add({ id: 'notes', type: 'text', props: { label: 'Notes' } })
    .build();
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function RepeatableHelper() {
  const { items, append, remove, canAdd, canRemove, count } = useRepeatableField('items');
  return (
    <div>
      <span data-testid="item-count">{count}</span>
      <button type="button" data-testid="add-item" onClick={() => append()} disabled={!canAdd}>
        Add
      </button>
      {items.map((item, i) => (
        <button
          type="button"
          key={item.key}
          data-testid={`remove-item-${i}`}
          onClick={() => remove(item.key)}
          disabled={!canRemove}
        >
          Remove {i}
        </button>
      ))}
    </div>
  );
}

function WorkflowDataDisplay() {
  const { workflowState } = useWorkflowContext();
  const allData = useWorkflowAllData();
  return (
    <div>
      <span data-testid="current-step">{workflowState.currentStepIndex}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe('Workflow with Repeatable Fields -- E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Helper: build a 3-step workflow with repeatables in step 2
  // --------------------------------------------------------------------------

  function buildWorkflow(step2Form = buildStep2FormWithRepeatables()) {
    return flow
      .create(rilConfig, 'order-workflow', 'Order Workflow')
      .addStep({ id: 'contact', title: 'Contact', formConfig: buildStep1Form() })
      .addStep({ id: 'items', title: 'Items', formConfig: step2Form })
      .addStep({ id: 'summary', title: 'Summary', formConfig: buildStep3Form() })
      .build();
  }

  // --------------------------------------------------------------------------
  // 1. Render repeatable fields in workflow step
  // --------------------------------------------------------------------------

  it('should render repeatable fields when navigating to a step with repeatables', async () => {
    const workflowConfig = buildWorkflow();

    render(
      <WorkflowProvider
        workflowConfig={workflowConfig}
        defaultValues={{
          items: {
            title: 'My Order',
            items: [{ name: 'Widget', qty: 3 }],
          },
        }}
      >
        <WorkflowBody />
        <WorkflowNextButton />
        <RepeatableHelper />
        <WorkflowDataDisplay />
      </WorkflowProvider>
    );

    // Step 1 is displayed first
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('current-step')).toHaveTextContent('0');

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Step 2 should now render the repeatable items
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
      expect(screen.getByTestId('field-title')).toBeInTheDocument();
    });

    // Repeatable fields should be rendered (at least the min=1 item)
    await waitFor(() => {
      const itemCount = Number(screen.getByTestId('item-count').textContent);
      expect(itemCount).toBeGreaterThanOrEqual(1);
    });

    // Step 1 fields should no longer be visible
    expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 2. Add/remove items in workflow step
  // --------------------------------------------------------------------------

  it('should add and remove repeatable items within a workflow step', async () => {
    const workflowConfig = buildWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <RepeatableHelper />
        <WorkflowDataDisplay />
      </WorkflowProvider>
    );

    // Navigate to step 2 (items)
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // min=1, so we start with 1 item
    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('1');
    });

    // Add a second item
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-item'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('2');
    });

    // Add a third item
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-item'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('3');
    });

    // Remove the second item (index 1)
    await act(async () => {
      fireEvent.click(screen.getByTestId('remove-item-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('2');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Validate repeatable fields before navigation
  // --------------------------------------------------------------------------

  it('should block navigation when repeatable fields have validation errors', async () => {
    const step2WithValidation = buildStep2FormWithRequiredRepeatables();
    const workflowConfig = buildWorkflow(step2WithValidation);

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <RepeatableHelper />
        <WorkflowDataDisplay />
      </WorkflowProvider>
    );

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // The repeatable has min=1 with a default item where name=''.
    // The name field has required() validation.
    // Trying to navigate forward should be blocked.
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    // Should still be on step 2 because validation failed
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Fill in the required field
    const nameInput = screen.getByTestId('input-items[k0].name');
    fireEvent.change(nameInput, { target: { value: 'Widget' } });

    await waitFor(() => {
      expect(nameInput).toHaveValue('Widget');
    });

    // Now navigation should succeed
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Preserve repeatable data across navigation
  // --------------------------------------------------------------------------

  it('should preserve repeatable data when navigating away and back', async () => {
    const workflowConfig = buildWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowPreviousButton />
        <RepeatableHelper />
        <WorkflowDataDisplay />
      </WorkflowProvider>
    );

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Fill in the default item
    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-items[k0].name'), {
      target: { value: 'Widget' },
    });
    fireEvent.change(screen.getByTestId('input-items[k0].qty'), {
      target: { value: '5' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toHaveValue('Widget');
      expect(screen.getByTestId('input-items[k0].qty')).toHaveValue(5);
    });

    // Add a second item and fill it
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-item'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('2');
    });

    fireEvent.change(screen.getByTestId('input-items[k1].name'), {
      target: { value: 'Gadget' },
    });
    fireEvent.change(screen.getByTestId('input-items[k1].qty'), {
      target: { value: '10' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('Gadget');
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });

    // Navigate back to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // The allData in the workflow store should contain the items step data.
    // Verify via the all-data display that the items step data was persisted.
    const allDataText = screen.getByTestId('all-data').textContent!;
    const allData = JSON.parse(allDataText);

    expect(allData.items).toBeDefined();

    // The step data is stored under the step ID 'items'.
    // It should contain structured data with the items array.
    const itemsStepData = allData.items;
    expect(itemsStepData.items).toBeDefined();
    expect(itemsStepData.items).toHaveLength(2);
    expect(itemsStepData.items[0]).toEqual(expect.objectContaining({ name: 'Widget', qty: 5 }));
    expect(itemsStepData.items[1]).toEqual(expect.objectContaining({ name: 'Gadget', qty: 10 }));
  });

  // --------------------------------------------------------------------------
  // 5. BUG HUNT: structured data in workflow complete
  // --------------------------------------------------------------------------

  it('should pass structured nested arrays (not flat composite keys) to onWorkflowComplete', async () => {
    const onWorkflowComplete = vi.fn();
    const workflowConfig = buildWorkflow();

    render(
      <WorkflowProvider workflowConfig={workflowConfig} onWorkflowComplete={onWorkflowComplete}>
        <WorkflowBody />
        <WorkflowNextButton />
        <RepeatableHelper />
        <WorkflowDataDisplay />
      </WorkflowProvider>
    );

    // Step 1: fill contact name
    await waitFor(() => {
      expect(screen.getByTestId('input-name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-name'), {
      target: { value: 'Alice Dupont' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-name')).toHaveValue('Alice Dupont');
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Step 2: fill order title + repeatable items
    await waitFor(() => {
      expect(screen.getByTestId('input-title')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-title'), {
      target: { value: 'Order #42' },
    });

    // Fill the default item (min=1 guarantees k0 exists)
    await waitFor(() => {
      expect(screen.getByTestId('input-items[k0].name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-items[k0].name'), {
      target: { value: 'Widget' },
    });
    fireEvent.change(screen.getByTestId('input-items[k0].qty'), {
      target: { value: '3' },
    });

    // Add a second item
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-item'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('item-count')).toHaveTextContent('2');
    });

    fireEvent.change(screen.getByTestId('input-items[k1].name'), {
      target: { value: 'Gadget' },
    });
    fireEvent.change(screen.getByTestId('input-items[k1].qty'), {
      target: { value: '7' },
    });

    // Navigate to step 3
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('2');
    });

    // Step 3: fill summary notes
    await waitFor(() => {
      expect(screen.getByTestId('input-notes')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-notes'), {
      target: { value: 'Rush delivery' },
    });

    // Submit workflow (click Next on last step)
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
    });

    const submittedData = onWorkflowComplete.mock.calls[0][0];

    // Step 1 data should be present under its step ID
    expect(submittedData.contact).toEqual(expect.objectContaining({ name: 'Alice Dupont' }));

    // Step 3 data should be present
    expect(submittedData.summary).toEqual(expect.objectContaining({ notes: 'Rush delivery' }));

    // Step 2 data should contain STRUCTURED nested arrays, not flat composite keys.
    // This is the critical assertion: the items field should be an array of objects,
    // NOT keys like "items[k0].name" or "items[k1].qty".
    expect(submittedData.items).toBeDefined();

    const itemsStepData = submittedData.items;
    expect(itemsStepData.title).toBe('Order #42');

    // Items should be a nested array, not flat composite keys
    expect(itemsStepData.items).toBeDefined();
    expect(Array.isArray(itemsStepData.items)).toBe(true);
    expect(itemsStepData.items).toHaveLength(2);

    expect(itemsStepData.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Widget', qty: 3 }),
        expect.objectContaining({ name: 'Gadget', qty: 7 }),
      ])
    );

    // Verify NO flat composite keys leaked into the step data
    const allKeys = Object.keys(itemsStepData);
    const compositeKeys = allKeys.filter((k) => k.includes('[') && k.includes(']'));
    expect(compositeKeys).toHaveLength(0);
  });
});
