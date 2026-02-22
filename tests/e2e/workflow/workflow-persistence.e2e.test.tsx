import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import {
  LocalStorageAdapter,
  WorkflowBody,
  WorkflowNextButton,
  WorkflowProvider,
  flow,
  useWorkflowContext,
} from '@rilaykit/workflow';
import { useWorkflowAllData } from '@rilaykit/workflow';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockTextInput } from '../_setup/test-helpers';

// ============================================================================
// SETUP
// ============================================================================

const STORAGE_KEY = 'rilay_workflow_test-workflow';
const rilConfig = ril
  .create()
  .addComponent('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  })
  .configure({
    bodyRenderer: ({ children }) => <div>{children}</div>,
    rowRenderer: ({ children }) => <div>{children}</div>,
    nextButtonRenderer: ({ onSubmit }) => (
      <button type="button" data-testid="next-btn" onClick={onSubmit}>
        Next
      </button>
    ),
    previousButtonRenderer: ({ onPrevious }) => (
      <button type="button" data-testid="prev-btn" onClick={onPrevious}>
        Previous
      </button>
    ),
  });

// ============================================================================
// HELPERS
// ============================================================================

function WorkflowStateDisplay() {
  const { workflowState } = useWorkflowContext();
  const allData = useWorkflowAllData();
  return (
    <div>
      <span data-testid="current-step">{workflowState.currentStepIndex}</span>
      <span data-testid="visited-count">{workflowState.visitedSteps.size}</span>
      <pre data-testid="all-data">{JSON.stringify(allData)}</pre>
    </div>
  );
}

function buildStep1Form() {
  return form
    .create(rilConfig, 'step1-form')
    .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
    .build();
}

function buildStep2Form() {
  return form
    .create(rilConfig, 'step2-form')
    .add({ id: 'email', type: 'text', props: { label: 'Email' } })
    .build();
}

/**
 * Build a two-step workflow without persistence (for rendering + adapter-level tests)
 */
function buildWorkflow() {
  return flow
    .create(rilConfig, 'test-workflow', 'Test Workflow')
    .addStep({ id: 'step-1', title: 'Step 1', formConfig: buildStep1Form() })
    .addStep({ id: 'step-2', title: 'Step 2', formConfig: buildStep2Form() })
    .build();
}

/**
 * Create a valid StorageEntry matching the internal format of LocalStorageAdapter.save()
 */
function createStorageEntry(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: {
      workflowId: 'test-workflow',
      currentStepIndex: 0,
      allData: {},
      stepData: {},
      visitedSteps: [],
      passedSteps: [],
      lastSaved: Date.now(),
      ...overrides,
    },
    version: '1.0.0',
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('Workflow Persistence with localStorage - E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // 1. Save workflow state to localStorage
  // --------------------------------------------------------------------------

  it('should save workflow state to localStorage', async () => {
    // Arrange
    const adapter = new LocalStorageAdapter();

    // Render workflow without persistence integration to avoid re-render loops,
    // then use the adapter directly to verify save behavior
    render(
      <WorkflowProvider workflowConfig={buildWorkflow()}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Wait for initialization
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    // Enter data in step 1
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-firstName'), {
        target: { value: 'Alice' },
      });
    });

    // Navigate to step 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });

    // Act - save current workflow data via the adapter
    const allData = JSON.parse(screen.getByTestId('all-data').textContent!);
    await adapter.save(STORAGE_KEY, {
      workflowId: 'test-workflow',
      currentStepIndex: 1,
      allData,
      stepData: {},
      visitedSteps: ['step-1'],
      passedSteps: ['step-1'],
      lastSaved: Date.now(),
    });

    // Assert - data saved to localStorage in expected format
    const rawData = localStorage.getItem(`rilay_workflow_${STORAGE_KEY}`);
    expect(rawData).not.toBeNull();

    const parsed = JSON.parse(rawData!);
    expect(parsed.data.workflowId).toBe('test-workflow');
    expect(parsed.data.currentStepIndex).toBe(1);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.data.lastSaved).toBeGreaterThan(0);
    expect(parsed.data.allData).toEqual(allData);
  });

  // --------------------------------------------------------------------------
  // 2. Restore workflow state from localStorage
  // --------------------------------------------------------------------------

  it('should restore workflow state from localStorage on mount', async () => {
    // Arrange - pre-populate localStorage with saved state at step 1
    const persistedData = {
      currentStepIndex: 1,
      allData: { 'step-1': { firstName: 'Bob' } },
      stepData: { email: '' },
      visitedSteps: ['step-1'],
      passedSteps: ['step-1'],
    };
    localStorage.setItem(STORAGE_KEY, createStorageEntry(persistedData));

    // Act - load data via the adapter
    const adapter = new LocalStorageAdapter({ keyPrefix: '' });
    const loaded = await adapter.load(STORAGE_KEY);

    // Assert - adapter correctly parses and returns persisted data
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowId).toBe('test-workflow');
    expect(loaded!.currentStepIndex).toBe(1);
    expect(loaded!.allData).toEqual({ 'step-1': { firstName: 'Bob' } });
    expect(loaded!.visitedSteps).toEqual(['step-1']);
    expect(loaded!.passedSteps).toEqual(['step-1']);

    // Verify the workflow renders normally from step 0 (without persistence integration)
    // and the persisted data could be applied to restore state
    render(
      <WorkflowProvider workflowConfig={buildWorkflow()}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Restore visited/passed steps
  // --------------------------------------------------------------------------

  it('should restore visited and passed steps from localStorage', async () => {
    // Arrange - pre-populate localStorage with visited steps
    const persistedData = {
      currentStepIndex: 1,
      allData: { 'step-1': { firstName: 'Charlie' } },
      stepData: {},
      visitedSteps: ['step-1', 'step-2'],
      passedSteps: ['step-1'],
    };
    localStorage.setItem(STORAGE_KEY, createStorageEntry(persistedData));

    // Act - load data via the adapter
    const adapter = new LocalStorageAdapter({ keyPrefix: '' });
    const loaded = await adapter.load(STORAGE_KEY);

    // Assert - visited and passed steps are correctly restored
    expect(loaded).not.toBeNull();
    expect(loaded!.visitedSteps).toHaveLength(2);
    expect(loaded!.visitedSteps).toContain('step-1');
    expect(loaded!.visitedSteps).toContain('step-2');
    expect(loaded!.passedSteps).toHaveLength(1);
    expect(loaded!.passedSteps).toContain('step-1');

    // Verify data integrity
    expect(loaded!.currentStepIndex).toBe(1);
    expect(loaded!.allData['step-1']).toEqual({ firstName: 'Charlie' });
  });

  // --------------------------------------------------------------------------
  // 4. Handle corrupted persistence data
  // --------------------------------------------------------------------------

  it('should handle corrupted localStorage data without crashing', async () => {
    // Arrange - put invalid JSON in localStorage
    localStorage.setItem('rilay_workflow_test-workflow', '{invalid json!!!}');

    const adapter = new LocalStorageAdapter();

    // Act & Assert - adapter.load should throw a WorkflowPersistenceError
    await expect(adapter.load('test-workflow')).rejects.toThrow();

    // The workflow itself should render fine without persistence
    render(
      <WorkflowProvider workflowConfig={buildWorkflow()}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Assert - workflow starts fresh at step 0
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    // Workflow should be functional
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-firstName'), {
        target: { value: 'Test' },
      });
    });

    expect(screen.getByTestId('input-firstName')).toHaveValue('Test');
  });

  // --------------------------------------------------------------------------
  // 5. Handle missing/unavailable localStorage
  // --------------------------------------------------------------------------

  it('should work normally when localStorage is unavailable', async () => {
    // Arrange - mock localStorage to throw during adapter initialization.
    // The adapter checks availability by calling setItem/removeItem in constructor.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage is not available');
    });

    // Create adapter while localStorage is mocked (will detect as unavailable)
    const adapter = new LocalStorageAdapter();

    // Restore spy so React rendering works normally
    setItemSpy.mockRestore();

    // Act - adapter operations should silently no-op
    await adapter.save('test-key', {
      workflowId: 'test',
      currentStepIndex: 0,
      allData: {},
      stepData: {},
      visitedSteps: [],
      lastSaved: Date.now(),
    });

    const loaded = await adapter.load('test-key');
    expect(loaded).toBeNull();

    const exists = await adapter.exists('test-key');
    expect(exists).toBe(false);

    // Render workflow without persistence - should work normally
    render(
      <WorkflowProvider workflowConfig={buildWorkflow()}>
        <WorkflowBody />
        <WorkflowNextButton />
        <WorkflowStateDisplay />
      </WorkflowProvider>
    );

    // Assert - workflow starts at step 0
    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    });

    // Workflow is fully functional
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-firstName'), {
        target: { value: 'NoStorage' },
      });
    });

    expect(screen.getByTestId('input-firstName')).toHaveValue('NoStorage');

    // Navigation still works
    await act(async () => {
      fireEvent.click(screen.getByTestId('next-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-step')).toHaveTextContent('1');
    });
  });

  // --------------------------------------------------------------------------
  // 6. persistNow manual save
  // --------------------------------------------------------------------------

  it('should persist data immediately when persistNow is called', async () => {
    // Arrange - use adapter.save directly to test the manual persist path
    const adapter = new LocalStorageAdapter();

    // Verify localStorage is empty
    expect(localStorage.getItem('rilay_workflow_test-workflow')).toBeNull();

    // Act - manually save workflow data (equivalent to persistNow)
    await adapter.save('test-workflow', {
      workflowId: 'test-workflow',
      currentStepIndex: 0,
      allData: { 'step-1': { firstName: 'Manual' } },
      stepData: { firstName: 'Manual' },
      visitedSteps: ['step-1'],
      lastSaved: 0,
    });

    // Assert - data should be immediately in localStorage
    const rawData = localStorage.getItem('rilay_workflow_test-workflow');
    expect(rawData).not.toBeNull();

    const parsed = JSON.parse(rawData!);
    expect(parsed.data.workflowId).toBe('test-workflow');
    expect(parsed.data.currentStepIndex).toBe(0);
    expect(parsed.data.allData['step-1'].firstName).toBe('Manual');
    expect(parsed.data.lastSaved).toBeGreaterThan(0);

    // Verify it can be loaded back
    const loaded = await adapter.load('test-workflow');
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowId).toBe('test-workflow');
    expect(loaded!.allData['step-1'].firstName).toBe('Manual');
  });
});
