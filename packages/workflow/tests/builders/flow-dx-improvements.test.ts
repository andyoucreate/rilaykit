// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';
import type { StepContext, StepMetadata } from '../../src/context/step-context';

describe('Flow Builder - DX Improvements', () => {
  let rilConfig: any;
  let sampleForm: any;

  beforeEach(() => {
    rilConfig = ril
      .create<any>()
      .addComponent('text', {
        name: 'Text Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', placeholder: 'Enter text' },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: () => React.createElement('input'),
        defaultProps: { label: '', required: false },
      });

    sampleForm = form
      .create(rilConfig)
      .add({ type: 'text', props: { label: 'Name' } })
      .add({ type: 'email', props: { label: 'Email' } });
  });

  describe('.step() alias', () => {
    it('should add single step using .step() alias', () => {
      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Personal Information',
        formConfig: sampleForm,
      });

      const config = builder.build();

      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].title).toBe('Personal Information');
    });

    it('should add multiple steps using .step() alias with array', () => {
      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step([
        { title: 'Step 1', formConfig: sampleForm },
        { title: 'Step 2', formConfig: sampleForm },
      ]);

      const config = builder.build();

      expect(config.steps).toHaveLength(2);
      expect(config.steps[0].title).toBe('Step 1');
      expect(config.steps[1].title).toBe('Step 2');
    });

    it('should be functionally identical to .addStep()', () => {
      const builder1 = flow
        .create(rilConfig, 'test-1', 'Test 1')
        .addStep({ title: 'Step', formConfig: sampleForm });

      const builder2 = flow
        .create(rilConfig, 'test-2', 'Test 2')
        .step({ title: 'Step', formConfig: sampleForm });

      const config1 = builder1.build();
      const config2 = builder2.build();

      expect(config1.steps[0].title).toBe(config2.steps[0].title);
      expect(config1.steps[0].formConfig.allFields.length).toBe(
        config2.steps[0].formConfig.allFields.length
      );
    });

    it('should support method chaining with .step()', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .step({ title: 'Step 1', formConfig: sampleForm })
        .step({ title: 'Step 2', formConfig: sampleForm })
        .addStep({ title: 'Step 3', formConfig: sampleForm });

      const config = builder.build();

      expect(config.steps).toHaveLength(3);
      expect(config.steps[0].title).toBe('Step 1');
      expect(config.steps[1].title).toBe('Step 2');
      expect(config.steps[2].title).toBe('Step 3');
    });
  });

  describe('after() callback with StepContext', () => {
    it('should accept after callback with StepContext parameter', () => {
      const afterCallback = vi.fn();

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Validated Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      expect(config.steps[0].onAfterValidation).toBeDefined();
      expect(typeof config.steps[0].onAfterValidation).toBe('function');
    });

    it('should transform after callback to onAfterValidation format', () => {
      const afterCallback = vi.fn((_step: StepContext) => {
        // This should receive a StepContext
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        id: 'test-step',
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      // Simulate calling the transformed callback
      const mockStepData = { name: 'John', email: 'john@example.com' };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: true,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      // Should have been called once with StepContext
      expect(afterCallback).toHaveBeenCalledTimes(1);
      expect(afterCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockStepData,
          next: expect.any(Object),
          workflow: expect.any(Object),
          meta: expect.any(Object),
          isFirst: true,
          isLast: false,
        })
      );
    });

    it('should provide step.next.prefill() method', () => {
      let capturedStep: StepContext | null = null;

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = { userType: 'business' };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(capturedStep?.next).toBeDefined();
      expect(typeof capturedStep?.next.prefill).toBe('function');

      // Test prefill functionality
      capturedStep?.next.prefill({ companyName: 'Acme Corp' });
      expect(mockHelper.setNextStepFields).toHaveBeenCalledWith({ companyName: 'Acme Corp' });
    });

    it('should provide step.workflow.get() method', () => {
      let capturedStep: StepContext | null = null;

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = { userType: 'business' };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn().mockReturnValue({ name: 'John', email: 'john@example.com' }),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(capturedStep?.workflow).toBeDefined();
      expect(typeof capturedStep?.workflow.get).toBe('function');

      // Test get functionality
      capturedStep?.workflow.get('previous-step');
      expect(mockHelper.getStepData).toHaveBeenCalledWith('previous-step');
    });

    it('should provide step.workflow.all() method', () => {
      let capturedStep: StepContext | null = null;

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = { userType: 'business' };
      const mockAllData = {
        step1: { name: 'John' },
        step2: { email: 'john@example.com' },
      };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn().mockReturnValue(mockAllData),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(typeof capturedStep?.workflow.all).toBe('function');

      // Test all functionality
      const allData = capturedStep?.workflow.all();
      expect(allData).toEqual(mockAllData);
      expect(mockHelper.getAllData).toHaveBeenCalled();
    });

    it('should provide step.data with current step data', () => {
      let capturedStep: StepContext | null = null;

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = { name: 'John', email: 'john@example.com' };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: true,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(capturedStep?.data).toEqual(mockStepData);
    });

    it('should provide step.isFirst and step.isLast flags', () => {
      let capturedStep: StepContext | null = null;

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Test Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = { name: 'John' };
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: true,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(capturedStep?.isFirst).toBe(true);
      expect(capturedStep?.isLast).toBe(false);
    });
  });

  describe('StepMetadata type', () => {
    it('should accept metadata with icon, category, and tags', () => {
      const metadata: StepMetadata = {
        icon: 'user',
        category: 'personal',
        tags: ['onboarding', 'required'],
      };

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'User Info',
        formConfig: sampleForm,
        metadata,
      });

      const config = builder.build();

      expect(config.steps[0].metadata).toEqual(metadata);
      expect(config.steps[0].metadata?.icon).toBe('user');
      expect(config.steps[0].metadata?.category).toBe('personal');
      expect(config.steps[0].metadata?.tags).toEqual(['onboarding', 'required']);
    });

    it('should accept metadata with custom fields', () => {
      const metadata: StepMetadata = {
        icon: 'payment',
        customField: 'custom value',
        nestedObject: { key: 'value' },
      };

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Payment',
        formConfig: sampleForm,
        metadata,
      });

      const config = builder.build();

      expect(config.steps[0].metadata).toEqual(metadata);
      expect(config.steps[0].metadata?.customField).toBe('custom value');
      expect(config.steps[0].metadata?.nestedObject).toEqual({ key: 'value' });
    });

    it('should pass metadata to StepContext in after callback', () => {
      let capturedStep: StepContext | null = null;

      const metadata: StepMetadata = {
        icon: 'check',
        category: 'validation',
        tags: ['final'],
      };

      const afterCallback = vi.fn((step: StepContext) => {
        capturedStep = step;
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Final Step',
        formConfig: sampleForm,
        metadata,
        after: afterCallback,
      });

      const config = builder.build();

      const mockStepData = {};
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: true,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      expect(capturedStep).not.toBeNull();
      expect(capturedStep?.meta).toEqual(metadata);
      expect(capturedStep?.meta.icon).toBe('check');
      expect(capturedStep?.meta.category).toBe('validation');
    });
  });

  describe('backward compatibility', () => {
    it('should still support onAfterValidation callback', () => {
      const onAfterValidationCallback = vi.fn();

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Legacy Step',
        formConfig: sampleForm,
        onAfterValidation: onAfterValidationCallback,
      });

      const config = builder.build();

      expect(config.steps[0].onAfterValidation).toBe(onAfterValidationCallback);
    });

    it('should prioritize after over onAfterValidation when both are provided', () => {
      const afterCallback = vi.fn();
      const onAfterValidationCallback = vi.fn();

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Both Callbacks Step',
        formConfig: sampleForm,
        after: afterCallback,
        onAfterValidation: onAfterValidationCallback,
      });

      const config = builder.build();

      // Should use the 'after' callback (transformed version)
      expect(config.steps[0].onAfterValidation).toBeDefined();

      const mockStepData = {};
      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: false,
      };

      config.steps[0].onAfterValidation?.(mockStepData, mockHelper, mockContext);

      // 'after' should have been called, not 'onAfterValidation'
      expect(afterCallback).toHaveBeenCalled();
      expect(onAfterValidationCallback).not.toHaveBeenCalled();
    });

    it('should work with .addStep() and old API', () => {
      const onAfterValidationCallback = vi.fn();

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
        title: 'Legacy Step',
        formConfig: sampleForm,
        onAfterValidation: onAfterValidationCallback,
      });

      const config = builder.build();

      expect(config.steps[0].onAfterValidation).toBe(onAfterValidationCallback);
    });

    it('should allow mixing .step() and .addStep() with different callback styles', () => {
      const afterCallback = vi.fn();
      const onAfterValidationCallback = vi.fn();

      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .step({
          title: 'New API Step',
          formConfig: sampleForm,
          after: afterCallback,
        })
        .addStep({
          title: 'Old API Step',
          formConfig: sampleForm,
          onAfterValidation: onAfterValidationCallback,
        });

      const config = builder.build();

      expect(config.steps).toHaveLength(2);
      expect(config.steps[0].onAfterValidation).toBeDefined();
      expect(config.steps[1].onAfterValidation).toBe(onAfterValidationCallback);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle conditional logic in after callback', () => {
      const afterCallback = vi.fn((step: StepContext) => {
        if (step.data.userType === 'business') {
          step.next.prefill({
            companyName: '',
            taxId: '',
          });
        } else if (step.data.userType === 'freelance') {
          step.next.prefill({
            skills: [],
          });
        }
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'User Type',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: true,
        isLastStep: false,
      };

      // Test business user type
      config.steps[0].onAfterValidation?.(
        { userType: 'business' },
        mockHelper,
        mockContext
      );

      expect(mockHelper.setNextStepFields).toHaveBeenCalledWith({
        companyName: '',
        taxId: '',
      });

      mockHelper.setNextStepFields.mockClear();

      // Test freelance user type
      config.steps[0].onAfterValidation?.(
        { userType: 'freelance' },
        mockHelper,
        mockContext
      );

      expect(mockHelper.setNextStepFields).toHaveBeenCalledWith({
        skills: [],
      });
    });

    it('should handle async after callback', async () => {
      const afterCallback = vi.fn(async (step: StepContext) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        step.next.prefill({ processed: true });
      });

      const builder = flow.create(rilConfig, 'test-workflow', 'Test').step({
        title: 'Async Step',
        formConfig: sampleForm,
        after: afterCallback,
      });

      const config = builder.build();

      const mockHelper = {
        setNextStepFields: vi.fn(),
        getStepData: vi.fn(),
        getAllData: vi.fn(),
      };
      const mockContext = {
        isFirstStep: false,
        isLastStep: false,
      };

      await config.steps[0].onAfterValidation?.({}, mockHelper, mockContext);

      expect(afterCallback).toHaveBeenCalled();
      expect(mockHelper.setNextStepFields).toHaveBeenCalledWith({ processed: true });
    });
  });
});
