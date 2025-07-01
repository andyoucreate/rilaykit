import React from 'react';
import { describe, expect, it } from 'vitest';
import { ril } from '../../src/config/ril';

const TestComponent = () => React.createElement('div', null, 'test');
const TestRenderer = () => React.createElement('div', null, 'renderer');

describe('RilayConfig', () => {
  it('should create an empty config', () => {
    const config = ril.create();

    expect(config).toBeInstanceOf(ril);
    expect(config.getComponent('test-id')).toBeUndefined();
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

  it('should set custom row renderer', () => {
    const mockRowRenderer = TestRenderer;

    const config = ril.create().setRowRenderer(mockRowRenderer);

    const renderConfig = config.getFormRenderConfig();
    expect(renderConfig.rowRenderer).toBe(mockRowRenderer);
  });

  it('should set custom body renderer', () => {
    const mockBodyRenderer = TestRenderer;

    const config = ril.create().setBodyRenderer(mockBodyRenderer);

    const renderConfig = config.getFormRenderConfig();
    expect(renderConfig.bodyRenderer).toBe(mockBodyRenderer);
  });

  it('should set custom submit button renderer', () => {
    const mockSubmitRenderer = TestRenderer;

    const config = ril.create().setSubmitButtonRenderer(mockSubmitRenderer);

    const renderConfig = config.getFormRenderConfig();
    expect(renderConfig.submitButtonRenderer).toBe(mockSubmitRenderer);
  });

  it('should get stats correctly', () => {
    const config = ril
      .create()
      .addComponent('text', { type: 'input', name: 'Text Input', renderer: TestComponent })
      .addComponent('email', { type: 'input', name: 'Email Input', renderer: TestRenderer })
      .addComponent('heading', { type: 'layout', name: 'Heading', renderer: TestComponent });

    const stats = config.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType.input).toBe(2);
    expect(stats.byType.layout).toBe(1);
    expect(stats.bySubType.text).toBe(1);
    expect(stats.bySubType.email).toBe(1);
    expect(stats.bySubType.heading).toBe(1);
  });

  it('should validate configuration', () => {
    const config = ril.create().addComponent('text', {
      type: 'input',
      name: 'Text Input',
      renderer: TestComponent,
    });

    const errors = config.validate();
    expect(errors).toHaveLength(0);
  });
});
