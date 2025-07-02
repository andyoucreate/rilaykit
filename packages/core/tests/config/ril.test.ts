import React from 'react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src/config/ril';

const TestComponent = () => React.createElement('div', null, 'test');
const TestRenderer = () => React.createElement('div', null, 'renderer');
const TestFormRowRenderer = () => React.createElement('div', null, 'form-row');
const TestFormBodyRenderer = () => React.createElement('div', null, 'form-body');
const TestWorkflowStepperRenderer = () => React.createElement('div', null, 'workflow-stepper');
const TestWorkflowNavRenderer = () => React.createElement('div', null, 'workflow-nav');

describe('ril', () => {
  describe('Basic Configuration', () => {
    it('should create an empty config', () => {
      const config = ril.create();

      expect(config).toBeInstanceOf(ril);
      expect(config.getComponent('text')).toBeUndefined();
      expect(config.getAllComponents()).toHaveLength(0);
    });

    it('should add a component configuration', () => {
      const config = ril.create().addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      const component = config.getComponent('text');
      expect(component).toBeDefined();
      expect(component?.type).toBe('text');
      expect(component?.name).toBe('Text Input');
      expect(component?.renderer).toBe(TestComponent);
    });

    it('should allow method chaining', () => {
      const config = ril
        .create()
        .addComponent('text', { name: 'Text Input', renderer: TestComponent })
        .addComponent('email', { name: 'Email Input', renderer: TestRenderer });

      const textComponent = config.getComponent('text');
      const emailComponent = config.getComponent('email');

      expect(textComponent).toBeDefined();
      expect(emailComponent).toBeDefined();
    });

    it('should overwrite component with the same type', () => {
      const config = ril
        .create()
        .addComponent('text', {
          name: 'Text Input 1',
          renderer: TestComponent,
        })
        .addComponent('text', {
          name: 'Text Input 2',
          renderer: TestRenderer,
        });

      const components = config.getAllComponents();
      const component = config.getComponent('text');
      expect(components).toHaveLength(1);
      expect(component?.name).toBe('Text Input 2');
      expect(component?.renderer).toBe(TestRenderer);
    });

    it('should support default props', () => {
      const defaultProps = { placeholder: 'Enter text...', required: true };

      const config = ril.create().addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps,
      });

      const component = config.getComponent('text');
      expect(component?.defaultProps).toEqual(defaultProps);
    });

    it('should support categories', () => {
      const config = ril
        .create()
        .addComponent('text', {
          name: 'Text Input',
          renderer: TestComponent,
          category: 'basic-inputs',
        })
        .addComponent('email', {
          name: 'Email Input',
          renderer: TestRenderer,
          category: 'advanced-inputs',
        });

      const basicInputs = config.getComponentsByCategory('basic-inputs');
      const advancedInputs = config.getComponentsByCategory('advanced-inputs');

      expect(basicInputs).toHaveLength(1);
      expect(advancedInputs).toHaveLength(1);
      expect(basicInputs[0].type).toBe('text');
      expect(advancedInputs[0].type).toBe('email');
    });
  });

  describe('Component Management', () => {
    it('should get components by category', () => {
      const config = ril
        .create()
        .addComponent('text', { name: 'Text Input', renderer: TestComponent, category: 'input' })
        .addComponent('heading', { name: 'Heading', renderer: TestRenderer, category: 'layout' });

      const inputComponents = config.getComponentsByCategory('input');
      const layoutComponents = config.getComponentsByCategory('layout');

      expect(inputComponents).toHaveLength(1);
      expect(layoutComponents).toHaveLength(1);
      expect(inputComponents[0].type).toBe('text');
      expect(layoutComponents[0].type).toBe('heading');
    });

    it('should check if component exists', () => {
      const config = ril.create().addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      expect(config.hasComponent('text')).toBe(true);
      expect(config.hasComponent('non-existent')).toBe(false);
    });

    it('should remove components', () => {
      const config = ril.create().addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      expect(config.hasComponent('text')).toBe(true);
      const removed = config.removeComponent('text');
      expect(removed).toBe(true);
      expect(config.hasComponent('text')).toBe(false);
    });

    it('should clear all components', () => {
      const config = ril
        .create()
        .addComponent('text', { name: 'Text Input', renderer: TestComponent })
        .addComponent('email', { name: 'Email Input', renderer: TestRenderer });

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
          name: 'Text Input',
          renderer: TestComponent,
          category: 'basic',
        })
        .addComponent('email', {
          name: 'Email Input',
          renderer: TestRenderer,
          category: 'basic',
        })
        .addComponent('heading', {
          name: 'Heading',
          renderer: TestComponent,
          category: 'layout',
        })
        .setRowRenderer(TestFormRowRenderer)
        .setStepperRenderer(TestWorkflowStepperRenderer);

      const stats = config.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.text).toBe(1);
      expect(stats.byType.email).toBe(1);
      expect(stats.byType.heading).toBe(1);
      expect(stats.byCategory.basic).toBe(2);
      expect(stats.byCategory.layout).toBe(1);
      expect(stats.hasCustomRenderers.row).toBe(true);
      expect(stats.hasCustomRenderers.body).toBe(false);
      expect(stats.hasCustomRenderers.stepper).toBe(true);
      expect(stats.hasCustomRenderers.workflowNavigation).toBe(false);
    });

    it('should handle uncategorized components in stats', () => {
      const config = ril.create().addComponent('text', {
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
          name: 'Text Input',
          renderer: TestComponent,
        })
        .addComponent('email', {
          name: 'Email Input',
          renderer: TestRenderer,
        });

      const exported = config.export();
      expect(Object.keys(exported)).toHaveLength(2);
      expect(exported.text).toBeDefined();
      expect(exported.email).toBeDefined();
    });

    it('should import configuration', () => {
      const config1 = ril.create().addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      const exported = config1.export();

      const config2 = ril.create().import(exported);
      expect(config2.hasComponent('text')).toBe(true);
      expect(config2.getAllComponents()).toHaveLength(1);
    });
  });

  describe('Validation', () => {
    it('should validate configuration without errors', () => {
      const config = ril.create().addComponent('text', {
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
          type: 'invalid-component',
          name: 'Invalid Component',
          renderer: undefined as any,
        },
      });

      const errors = config.validate();
      expect(errors).toContain('Components without renderer: invalid-component');
    });
  });
});
