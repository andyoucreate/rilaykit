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
      const config = ril.create<Record<string, any>>();

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
  });

  describe('Component Management', () => {
    it('should get all components', () => {
      const config = ril
        .create()
        .addComponent('text', { name: 'Text Input', renderer: TestComponent })
        .addComponent('heading', { name: 'Heading', renderer: TestRenderer });

      const allComponents = config.getAllComponents();

      expect(allComponents).toHaveLength(2);
      expect(allComponents.find((c) => c.type === 'text')).toBeDefined();
      expect(allComponents.find((c) => c.type === 'heading')).toBeDefined();
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
      const newConfig = config.removeComponent('text');
      expect(newConfig.hasComponent('text')).toBe(false);
      // Original config should still have the component (immutable)
      expect(config.hasComponent('text')).toBe(true);
    });

    it('should clear all components', () => {
      const config = ril
        .create()
        .addComponent('text', { name: 'Text Input', renderer: TestComponent })
        .addComponent('email', { name: 'Email Input', renderer: TestRenderer });

      expect(config.getAllComponents()).toHaveLength(2);
      const clearedConfig = config.clear();
      expect(clearedConfig.getAllComponents()).toHaveLength(0);
      // Original config should still have components (immutable)
      expect(config.getAllComponents()).toHaveLength(2);
    });
  });

  describe('Form Renderers', () => {
    it('should set custom row renderer using configure', () => {
      const config = ril.create().configure({
        rowRenderer: TestFormRowRenderer,
      });

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.rowRenderer).toBe(TestFormRowRenderer);
    });

    it('should set custom body renderer using configure', () => {
      const config = ril.create().configure({
        bodyRenderer: TestFormBodyRenderer,
      });

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.bodyRenderer).toBe(TestFormBodyRenderer);
    });

    it('should set custom submit button renderer using configure', () => {
      const config = ril.create().configure({
        submitButtonRenderer: TestRenderer,
      });

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.submitButtonRenderer).toBe(TestRenderer);
    });

    it('should set multiple form renderers using configure', () => {
      const config = ril.create().configure({
        rowRenderer: TestFormRowRenderer,
        bodyRenderer: TestFormBodyRenderer,
        submitButtonRenderer: TestRenderer,
      });

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.rowRenderer).toBe(TestFormRowRenderer);
      expect(renderConfig.bodyRenderer).toBe(TestFormBodyRenderer);
      expect(renderConfig.submitButtonRenderer).toBe(TestRenderer);
    });

    it('should set complete form render configuration using configure', () => {
      const config = ril.create().configure({
        rowRenderer: TestFormRowRenderer,
        bodyRenderer: TestFormBodyRenderer,
        submitButtonRenderer: TestRenderer,
        fieldRenderer: TestRenderer,
      });

      const renderConfig = config.getFormRenderConfig();
      expect(renderConfig.rowRenderer).toBe(TestFormRowRenderer);
      expect(renderConfig.bodyRenderer).toBe(TestFormBodyRenderer);
      expect(renderConfig.submitButtonRenderer).toBe(TestRenderer);
      expect(renderConfig.fieldRenderer).toBe(TestRenderer);
    });
  });

  describe('Workflow Renderers', () => {
    it('should set custom stepper renderer using configure', () => {
      const config = ril.create().configure({
        stepperRenderer: TestWorkflowStepperRenderer,
      });

      const renderConfig = config.getWorkflowRenderConfig();
      expect(renderConfig.stepperRenderer).toBe(TestWorkflowStepperRenderer);
    });

    it('should set multiple workflow renderers using configure', () => {
      const config = ril.create().configure({
        stepperRenderer: TestWorkflowStepperRenderer,
        nextButtonRenderer: TestWorkflowNavRenderer,
        previousButtonRenderer: TestWorkflowNavRenderer,
        skipButtonRenderer: TestWorkflowNavRenderer,
      });

      const renderConfig = config.getWorkflowRenderConfig();
      expect(renderConfig.stepperRenderer).toBe(TestWorkflowStepperRenderer);
      expect(renderConfig.nextButtonRenderer).toBe(TestWorkflowNavRenderer);
      expect(renderConfig.previousButtonRenderer).toBe(TestWorkflowNavRenderer);
      expect(renderConfig.skipButtonRenderer).toBe(TestWorkflowNavRenderer);
    });
  });

  describe('Statistics', () => {
    it('should get stats correctly', () => {
      const config = ril
        .create()
        .addComponent('text', {
          name: 'Text Input',
          renderer: TestComponent,
        })
        .addComponent('email', {
          name: 'Email Input',
          renderer: TestRenderer,
        })
        .addComponent('heading', {
          name: 'Heading',
          renderer: TestComponent,
        })
        .configure({
          rowRenderer: TestFormRowRenderer,
          stepperRenderer: TestWorkflowStepperRenderer,
        });

      const stats = config.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType.text).toBe(1);
      expect(stats.byType.email).toBe(1);
      expect(stats.byType.heading).toBe(1);
      expect(stats.hasCustomRenderers.row).toBe(true);
      expect(stats.hasCustomRenderers.body).toBe(false);
      expect(stats.hasCustomRenderers.stepper).toBe(true);
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
      (config as any).components.set('invalid-component', {
        id: 'invalid-component',
        type: 'invalid-component',
        name: 'Invalid Component',
        renderer: undefined as any,
      });

      const errors = config.validate();
      expect(errors).toContain('Components without renderer: invalid-component');
    });
  });
});
