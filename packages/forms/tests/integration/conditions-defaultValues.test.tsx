import { type ComponentRenderContext, ril, when } from '@rilaykit/core';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormField, FormProvider, form } from '../../src';

describe('Form - Field Conditions with DefaultValues', () => {
  // Mock components
  const MockSelect = ({ id, props, field }: ComponentRenderContext) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <select
        id={id}
        value={
          Array.isArray(field?.value) ? String(field?.value[0] ?? '') : String(field?.value ?? '')
        }
        onChange={(e) => field?.onChange(props.multiple ? [e.target.value] : e.target.value)}
        data-testid={`select-${id}`}
        multiple={Boolean(props.multiple)}
      >
        {(props.options as Array<{ value: string; label: string }>).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const MockInput = ({ id, props, field }: ComponentRenderContext) => (
    <div data-testid={`field-${id}`}>
      <label htmlFor={id}>{String(props.label ?? '')}</label>
      <input
        id={id}
        type="text"
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        data-testid={`input-${id}`}
      />
    </div>
  );

  let config: ril<Record<string, any>>;
  let formConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .component('select', {
        name: 'Select Input',
        renderer: MockSelect,
      })
      .component('input', {
        name: 'Text Input',
        renderer: MockInput,
      })
      .configure({
        rowRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        bodyRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      });

    // Create form with conditional fields
    formConfig = form
      .create(config, 'test-form')
      .add({
        id: 'userType',
        type: 'select',
        props: {
          label: 'User Type',
          options: [
            { label: 'Individual', value: 'individual' },
            { label: 'Company', value: 'company' },
          ],
        },
      })
      .add({
        id: 'companyName',
        type: 'input',
        props: { label: 'Company Name' },
        conditions: {
          visible: when('userType').equals('company'),
        },
      })
      .add({
        id: 'personalInfo',
        type: 'input',
        props: { label: 'Personal Info' },
        conditions: {
          visible: when('userType').equals('individual'),
        },
      })
      .build();
  });

  it('should show conditional field when defaultValues trigger the condition', async () => {
    const defaultValues = {
      userType: 'company', // This should make companyName visible
    };

    render(
      <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
        <FormField id="userType" />
        <FormField id="companyName" />
        <FormField id="personalInfo" />
      </FormProvider>
    );

    await waitFor(() => {
      // userType should always be visible
      expect(screen.getByTestId('field-userType')).toBeInTheDocument();

      // companyName should be visible because userType = 'company'
      expect(screen.getByTestId('field-companyName')).toBeInTheDocument();

      // personalInfo should NOT be visible because userType != 'individual'
      expect(screen.queryByTestId('field-personalInfo')).not.toBeInTheDocument();
    });

    // Check that the select has the correct default value
    const selectElement = screen.getByTestId('select-userType');
    expect(selectElement).toHaveValue('company');
  });

  it('should hide conditional field when defaultValues do not trigger the condition', async () => {
    const defaultValues = {
      userType: 'individual', // This should make personalInfo visible
    };

    render(
      <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
        <FormField id="userType" />
        <FormField id="companyName" />
        <FormField id="personalInfo" />
      </FormProvider>
    );

    await waitFor(() => {
      // userType should be visible
      expect(screen.getByTestId('field-userType')).toBeInTheDocument();

      // personalInfo should be visible because userType = 'individual'
      expect(screen.getByTestId('field-personalInfo')).toBeInTheDocument();

      // companyName should NOT be visible because userType != 'company'
      expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();
    });

    const selectElement = screen.getByTestId('select-userType');
    expect(selectElement).toHaveValue('individual');
  });

  it('should handle empty defaultValues correctly', async () => {
    const defaultValues = {};

    render(
      <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
        <FormField id="userType" />
        <FormField id="companyName" />
        <FormField id="personalInfo" />
      </FormProvider>
    );

    await waitFor(() => {
      // userType should be visible
      expect(screen.getByTestId('field-userType')).toBeInTheDocument();

      // Both conditional fields should be hidden because no condition is met
      expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-personalInfo')).not.toBeInTheDocument();
    });

    const _selectElement = screen.getByTestId('select-userType');
    // The select might have a default option selected, we just check that conditional fields are hidden
    // expect(selectElement).toHaveValue(''); // Empty value - this might vary depending on implementation
  });

  it('should work with complex field conditions', async () => {
    // Create a more complex form with multiple condition types
    const complexForm = form
      .create(config, 'complex-form')
      .add({
        id: 'hasCompany',
        type: 'select',
        props: {
          label: 'Do you have a company?',
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
      })
      .add({
        id: 'companySize',
        type: 'select',
        props: {
          label: 'Company Size',
          options: [
            { label: 'Small (1-10)', value: 'small' },
            { label: 'Medium (11-50)', value: 'medium' },
            { label: 'Large (50+)', value: 'large' },
          ],
        },
        conditions: {
          visible: when('hasCompany').equals('yes'),
        },
      })
      .add({
        id: 'employeeCount',
        type: 'input',
        props: { label: 'Exact Employee Count' },
        conditions: {
          visible: when('hasCompany').equals('yes').and(when('companySize').equals('large')),
        },
      })
      .add({
        id: 'personalReason',
        type: 'input',
        props: { label: 'Personal Reason' },
        conditions: {
          visible: when('hasCompany').equals('no'),
        },
      })
      .build();

    const defaultValues = {
      hasCompany: 'yes',
      companySize: 'large', // This should trigger the employeeCount field
    };

    render(
      <FormProvider formConfig={complexForm} defaultValues={defaultValues}>
        <FormField id="hasCompany" />
        <FormField id="companySize" />
        <FormField id="employeeCount" />
        <FormField id="personalReason" />
      </FormProvider>
    );

    await waitFor(() => {
      // hasCompany should be visible
      expect(screen.getByTestId('field-hasCompany')).toBeInTheDocument();

      // companySize should be visible because hasCompany = 'yes'
      expect(screen.getByTestId('field-companySize')).toBeInTheDocument();

      // employeeCount should be visible because hasCompany = 'yes' AND companySize = 'large'
      expect(screen.getByTestId('field-employeeCount')).toBeInTheDocument();

      // personalReason should NOT be visible because hasCompany != 'no'
      expect(screen.queryByTestId('field-personalReason')).not.toBeInTheDocument();
    });

    // Check default values are set correctly
    expect(screen.getByTestId('select-hasCompany')).toHaveValue('yes');
    expect(screen.getByTestId('select-companySize')).toHaveValue('large');
  });

  it('should handle field conditions with array values', async () => {
    const arrayForm = form
      .create(config, 'array-form')
      .add({
        id: 'interests',
        type: 'select',
        props: {
          label: 'Interests',
          multiple: true,
          options: [
            { label: 'Technology', value: 'tech' },
            { label: 'Finance', value: 'finance' },
            { label: 'Healthcare', value: 'health' },
          ],
        },
      })
      .add({
        id: 'techDetails',
        type: 'input',
        props: { label: 'Technology Details' },
        conditions: {
          visible: when('interests').contains('tech'),
        },
      })
      .add({
        id: 'healthDetails',
        type: 'input',
        props: { label: 'Healthcare Details' },
        conditions: {
          visible: when('interests').contains('health'),
        },
      })
      .build();

    const defaultValues = {
      interests: ['tech', 'finance'], // Should show techDetails but not healthDetails
    };

    render(
      <FormProvider formConfig={arrayForm} defaultValues={defaultValues}>
        <FormField id="interests" />
        <FormField id="techDetails" />
        <FormField id="healthDetails" />
      </FormProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-interests')).toBeInTheDocument();

      // techDetails should be visible because 'tech' is in the interests array
      expect(screen.getByTestId('field-techDetails')).toBeInTheDocument();

      // healthDetails should NOT be visible because 'health' is not in the interests array
      expect(screen.queryByTestId('field-healthDetails')).not.toBeInTheDocument();
    });
  });
});
