// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';
import { WorkflowProvider } from '../../src/components/WorkflowProvider';
import { useStepMetadata } from '../../src/hooks/useStepMetadata';

describe('useStepMetadata', () => {
  let mockRilConfig: any;
  let mockForm1: any;
  let mockForm2: any;
  let mockForm3: any;

  beforeEach(() => {
    // Mock configuration
    mockRilConfig = ril.create().addComponent('text', {
      name: 'Text Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '', placeholder: 'Enter text' },
    });

    // Mock forms for testing
    mockForm1 = form
      .create(mockRilConfig)
      .add({ type: 'text', props: { label: 'Field 1' } })
      .build();

    mockForm2 = form
      .create(mockRilConfig)
      .add({ type: 'text', props: { label: 'Field 2' } })
      .build();

    mockForm3 = form
      .create(mockRilConfig)
      .add({ type: 'text', props: { label: 'Field 3' } })
      .build();
  });

  const createWorkflowWithMetadata = () => {
    return flow
      .create(mockRilConfig, 'test-workflow', 'Test Workflow')
      .addStep({
        id: 'step-1',
        title: 'Step 1',
        formConfig: mockForm1,
        metadata: {
          icon: 'user-circle',
          category: 'personal-info',
          priority: 'high',
          analytics: { trackCompletion: true },
          ui: { theme: 'primary', showProgress: true },
        },
      })
      .addStep({
        id: 'step-2',
        title: 'Step 2',
        formConfig: mockForm2,
        metadata: {
          icon: 'credit-card',
          category: 'payment',
          priority: 'medium',
          analytics: { trackCompletion: false },
          ui: { theme: 'secondary', showProgress: false },
        },
      })
      .addStep({
        id: 'step-3',
        title: 'Step 3',
        formConfig: mockForm3,
        // No metadata for this step
      })
      .build();
  };

  const createWrapper = (workflowConfig: any) => {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <WorkflowProvider workflowConfig={workflowConfig}>{children}</WorkflowProvider>;
    };
  };

  it('should return current step metadata', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    expect(result.current.current).toEqual({
      icon: 'user-circle',
      category: 'personal-info',
      priority: 'high',
      analytics: { trackCompletion: true },
      ui: { theme: 'primary', showProgress: true },
    });
  });

  it('should get metadata by step ID', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    // Test existing step with metadata
    expect(result.current.getByStepId('step-2')).toEqual({
      icon: 'credit-card',
      category: 'payment',
      priority: 'medium',
      analytics: { trackCompletion: false },
      ui: { theme: 'secondary', showProgress: false },
    });

    // Test step without metadata
    expect(result.current.getByStepId('step-3')).toBeUndefined();

    // Test non-existent step
    expect(result.current.getByStepId('non-existent')).toBeUndefined();
  });

  it('should get metadata by step index', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    // Test first step
    expect(result.current.getByStepIndex(0)).toEqual({
      icon: 'user-circle',
      category: 'personal-info',
      priority: 'high',
      analytics: { trackCompletion: true },
      ui: { theme: 'primary', showProgress: true },
    });

    // Test step without metadata
    expect(result.current.getByStepIndex(2)).toBeUndefined();

    // Test out of bounds
    expect(result.current.getByStepIndex(10)).toBeUndefined();
  });

  it('should check if current step has specific metadata key', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    expect(result.current.hasCurrentKey('icon')).toBe(true);
    expect(result.current.hasCurrentKey('category')).toBe(true);
    expect(result.current.hasCurrentKey('nonexistent')).toBe(false);
  });

  it('should get current metadata value with default', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    // Test existing key
    expect(result.current.getCurrentValue('icon')).toBe('user-circle');
    expect(result.current.getCurrentValue('priority')).toBe('high');

    // Test non-existent key with default
    expect(result.current.getCurrentValue('nonexistent', 'default-value')).toBe('default-value');

    // Test complex values
    expect(result.current.getCurrentValue('analytics')).toEqual({ trackCompletion: true });
  });

  it('should get all steps metadata', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    const allSteps = result.current.getAllStepsMetadata();

    expect(allSteps).toHaveLength(3);
    expect(allSteps[0]).toEqual({
      id: 'step-1',
      title: 'Step 1',
      index: 0,
      metadata: {
        icon: 'user-circle',
        category: 'personal-info',
        priority: 'high',
        analytics: { trackCompletion: true },
        ui: { theme: 'primary', showProgress: true },
      },
    });
    expect(allSteps[2]).toEqual({
      id: 'step-3',
      title: 'Step 3',
      index: 2,
      metadata: undefined,
    });
  });

  it('should find steps by metadata criteria', () => {
    const workflowConfig = createWorkflowWithMetadata();
    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    // Find high priority steps
    const highPrioritySteps = result.current.findStepsByMetadata(
      (metadata) => metadata?.priority === 'high'
    );
    expect(highPrioritySteps).toEqual(['step-1']);

    // Find steps with analytics tracking enabled
    const analyticsSteps = result.current.findStepsByMetadata(
      (metadata) => metadata?.analytics?.trackCompletion === true
    );
    expect(analyticsSteps).toEqual(['step-1']);

    // Find steps with primary theme
    const primaryThemeSteps = result.current.findStepsByMetadata(
      (metadata) => metadata?.ui?.theme === 'primary'
    );
    expect(primaryThemeSteps).toEqual(['step-1']);

    // Find steps without metadata
    const stepsWithoutMetadata = result.current.findStepsByMetadata(
      (metadata) => metadata === undefined
    );
    expect(stepsWithoutMetadata).toEqual(['step-3']);
  });

  it('should handle workflow with no metadata', () => {
    const workflowConfig = flow
      .create(mockRilConfig, 'simple-workflow', 'Simple Workflow')
      .addStep({
        id: 'simple-step',
        title: 'Simple Step',
        formConfig: mockForm1,
        // No metadata
      })
      .build();

    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    expect(result.current.current).toBeUndefined();
    expect(result.current.hasCurrentKey('anything')).toBe(false);
    expect(result.current.getCurrentValue('anything', 'default')).toBe('default');
  });

  it('should handle empty workflow', () => {
    const workflowConfig = flow
      .create(mockRilConfig, 'empty-workflow', 'Empty Workflow')
      .addStep({
        id: 'only-step',
        title: 'Only Step',
        formConfig: mockForm1,
        metadata: {},
      })
      .build();

    const wrapper = createWrapper(workflowConfig);

    const { result } = renderHook(() => useStepMetadata(), { wrapper });

    expect(result.current.current).toEqual({});
    expect(result.current.hasCurrentKey('anything')).toBe(false);
    expect(result.current.getCurrentValue('anything', 'default')).toBe('default');
  });
});
