import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  type ComponentRenderContext,
  Flow,
  FlowBody,
  Form,
  type FormConfiguration,
  type RilayKit,
  type WorkflowConfig,
  flow,
  form,
  required,
  ril,
} from 'rilaykit';
import { describe, expect, it } from 'vitest';

const MockInput = ({ id, props, field }: ComponentRenderContext) =>
  React.createElement('input', {
    id,
    'data-testid': id,
    value: String(field?.value ?? ''),
    placeholder: props.label ? String(props.label) : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => field?.onChange(e.target.value),
  });

const MockSelect = ({ id, field }: ComponentRenderContext) =>
  React.createElement('select', {
    id,
    value: String(field?.value ?? ''),
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => field?.onChange(e.target.value),
  });

describe('rilaykit - all-in-one integration', () => {
  it('should re-export core utilities', () => {
    expect(required).toBeTypeOf('function');
  });

  it('should re-export form components', () => {
    expect(Form).toBeDefined();
  });

  it('should render the workflow compound components re-exported by rilaykit', () => {
    const r = ril.create().addComponent('input', { name: 'Input', renderer: MockInput });

    const contactForm = r
      .form('contact')
      .add({ id: 'email', type: 'input', props: { label: 'Email' } });

    const onboarding = r
      .flow('onboarding', 'Onboarding')
      .step({ id: 'contact', title: 'Contact', formConfig: contactForm.build() });

    render(
      <Flow of={onboarding}>
        <FlowBody />
      </Flow>
    );

    expect(screen.getByTestId('email')).toBeInTheDocument();
  });

  it('should re-export form builder class', () => {
    expect(form).toBeDefined();
    expect(form.create).toBeTypeOf('function');
  });

  it('should re-export flow builder class', () => {
    expect(flow).toBeDefined();
    expect(flow.create).toBeTypeOf('function');
  });

  it('should support the full all-in-one API', () => {
    const r = ril
      .create()
      .addComponent('input', { name: 'Input', renderer: MockInput })
      .addComponent('select', { name: 'Select', renderer: MockSelect });

    // Build a form using r.form()
    const contactForm = r
      .form('contact')
      .add(
        { id: 'firstName', type: 'input', props: { label: 'First Name' } },
        { id: 'lastName', type: 'input', props: { label: 'Last Name' } }
      )
      .add({ id: 'email', type: 'input', props: { label: 'Email' } })
      .build();

    expect(contactForm.id).toBe('contact');
    expect(contactForm.allFields).toHaveLength(3);

    // Build a workflow using r.flow()
    const onboarding = r
      .flow('onboarding', 'User Onboarding')
      .step({ id: 'contact', title: 'Contact Info', formConfig: contactForm })
      .build();

    expect(onboarding.id).toBe('onboarding');
    expect(onboarding.name).toBe('User Onboarding');
    expect(onboarding.steps).toHaveLength(1);
  });

  it('should allow mixing r.form() with standalone form.create()', () => {
    const r = ril.create().addComponent('input', { name: 'Input', renderer: MockInput });

    // Using the enhanced API
    const form1 = r
      .form('enhanced')
      .add({ type: 'input', props: { label: 'Name' } })
      .build();

    // Both should produce valid FormConfiguration
    expect(form1.id).toBe('enhanced');
    expect(form1.allFields).toHaveLength(1);
  });

  it('should work with validation', () => {
    const r = ril.create().addComponent('input', { name: 'Input', renderer: MockInput });

    const formConfig = r
      .form('validated')
      .add({
        id: 'email',
        type: 'input',
        props: { label: 'Email' },
        validation: { validate: [required()] },
      })
      .build();

    expect(formConfig.allFields[0].validation).toBeDefined();
  });

  it('should support multi-step workflow with multiple forms', () => {
    const r = ril
      .create()
      .addComponent('input', { name: 'Input', renderer: MockInput })
      .addComponent('select', { name: 'Select', renderer: MockSelect });

    const step1Form = r
      .form('step1')
      .add({ id: 'name', type: 'input', props: { label: 'Name' } })
      .build();

    const step2Form = r
      .form('step2')
      .add({ id: 'role', type: 'select', props: { label: 'Role' } })
      .build();

    const workflow = r
      .flow('onboarding', 'Onboarding', 'Multi-step onboarding')
      .step({ id: 'personal', title: 'Personal Info', formConfig: step1Form })
      .step({ id: 'professional', title: 'Professional Info', formConfig: step2Form })
      .build();

    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0].id).toBe('personal');
    expect(workflow.steps[1].id).toBe('professional');
    expect(workflow.description).toBe('Multi-step onboarding');
  });
});
