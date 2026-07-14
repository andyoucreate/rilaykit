import React from 'react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src/config/ril';
import { DuplicateError } from '../../src/errors';

const TestComponent = () => React.createElement('div', null, 'test');
const TestRenderer = () => React.createElement('div', null, 'renderer');

describe('ril', () => {
  describe('Basic Configuration', () => {
    it('should create an empty config', () => {
      const config = ril.create<Record<string, any>>();

      expect(config).toBeInstanceOf(ril);
      expect(config.getComponent('text')).toBeUndefined();
      expect(config.getAllComponents()).toHaveLength(0);
    });

    it('should add a component configuration', () => {
      const config = ril.create().component('text', {
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
        .component('text', { name: 'Text Input', renderer: TestComponent })
        .component('email', { name: 'Email Input', renderer: TestRenderer });

      const textComponent = config.getComponent('text');
      const emailComponent = config.getComponent('email');

      expect(textComponent).toBeDefined();
      expect(emailComponent).toBeDefined();
    });

    it('should throw DuplicateError when registering the same type twice', () => {
      const config = ril.create().component('text', {
        name: 'Text Input 1',
        renderer: TestComponent,
      });

      expect(() =>
        config.component('text', { name: 'Text Input 2', renderer: TestRenderer })
      ).toThrow(DuplicateError);
    });

    it('should overwrite component with the same type using replace', () => {
      const config = ril
        .create()
        .component('text', {
          name: 'Text Input 1',
          renderer: TestComponent,
        })
        .component('text', {
          name: 'Text Input 2',
          renderer: TestRenderer,
          replace: true,
        });

      const components = config.getAllComponents();
      const component = config.getComponent('text');
      expect(components).toHaveLength(1);
      expect(component?.name).toBe('Text Input 2');
      expect(component?.renderer).toBe(TestRenderer);
    });

    it('should support default props', () => {
      const defaultProps = { placeholder: 'Enter text...', required: true };

      const config = ril.create().component('text', {
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
        .component('text', { name: 'Text Input', renderer: TestComponent })
        .component('heading', { name: 'Heading', renderer: TestRenderer });

      const allComponents = config.getAllComponents();

      expect(allComponents).toHaveLength(2);
      expect(allComponents.find((c) => c.type === 'text')).toBeDefined();
      expect(allComponents.find((c) => c.type === 'heading')).toBeDefined();
    });

    it('should check if component exists', () => {
      const config = ril.create().component('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      expect(config.hasComponent('text')).toBe(true);
      expect(config.hasComponent('non-existent')).toBe(false);
    });

    it('should remove components', () => {
      const config = ril.create().component('text', {
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
        .component('text', { name: 'Text Input', renderer: TestComponent })
        .component('email', { name: 'Email Input', renderer: TestRenderer });

      expect(config.getAllComponents()).toHaveLength(2);
      const clearedConfig = config.clear();
      expect(clearedConfig.getAllComponents()).toHaveLength(0);
      // Original config should still have components (immutable)
      expect(config.getAllComponents()).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    it('should count entries by kind', () => {
      const config = ril
        .create()
        .component('text', { name: 'Text Input', renderer: TestComponent })
        .component('email', { name: 'Email Input', renderer: TestRenderer })
        .tool('search', { description: 'Search tool' })
        .part('reasoning', { renderer: TestRenderer });

      expect(config.getStats()).toEqual({ total: 4, components: 2, tools: 1, parts: 1 });
    });

    it('should report zero counts on an empty catalog', () => {
      expect(ril.create().getStats()).toEqual({ total: 0, components: 0, tools: 0, parts: 0 });
    });
  });

  describe('Validation', () => {
    it('should validate configuration without errors', () => {
      const config = ril.create().component('text', {
        name: 'Text Input',
        renderer: TestComponent,
      });

      expect(config.validate()).toEqual([]);
    });

    it('should accept renderer-less blueprint components', () => {
      const config = ril.create().component('blueprint', {
        description: 'Blueprint without renderer',
      });

      expect(config.validate()).toEqual([]);
    });

    it('should surface renderer-less components as a warning in validateAsync', async () => {
      const config = ril.create().component('blueprint', {
        description: 'Blueprint without renderer',
      });

      const result = await config.validateAsync();

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Components without renderer: blueprint');
    });
  });
});
