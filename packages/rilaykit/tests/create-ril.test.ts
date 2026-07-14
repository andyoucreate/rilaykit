import { form } from '@rilaykit/forms';
import { flow } from '@rilaykit/workflow';
import React from 'react';
import { ril } from 'rilaykit';
import { describe, expect, it } from 'vitest';

const MockRenderer = () => React.createElement('input');
const MockSelectRenderer = () => React.createElement('select');

describe('rilaykit - enhanced ril', () => {
  describe('ril.create()', () => {
    it('should create an instance with all RilayInstance methods', () => {
      const r = ril.create();

      expect(r.component).toBeTypeOf('function');
      expect(r.getComponent).toBeTypeOf('function');
      expect(r.getAllComponents).toBeTypeOf('function');
      expect(r.hasComponent).toBeTypeOf('function');
      expect(r.getStats).toBeTypeOf('function');
      expect(r.validate).toBeTypeOf('function');
      expect(r.validateAsync).toBeTypeOf('function');
      expect(r.clone).toBeTypeOf('function');
      expect(r.removeComponent).toBeTypeOf('function');
      expect(r.clear).toBeTypeOf('function');
    });

    it('should have .form() and .flow() methods', () => {
      const r = ril.create();

      expect(r.form).toBeTypeOf('function');
      expect(r.flow).toBeTypeOf('function');
    });
  });

  describe('passthrough methods', () => {
    it('should register a component and retrieve it', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const component = r.getComponent('text');
      expect(component).toBeDefined();
      expect(component?.type).toBe('text');
      expect(component?.name).toBe('Text');
    });

    it('should support method chaining with component', () => {
      const r = ril
        .create()
        .component('text', { name: 'Text', renderer: MockRenderer })
        .component('select', { name: 'Select', renderer: MockSelectRenderer });

      expect(r.getAllComponents()).toHaveLength(2);
      expect(r.hasComponent('text')).toBe(true);
      expect(r.hasComponent('select')).toBe(true);
    });

    it('should return stats', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      expect(r.getStats()).toEqual({ total: 1, components: 1, tools: 0, parts: 0 });
    });

    it('should validate', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const errors = r.validate();
      expect(errors).toHaveLength(0);
    });

    it('should validateAsync', async () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const result = await r.validateAsync();
      expect(result.isValid).toBe(true);
    });
  });

  describe('immutable methods preserve .form() and .flow()', () => {
    it('component returns RilayKit with .form() and .flow()', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      expect(r.form).toBeTypeOf('function');
      expect(r.flow).toBeTypeOf('function');
    });

    it('clone returns RilayKit with .form() and .flow()', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer }).clone();

      expect(r.form).toBeTypeOf('function');
      expect(r.flow).toBeTypeOf('function');
      expect(r.hasComponent('text')).toBe(true);
    });

    it('removeComponent returns RilayKit with .form() and .flow()', () => {
      const r = ril
        .create()
        .component('text', { name: 'Text', renderer: MockRenderer })
        .removeComponent('text');

      expect(r.form).toBeTypeOf('function');
      expect(r.flow).toBeTypeOf('function');
      expect(r.hasComponent('text')).toBe(false);
    });

    it('clear returns RilayKit with .form() and .flow()', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer }).clear();

      expect(r.form).toBeTypeOf('function');
      expect(r.flow).toBeTypeOf('function');
      expect(r.getAllComponents()).toHaveLength(0);
    });
  });

  describe('.form()', () => {
    it('should return a form builder instance', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const f = r.form('my-form');

      expect(f).toBeInstanceOf(form);
    });

    it('should pass formId correctly', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const config = r
        .form('contact-form')
        .add({ type: 'text', props: { label: 'Name' } })
        .build();

      expect(config.id).toBe('contact-form');
    });

    it('should work without formId (auto-generated)', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const config = r
        .form()
        .add({ type: 'text', props: { label: 'Name' } })
        .build();

      expect(config.id).toBeDefined();
    });

    it('should build a functional form with fields', () => {
      const r = ril
        .create()
        .component('text', { name: 'Text', renderer: MockRenderer })
        .component('select', { name: 'Select', renderer: MockSelectRenderer });

      const config = r
        .form('test')
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .add({ id: 'role', type: 'select', props: { label: 'Role' } })
        .build();

      expect(config.allFields).toHaveLength(2);
      expect(config.allFields[0].id).toBe('name');
      expect(config.allFields[1].id).toBe('role');
    });
  });

  describe('.flow()', () => {
    it('should return a flow builder instance', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const f = r.flow('my-flow', 'My Flow');

      expect(f).toBeInstanceOf(flow);
    });

    it('should pass all parameters correctly', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const formConfig = r
        .form('step-form')
        .add({ type: 'text', props: { label: 'Name' } })
        .build();

      const config = r
        .flow('onboarding', 'User Onboarding', 'Onboarding flow')
        .step({ id: 'step1', title: 'Step 1', formConfig })
        .build();

      expect(config.id).toBe('onboarding');
      expect(config.name).toBe('User Onboarding');
      expect(config.description).toBe('Onboarding flow');
    });

    it('should build a functional workflow with steps', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const form1 = r
        .form('step1-form')
        .add({ type: 'text', props: { label: 'First' } })
        .build();

      const form2 = r
        .form('step2-form')
        .add({ type: 'text', props: { label: 'Second' } })
        .build();

      const config = r
        .flow('wizard', 'Wizard')
        .step({ id: 's1', title: 'Step 1', formConfig: form1 })
        .step({ id: 's2', title: 'Step 2', formConfig: form2 })
        .build();

      expect(config.steps).toHaveLength(2);
      expect(config.steps[0].id).toBe('s1');
      expect(config.steps[1].id).toBe('s2');
    });
  });

  describe('full chaining', () => {
    it('should support end-to-end chaining: create → component → form → build', () => {
      const config = ril
        .create()
        .component('text', { name: 'Text', renderer: MockRenderer })
        .form('test')
        .add({ type: 'text', props: { label: 'Name' } })
        .build();

      expect(config.id).toBe('test');
      expect(config.allFields).toHaveLength(1);
    });

    it('should support end-to-end chaining: create → component → flow → build', () => {
      const r = ril.create().component('text', { name: 'Text', renderer: MockRenderer });

      const formConfig = r
        .form('f1')
        .add({ type: 'text', props: { label: 'Name' } })
        .build();

      const workflowConfig = r.flow('w1', 'Workflow').step({ title: 'Step 1', formConfig }).build();

      expect(workflowConfig.id).toBe('w1');
      expect(workflowConfig.steps).toHaveLength(1);
    });
  });
});
