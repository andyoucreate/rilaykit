// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flow } from '../../src/builders/flow';

describe('Flow Builder', () => {
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
      })
      .addComponent('select', {
        name: 'Select',
        renderer: () => React.createElement('select'),
        defaultProps: { label: '', options: [] },
      })
      .addComponent('textarea', {
        name: 'Textarea',
        renderer: () => React.createElement('textarea'),
        defaultProps: { label: '', rows: 3 },
      });

    sampleForm = form
      .create(rilConfig)
      .add({ type: 'text', props: { label: 'Name' } })
      .add({ type: 'email', props: { label: 'Email' } });
  });

  describe('constructor and static factory', () => {
    it('should create flow builder with constructor', () => {
      const builder = new flow(rilConfig as any, 'test-workflow', 'Test Workflow');
      expect(builder).toBeInstanceOf(flow);
    });

    it('should create flow builder with static create method', () => {
      const builder = flow.create(rilConfig as any, 'test-workflow', 'Test Workflow');
      expect(builder).toBeInstanceOf(flow);
    });

    it('should create with all parameters including description', () => {
      const builder = flow
        .create(rilConfig as any, 'test-id', 'Test Name', 'Test Description')
        .addStep({ title: 'Test Step', formConfig: sampleForm });
      const config = builder.build();

      expect(config.id).toBe('test-id');
      expect(config.name).toBe('Test Name');
      expect(config.description).toBe('Test Description');
    });

    it('should create without description', () => {
      const builder = flow
        .create(rilConfig as any, 'test-id', 'Test Name')
        .addStep({ title: 'Test Step', formConfig: sampleForm });
      const config = builder.build();

      expect(config.id).toBe('test-id');
      expect(config.name).toBe('Test Name');
      expect(config.description).toBeUndefined();
    });
  });

  describe('step addition', () => {
    describe('addStep method - single step', () => {
      it('should add single step with form builder', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'Personal Information',
          formConfig: sampleForm,
        });

        const config = builder.build();

        expect(config.steps).toHaveLength(1);
        expect(config.steps[0].title).toBe('Personal Information');
        expect(config.steps[0].formConfig).toBeDefined();
        expect(config.steps[0].formConfig.allFields).toHaveLength(2);
      });

      it('should add single step with built form configuration', () => {
        const formConfig = sampleForm.build();

        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'User Details',
          formConfig: formConfig,
        });

        const config = builder.build();

        expect(config.steps).toHaveLength(1);
        expect(config.steps[0].formConfig).toBe(formConfig);
      });

      it('should generate unique step IDs when not provided', () => {
        const builder = flow
          .create(rilConfig, 'test-workflow', 'Test')
          .addStep({
            title: 'Step 1',
            formConfig: sampleForm,
          })
          .addStep({
            title: 'Step 2',
            formConfig: sampleForm,
          });

        const config = builder.build();

        expect(config.steps).toHaveLength(2);
        expect(config.steps[0].id).toMatch(/^step-/);
        expect(config.steps[1].id).toMatch(/^step-/);
        expect(config.steps[0].id).not.toBe(config.steps[1].id);
      });

      it('should use provided step ID', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          id: 'custom-step',
          title: 'Custom Step',
          formConfig: sampleForm,
        });

        const config = builder.build();

        expect(config.steps[0].id).toBe('custom-step');
      });

      it('should handle step with description', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'User Information',
          description: 'Please enter your personal information',
          formConfig: sampleForm,
        });

        const config = builder.build();

        expect(config.steps[0].description).toBe('Please enter your personal information');
      });

      it('should handle step with allowSkip option', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'Optional Step',
          formConfig: sampleForm,
          allowSkip: true,
        });

        const config = builder.build();

        expect(config.steps[0].allowSkip).toBe(true);
      });

      it('should default allowSkip to false', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'Required Step',
          formConfig: sampleForm,
        });

        const config = builder.build();

        expect(config.steps[0].allowSkip).toBe(false);
      });

      it('should handle step with custom renderer', () => {
        const customRenderer = vi.fn();

        const builder = flow.create(rilConfig as any, 'test-workflow', 'Test').addStep({
          title: 'Custom Rendered Step',
          formConfig: sampleForm,
          renderer: customRenderer,
        });

        const config = builder.build();

        expect(config.steps[0].renderer).toBe(customRenderer);
      });

      it('should handle step with conditional behavior', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'Conditional Step',
          formConfig: sampleForm,
          conditions: {
            visible: { type: 'equals', field: 'userType', value: 'premium' },
            skippable: { type: 'equals', field: 'fastTrack', value: true },
          },
        });

        const config = builder.build();
        const step = config.steps[0];

        expect(step.conditions).toBeDefined();
        expect(step.conditions?.visible).toEqual({
          type: 'equals',
          field: 'userType',
          value: 'premium',
        });
        expect(step.conditions?.skippable).toEqual({
          type: 'equals',
          field: 'fastTrack',
          value: true,
        });
      });

      it('should handle step with after validation callback', () => {
        const afterValidationCallback = vi.fn();

        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
          title: 'Validated Step',
          formConfig: sampleForm,
          onAfterValidation: afterValidationCallback,
        });

        const config = builder.build();

        expect(config.steps[0].onAfterValidation).toBe(afterValidationCallback);
      });
    });

    describe('addStep method - multiple steps', () => {
      it('should add multiple steps at once', () => {
        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep([
          {
            title: 'Step 1',
            formConfig: sampleForm,
          },
          {
            title: 'Step 2',
            formConfig: sampleForm,
          },
          {
            title: 'Step 3',
            formConfig: sampleForm,
          },
        ]);

        const config = builder.build();

        expect(config.steps).toHaveLength(3);
        expect(config.steps[0].title).toBe('Step 1');
        expect(config.steps[1].title).toBe('Step 2');
        expect(config.steps[2].title).toBe('Step 3');
      });

      it('should handle mixed configuration types in multiple steps', () => {
        const formConfig = sampleForm.build();

        const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep([
          {
            title: 'Form Builder Step',
            formConfig: sampleForm,
          },
          {
            title: 'Built Config Step',
            formConfig: formConfig,
          },
        ]);

        const config = builder.build();

        expect(config.steps).toHaveLength(2);
        expect(config.steps[0].formConfig).toBeDefined();
        expect(config.steps[1].formConfig).toBe(formConfig);
      });

      it('should handle empty array', () => {
        const builder = flow.create(rilConfig as any, 'test-workflow', 'Test').addStep([]);

        // Should throw error when trying to build workflow with no steps
        expect(() => builder.build()).toThrow(
          'Workflow validation failed: Workflow must have at least one step'
        );
      });

      it('should work with method chaining', () => {
        const builder = flow
          .create(rilConfig, 'test-workflow', 'Test')
          .addStep([
            { title: 'Step 1', formConfig: sampleForm },
            { title: 'Step 2', formConfig: sampleForm },
          ])
          .addStep({
            title: 'Step 3',
            formConfig: sampleForm,
          });

        const config = builder.build();

        expect(config.steps).toHaveLength(3);
      });
    });
  });

  describe('workflow configuration', () => {
    it('should configure analytics', () => {
      const analytics = {
        trackStepTime: true,
        trackFieldInteractions: true,
        customEvents: ['custom-event'],
      };

      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm });

      // Access private method via prototype
      (builder as any).configure({ analytics });

      const config = builder.build();

      expect(config.analytics).toEqual(analytics);
    });

    it('should build with correct workflow properties', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test Workflow', 'A test workflow')
        .addStep({
          title: 'User Information',
          formConfig: sampleForm,
        });

      const config = builder.build();

      expect(config).toHaveProperty('id', 'test-workflow');
      expect(config).toHaveProperty('name', 'Test Workflow');
      expect(config).toHaveProperty('description', 'A test workflow');
      expect(config).toHaveProperty('steps');
      expect(config).toHaveProperty('analytics');
      expect(config).toHaveProperty('plugins');
      expect(config).toHaveProperty('renderConfig');

      expect(config.steps).toHaveLength(1);
      expect(config.plugins).toEqual([]);
    });

    it('should include ril render configuration', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm });

      const config = builder.build();

      expect(config.renderConfig).toBeDefined();
      // The renderConfig should come from rilConfig.getWorkflowRenderConfig()
    });
  });

  describe('plugin system', () => {
    it('should install plugin correctly', () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: [],
      };

      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm })
        .use(mockPlugin);

      const config = builder.build();

      expect(config.plugins).toContain(mockPlugin);
      expect(mockPlugin.install).toHaveBeenCalledWith(builder);
    });

    it('should handle multiple plugins', () => {
      const plugin1 = {
        name: 'plugin-1',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: [],
      };

      const plugin2 = {
        name: 'plugin-2',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: [],
      };

      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm })
        .use(plugin1)
        .use(plugin2);

      const config = builder.build();

      expect(config.plugins).toHaveLength(2);
      expect(config.plugins).toContain(plugin1);
      expect(config.plugins).toContain(plugin2);
    });

    it('should throw error if plugin installation fails', () => {
      const faultyPlugin = {
        name: 'faulty-plugin',
        version: '1.0.0',
        install: vi.fn(() => {
          throw new Error('Plugin installation failed');
        }),
        dependencies: [],
      };

      const builder = flow.create(rilConfig, 'test-workflow', 'Test');

      expect(() => {
        builder.use(faultyPlugin);
      }).toThrow('Failed to install plugin "faulty-plugin": Plugin installation failed');
    });

    it('should validate plugin dependencies', () => {
      const dependentPlugin = {
        name: 'dependent-plugin',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: ['missing-plugin'],
      };

      const builder = flow.create(rilConfig as any, 'test-workflow', 'Test');

      // Should throw error when plugin has missing dependencies
      expect(() => {
        builder.use(dependentPlugin);
      }).toThrow('Plugin "dependent-plugin" requires missing dependencies: missing-plugin');
    });
  });

  describe('workflow validation and building', () => {
    it('should validate workflow before building', () => {
      const builder = flow.create(rilConfig as any, 'test-workflow', 'Test');

      // Empty workflow should be invalid (requires at least one step)
      expect(() => builder.build()).toThrow(
        'Workflow validation failed: Workflow must have at least one step'
      );
    });

    it('should build workflow with steps', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({
          title: 'Step 1',
          formConfig: sampleForm,
        })
        .addStep({
          title: 'Step 2',
          formConfig: sampleForm,
        });

      const config = builder.build();

      expect(config.steps).toHaveLength(2);
      expect(config.steps[0].title).toBe('Step 1');
      expect(config.steps[1].title).toBe('Step 2');
    });

    it('should maintain builder state across multiple operations', () => {
      const builder = flow.create(rilConfig, 'stateful-workflow', 'Stateful Test');

      // Add step
      builder.addStep({ title: 'Step 1', formConfig: sampleForm });

      let config = builder.build();
      expect(config.steps).toHaveLength(1);

      // Add more steps
      builder.addStep([
        { title: 'Step 2', formConfig: sampleForm },
        { title: 'Step 3', formConfig: sampleForm },
      ]);

      config = builder.build();
      expect(config.steps).toHaveLength(3);

      // Add plugin
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: [],
      };
      builder.use(plugin);

      config = builder.build();
      expect(config.steps).toHaveLength(3);
      expect(config.plugins).toHaveLength(1);
    });

    it('should handle multiple builds from same builder instance', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Test Step', formConfig: sampleForm });

      const config1 = builder.build();
      const config2 = builder.build();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });

  describe('complex workflow scenarios', () => {
    it('should handle multi-step workflow with different configurations', () => {
      const personalForm = form
        .create(rilConfig)
        .add({ type: 'text', props: { label: 'First Name' } })
        .add({ type: 'text', props: { label: 'Last Name' } });

      const contactForm = form
        .create(rilConfig)
        .add({ type: 'email', props: { label: 'Email' } })
        .add({ type: 'text', props: { label: 'Phone' } });

      const preferencesForm = form.create(rilConfig).add({
        type: 'select',
        props: {
          label: 'Preferred Contact Method',
          options: [
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
          ],
        },
      });

      const builder = flow
        .create(rilConfig, 'onboarding', 'User Onboarding', 'Complete user onboarding process')
        .addStep({
          id: 'personal',
          title: 'Personal Information',
          description: 'Enter your personal details',
          formConfig: personalForm,
        })
        .addStep({
          id: 'contact',
          title: 'Contact Information',
          description: 'How can we reach you?',
          formConfig: contactForm,
        })
        .addStep({
          id: 'preferences',
          title: 'Preferences',
          description: 'Set your preferences',
          formConfig: preferencesForm,
          allowSkip: true,
          conditions: {
            visible: { type: 'equals', field: 'showPreferences', value: true },
          },
        });

      const config = builder.build();

      expect(config.id).toBe('onboarding');
      expect(config.name).toBe('User Onboarding');
      expect(config.description).toBe('Complete user onboarding process');
      expect(config.steps).toHaveLength(3);

      expect(config.steps[0].id).toBe('personal');
      expect(config.steps[0].allowSkip).toBe(false);

      expect(config.steps[2].id).toBe('preferences');
      expect(config.steps[2].allowSkip).toBe(true);
      expect(config.steps[2].conditions?.visible).toEqual({
        type: 'equals',
        field: 'showPreferences',
        value: true,
      });
    });

    it('should handle workflow with plugins and analytics', () => {
      const analyticsPlugin = {
        name: 'analytics-plugin',
        version: '1.0.0',
        install: vi.fn(),
        dependencies: [],
      };

      const analytics = {
        trackStepTime: true,
        trackFieldInteractions: false,
        customEvents: ['step-completed', 'workflow-abandoned'],
      };

      const builder = flow
        .create(rilConfig, 'tracked-workflow', 'Tracked Workflow')
        .addStep({
          title: 'Step 1',
          formConfig: sampleForm,
        })
        .use(analyticsPlugin);

      // Configure analytics
      (builder as any).configure({ analytics });

      const config = builder.build();

      expect(config.analytics).toEqual(analytics);
      expect(config.plugins).toContain(analyticsPlugin);
      expect(analyticsPlugin.install).toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle workflow with no steps', () => {
      const builder = flow.create(rilConfig as any, 'empty-workflow', 'Empty');

      // Should throw error when trying to build workflow with no steps
      expect(() => builder.build()).toThrow(
        'Workflow validation failed: Workflow must have at least one step'
      );
    });

    it('should handle steps with minimal configuration', () => {
      const minimalForm = form.create(rilConfig);

      const builder = flow.create(rilConfig, 'minimal-workflow', 'Minimal').addStep({
        title: 'Minimal Step',
        formConfig: minimalForm,
      });

      const config = builder.build();

      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].title).toBe('Minimal Step');
      expect(config.steps[0].formConfig.allFields).toHaveLength(0);
    });

    it('should handle null/undefined descriptions', () => {
      const builder1 = flow.create(rilConfig as any, 'test-1', 'Test 1', undefined);
      const builder2 = flow.create(rilConfig as any, 'test-2', 'Test 2');

      // Add steps to satisfy validation
      builder1.addStep({ title: 'Step 1', formConfig: sampleForm });
      builder2.addStep({ title: 'Step 1', formConfig: sampleForm });

      const config1 = builder1.build();
      const config2 = builder2.build();

      expect(config1.description).toBeUndefined();
      expect(config2.description).toBeUndefined();
    });

    it('should handle step with all optional properties undefined', () => {
      const builder = flow.create(rilConfig, 'test-workflow', 'Test').addStep({
        title: 'Basic Step',
        formConfig: sampleForm,
        description: undefined,
        allowSkip: undefined,
        renderer: undefined,
        conditions: undefined,
      });

      const config = builder.build();
      const step = config.steps[0];

      expect(step.title).toBe('Basic Step');
      expect(step.description).toBeUndefined();
      expect(step.allowSkip).toBe(false); // Should default to false
      expect(step.renderer).toBeUndefined();
      expect(step.conditions).toBeUndefined();
    });
  });

  describe('integration with ril configuration', () => {
    it('should reference the same ril config instance', () => {
      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm });

      const config = builder.build();

      // The config should be available via renderConfig
      expect(config.renderConfig).toBeDefined();
    });

    it('should work with form builders from the same ril config', () => {
      const anotherForm = form
        .create(rilConfig)
        .add({ type: 'textarea', props: { label: 'Comments', rows: 5 } });

      const builder = flow
        .create(rilConfig, 'test-workflow', 'Test')
        .addStep({ title: 'Step 1', formConfig: sampleForm })
        .addStep({ title: 'Step 2', formConfig: anotherForm });

      const config = builder.build();

      expect(config.steps).toHaveLength(2);
      expect(config.steps[0].formConfig.allFields).toHaveLength(2); // text + email
      expect(config.steps[1].formConfig.allFields).toHaveLength(1); // textarea
    });
  });
});
