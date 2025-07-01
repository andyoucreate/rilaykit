import React from 'react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src/config/ril';

const TestComponent = () => React.createElement('div', null, 'test');
const TestRenderer = () => React.createElement('div', null, 'renderer');
const TestFormRowRenderer = () => React.createElement('div', null, 'form-row');
const TestFormBodyRenderer = () => React.createElement('div', null, 'form-body');
const TestWorkflowStepperRenderer = () => React.createElement('div', null, 'workflow-stepper');
const TestWorkflowNavRenderer = () => React.createElement('div', null, 'workflow-nav');

describe('RilayConfig', () => {
  describe('Basic Configuration', () => {
    it('should create an empty config', () => {
      const config = ril.create();

      expect(config).toBeInstanceOf(ril);
      expect(config.getComponent('test-id')).toBeUndefined();
      expect(config.getAllComponents()).toHaveLength(0);
    });

    it('should add a component configuration', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
      });

      const component = config.getComponentsBySubType('text')[0];
      expect(component).toBeDefined();
      expect(component.type).toBe('input');
      expect(component.subType).toBe('text');
      expect(component.name).toBe('Text Input');
      expect(component.renderer).toBe(TestComponent);
    });

    it('should allow method chaining', () => {
      const config = ril
        .create()
        .addComponent('text', { type: 'input', name: 'Text Input', renderer: TestComponent })
        .addComponent('email', { type: 'input', name: 'Email Input', renderer: TestRenderer });

      const textComponents = config.getComponentsBySubType('text');
      const emailComponents = config.getComponentsBySubType('email');

      expect(textComponents).toHaveLength(1);
      expect(emailComponents).toHaveLength(1);
      expect(textComponents[0].renderer).toBe(TestComponent);
      expect(emailComponents[0].renderer).toBe(TestRenderer);
    });

    it('should generate unique IDs for components', () => {
      const config = ril.create();

      config.addComponent('text', {
        type: 'input',
        name: 'Text Input 1',
        renderer: TestComponent,
      });

      config.addComponent('text', {
        type: 'input',
        name: 'Text Input 2',
        renderer: TestComponent,
      });

      const components = config.getComponentsBySubType('text');
      expect(components).toHaveLength(1);
      expect(components[0].name).toBe('Text Input 2');
    });

    it('should use custom ID when provided', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        id: 'custom-text-input',
      });

      const component = config.getComponent('custom-text-input');
      expect(component).toBeDefined();
      expect(component?.id).toBe('custom-text-input');
    });

    it('should support default props', () => {
      const defaultProps = { placeholder: 'Enter text...', required: true };

      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps,
      });

      const component = config.getComponentsBySubType('text')[0];
      expect(component.defaultProps).toEqual(defaultProps);
    });

    it('should support categories', () => {
      const config = ril
        .create()
        .addComponent('text', {
          type: 'input',
          name: 'Text Input',
          renderer: TestComponent,
          category: 'basic-inputs',
        })
        .addComponent('email', {
          type: 'input',
          name: 'Email Input',
          renderer: TestRenderer,
          category: 'advanced-inputs',
        });

      const basicInputs = config.getComponentsByCategory('basic-inputs');
      const advancedInputs = config.getComponentsByCategory('advanced-inputs');

      expect(basicInputs).toHaveLength(1);
      expect(advancedInputs).toHaveLength(1);
      expect(basicInputs[0].subType).toBe('text');
      expect(advancedInputs[0].subType).toBe('email');
    });
  });

  describe('Component Management', () => {
    it('should get components by type', () => {
      const config = ril
        .create()
        .addComponent('text', { type: 'input', name: 'Text Input', renderer: TestComponent })
        .addComponent('heading', { type: 'layout', name: 'Heading', renderer: TestRenderer });

      const inputComponents = config.getComponentsByType('input');
      const layoutComponents = config.getComponentsByType('layout');

      expect(inputComponents).toHaveLength(1);
      expect(layoutComponents).toHaveLength(1);
      expect(inputComponents[0].subType).toBe('text');
      expect(layoutComponents[0].subType).toBe('heading');
    });

    it('should check if component exists', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        id: 'test-text-input',
      });

      expect(config.hasComponent('test-text-input')).toBe(true);
      expect(config.hasComponent('non-existent')).toBe(false);
    });

    it('should remove components', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        id: 'test-text-input',
      });

      expect(config.hasComponent('test-text-input')).toBe(true);
      const removed = config.removeComponent('test-text-input');
      expect(removed).toBe(true);
      expect(config.hasComponent('test-text-input')).toBe(false);
    });

    it('should clear all components', () => {
      const config = ril
        .create()
        .addComponent('text', { type: 'input', name: 'Text Input', renderer: TestComponent })
        .addComponent('email', { type: 'input', name: 'Email Input', renderer: TestRenderer });

      expect(config.getAllComponents()).toHaveLength(2);
      config.clear();
      expect(config.getAllComponents()).toHaveLength(0);
    });
  });

  describe('Form Renderers', () => {
    it('should set custom row renderer', () => {
      const config = ril.create().setRowRenderer(TestFormRowRenderer);

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.rowRenderer).toBe(TestFormRowRenderer);
    });

    it('should set custom body renderer', () => {
      const config = ril.create().setBodyRenderer(TestFormBodyRenderer);

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.bodyRenderer).toBe(TestFormBodyRenderer);
    });

    it('should set custom submit button renderer', () => {
      const config = ril.create().setSubmitButtonRenderer(TestRenderer);

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.submitButtonRenderer).toBe(TestRenderer);
    });

    it('should set complete form render configuration', () => {
      const formRenderConfig = {
        rowRenderer: TestFormRowRenderer,
        bodyRenderer: TestFormBodyRenderer,
        submitButtonRenderer: TestRenderer,
      };

      const config = ril.create().setFormRenderConfig(formRenderConfig);

      expect(config.getFormRenderConfig()).toEqual(formRenderConfig);
    });

    it('should support deprecated setRenderConfig method', () => {
      const renderConfig = {
        rowRenderer: TestFormRowRenderer,
        bodyRenderer: TestFormBodyRenderer,
      };

      const config = ril.create().setRenderConfig(renderConfig);

      expect(config.getFormRenderConfig()).toEqual(renderConfig);
    });
  });

  describe('Workflow Renderers', () => {
    it('should set custom stepper renderer', () => {
      const config = ril.create().setStepperRenderer(TestWorkflowStepperRenderer);

      const renderConfig = config.getWorkflowRenderConfig();
      expect(renderConfig.stepperRenderer).toBe(TestWorkflowStepperRenderer);
    });

    it('should set custom workflow navigation renderer', () => {
      const config = ril.create().setWorkflowNavigationRenderer(TestWorkflowNavRenderer);

      const renderConfig = config.getWorkflowRenderConfig();
      expect(renderConfig.navigationRenderer).toBe(TestWorkflowNavRenderer);
    });

    it('should set complete workflow render configuration', () => {
      const workflowRenderConfig = {
        stepperRenderer: TestWorkflowStepperRenderer,
        navigationRenderer: TestWorkflowNavRenderer,
      };

      const config = ril.create().setWorkflowRenderConfig(workflowRenderConfig);

      expect(config.getWorkflowRenderConfig()).toEqual(workflowRenderConfig);
    });
  });

  describe('Statistics', () => {
    it('should get stats correctly', () => {
      const config = ril
        .create()
        .addComponent('text', {
          type: 'input',
          name: 'Text Input',
          renderer: TestComponent,
          category: 'basic',
        })
        .addComponent('email', {
          type: 'input',
          name: 'Email Input',
          renderer: TestRenderer,
          category: 'basic',
        })
        .addComponent('heading', {
          type: 'layout',
          name: 'Heading',
          renderer: TestComponent,
          category: 'layout',
        })
        .setRowRenderer(TestFormRowRenderer)
        .setStepperRenderer(TestWorkflowStepperRenderer);

      const stats = config.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.input).toBe(2);
      expect(stats.byType.layout).toBe(1);
      expect(stats.bySubType.text).toBe(1);
      expect(stats.bySubType.email).toBe(1);
      expect(stats.bySubType.heading).toBe(1);
      expect(stats.byCategory.basic).toBe(2);
      expect(stats.byCategory.layout).toBe(1);
      expect(stats.hasCustomRenderers.row).toBe(true);
      expect(stats.hasCustomRenderers.body).toBe(false);
      expect(stats.hasCustomRenderers.stepper).toBe(true);
      expect(stats.hasCustomRenderers.workflowNavigation).toBe(false);
    });

    it('should handle uncategorized components in stats', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        // No category provided
      });

      const stats = config.getStats();
      expect(stats.byCategory.uncategorized).toBe(1);
    });
  });

  describe('Import/Export', () => {
    it('should export configuration', () => {
      const config = ril
        .create()
        .addComponent('text', {
          type: 'input',
          name: 'Text Input',
          renderer: TestComponent,
          id: 'text-1',
        })
        .addComponent('email', {
          type: 'input',
          name: 'Email Input',
          renderer: TestRenderer,
          id: 'email-1',
        });

      const exported = config.export();
      expect(Object.keys(exported)).toHaveLength(2);
      expect(exported['text-1']).toBeDefined();
      expect(exported['email-1']).toBeDefined();
    });

    it('should import configuration', () => {
      const config1 = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
        id: 'text-1',
      });

      const exported = config1.export();

      const config2 = ril.create().import(exported);
      expect(config2.hasComponent('text-1')).toBe(true);
      expect(config2.getAllComponents()).toHaveLength(1);
    });
  });

  describe('Validation', () => {
    it('should validate configuration without errors', () => {
      const config = ril.create().addComponent('text', {
        type: 'input',
        name: 'Text Input',
        renderer: TestComponent,
      });

      const errors = config.validate();
      expect(errors).toHaveLength(0);
    });

    it('should detect components without renderer', () => {
      const config = ril.create();
      // Manually add a component without renderer (this shouldn't happen in normal usage)
      config.import({
        'invalid-component': {
          id: 'invalid-component',
          type: 'input',
          subType: 'text',
          name: 'Invalid Component',
          renderer: undefined as any,
        },
      });

      const errors = config.validate();
      expect(errors).toContain('Components without renderer: invalid-component');
    });
  });
});
