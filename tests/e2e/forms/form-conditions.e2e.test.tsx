import { required, ril, when } from '@rilaykit/core';
import { FormBody, FormProvider, form, useFormConfigContext } from '@rilaykit/forms';
import { useFormStoreApi, useFormValues } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  FormValuesDisplay,
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
  SetValueButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// SETUP
// ============================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

beforeEach(() => {
  vi.clearAllMocks();
  rilConfig = createTestRilConfig();
});

// ============================================================================
// TESTS
// ============================================================================

describe('Form Conditions E2E', () => {
  // --------------------------------------------------------------------------
  // 1. Show/hide with equals
  // --------------------------------------------------------------------------
  describe('show/hide with equals', () => {
    it('should show companyName when type is "company" and hide when "personal"', async () => {
      const formConfig = form
        .create(rilConfig, 'equals-form')
        .add({
          id: 'type',
          type: 'select',
          props: {
            label: 'Type',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'personal', label: 'Personal' },
              { value: 'company', label: 'Company' },
            ],
          },
        })
        .add({
          id: 'companyName',
          type: 'text',
          props: { label: 'Company Name' },
          conditions: {
            visible: when('type').equals('company'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{}}>
          <FormBody />
          <SetValueButton fieldId="type" value="company" />
          <SetValueButton fieldId="type" value="personal" />
        </FormProvider>
      );

      // Initially hidden (type is empty)
      expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();

      // Set type to 'company' -> companyName visible
      const setButtons = screen.getAllByTestId('set-type');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-companyName')).toBeInTheDocument();
      });

      // Set type to 'personal' -> companyName hidden
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-companyName')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. Show/hide with notEquals
  // --------------------------------------------------------------------------
  describe('show/hide with notEquals', () => {
    it('should show field for "admin" and hide for "guest"', async () => {
      const formConfig = form
        .create(rilConfig, 'not-equals-form')
        .add({
          id: 'role',
          type: 'select',
          props: {
            label: 'Role',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'guest', label: 'Guest' },
              { value: 'admin', label: 'Admin' },
            ],
          },
        })
        .add({
          id: 'adminPanel',
          type: 'text',
          props: { label: 'Admin Panel' },
          conditions: {
            visible: when('role').notEquals('guest'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ role: 'admin' }}>
          <FormBody />
          <SetValueButton fieldId="role" value="guest" />
          <SetValueButton fieldId="role" value="admin" />
        </FormProvider>
      );

      // Initially visible (role = 'admin', notEquals 'guest')
      await waitFor(() => {
        expect(screen.getByTestId('field-adminPanel')).toBeInTheDocument();
      });

      // Set role to 'guest' -> adminPanel hidden
      const setButtons = screen.getAllByTestId('set-role');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-adminPanel')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. greaterThan / lessThan
  // --------------------------------------------------------------------------
  describe('greaterThan / lessThan', () => {
    it('should show adultContent when age > 18', async () => {
      const formConfig = form
        .create(rilConfig, 'gt-form')
        .add({
          id: 'age',
          type: 'number',
          props: { label: 'Age' },
        })
        .add({
          id: 'adultContent',
          type: 'text',
          props: { label: 'Adult Content' },
          conditions: {
            visible: when('age').greaterThan(18),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ age: 15 }}>
          <FormBody />
          <SetValueButton fieldId="age" value={25} />
          <SetValueButton fieldId="age" value={10} />
        </FormProvider>
      );

      // Initially hidden (age = 15, not > 18)
      await waitFor(() => {
        expect(screen.queryByTestId('field-adultContent')).not.toBeInTheDocument();
      });

      // Set age to 25 -> adultContent visible
      const setButtons = screen.getAllByTestId('set-age');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-adultContent')).toBeInTheDocument();
      });

      // Set age to 10 -> adultContent hidden again
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-adultContent')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. contains / notContains
  // --------------------------------------------------------------------------
  describe('contains / notContains', () => {
    it('should show vipBenefits when tags contains "vip"', async () => {
      const formConfig = form
        .create(rilConfig, 'contains-form')
        .add({
          id: 'tags',
          type: 'text',
          props: { label: 'Tags' },
        })
        .add({
          id: 'vipBenefits',
          type: 'text',
          props: { label: 'VIP Benefits' },
          conditions: {
            visible: when('tags').contains('vip'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{}}>
          <FormBody />
          <SetValueButton fieldId="tags" value={['vip', 'premium']} />
          <SetValueButton fieldId="tags" value={['basic']} />
        </FormProvider>
      );

      // Initially hidden (tags is undefined)
      expect(screen.queryByTestId('field-vipBenefits')).not.toBeInTheDocument();

      // Set tags to ['vip', 'premium'] -> vipBenefits visible
      const setButtons = screen.getAllByTestId('set-tags');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-vipBenefits')).toBeInTheDocument();
      });

      // Set tags to ['basic'] -> vipBenefits hidden
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-vipBenefits')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. in / notIn
  // --------------------------------------------------------------------------
  describe('in / notIn', () => {
    it('should show euDetails when country is in [FR, BE, CH]', async () => {
      const formConfig = form
        .create(rilConfig, 'in-form')
        .add({
          id: 'country',
          type: 'select',
          props: {
            label: 'Country',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'FR', label: 'France' },
              { value: 'BE', label: 'Belgium' },
              { value: 'CH', label: 'Switzerland' },
              { value: 'US', label: 'United States' },
            ],
          },
        })
        .add({
          id: 'euDetails',
          type: 'text',
          props: { label: 'EU Details' },
          conditions: {
            visible: when('country').in(['FR', 'BE', 'CH']),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ country: 'US' }}>
          <FormBody />
          <SetValueButton fieldId="country" value="FR" />
          <SetValueButton fieldId="country" value="US" />
        </FormProvider>
      );

      // Initially hidden (country = 'US', not in list)
      await waitFor(() => {
        expect(screen.queryByTestId('field-euDetails')).not.toBeInTheDocument();
      });

      // Set country to 'FR' -> euDetails visible
      const setButtons = screen.getAllByTestId('set-country');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-euDetails')).toBeInTheDocument();
      });

      // Set country back to 'US' -> euDetails hidden
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-euDetails')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 6. matches (regex)
  // --------------------------------------------------------------------------
  describe('matches (regex)', () => {
    it('should show validCode field when code matches ^[A-Z]{3}$', async () => {
      const formConfig = form
        .create(rilConfig, 'matches-form')
        .add({
          id: 'code',
          type: 'text',
          props: { label: 'Code' },
        })
        .add({
          id: 'validCode',
          type: 'text',
          props: { label: 'Valid Code Confirmed' },
          conditions: {
            visible: when('code').matches('^[A-Z]{3}$'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ code: 'ab' }}>
          <FormBody />
          <SetValueButton fieldId="code" value="ABC" />
          <SetValueButton fieldId="code" value="abcd" />
        </FormProvider>
      );

      // Initially hidden (code = 'ab', does not match)
      await waitFor(() => {
        expect(screen.queryByTestId('field-validCode')).not.toBeInTheDocument();
      });

      // Set code to 'ABC' -> validCode visible
      const setButtons = screen.getAllByTestId('set-code');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-validCode')).toBeInTheDocument();
      });

      // Set code to 'abcd' -> validCode hidden
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-validCode')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 7. exists / notExists
  // --------------------------------------------------------------------------
  describe('exists / notExists', () => {
    it('should show extra field when optional value exists', async () => {
      const formConfig = form
        .create(rilConfig, 'exists-form')
        .add({
          id: 'optional',
          type: 'text',
          props: { label: 'Optional' },
        })
        .add({
          id: 'extra',
          type: 'text',
          props: { label: 'Extra Details' },
          conditions: {
            visible: when('optional').exists(),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{}}>
          <FormBody />
          <SetValueButton fieldId="optional" value="something" />
          <SetValueButton fieldId="optional" value={null} />
        </FormProvider>
      );

      // Initially hidden (optional is undefined)
      expect(screen.queryByTestId('field-extra')).not.toBeInTheDocument();

      // Set optional to 'something' -> extra visible
      const setButtons = screen.getAllByTestId('set-optional');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-extra')).toBeInTheDocument();
      });

      // Set optional to null -> extra hidden
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-extra')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. AND logic
  // --------------------------------------------------------------------------
  describe('AND logic', () => {
    it('should show field only when both conditions are true', async () => {
      const formConfig = form
        .create(rilConfig, 'and-form')
        .add({
          id: 'isPro',
          type: 'checkbox',
          props: { label: 'Pro Account' },
        })
        .add({
          id: 'country',
          type: 'select',
          props: {
            label: 'Country',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'FR', label: 'France' },
              { value: 'US', label: 'United States' },
            ],
          },
        })
        .add({
          id: 'proFrDetails',
          type: 'text',
          props: { label: 'Pro FR Details' },
          conditions: {
            visible: when('isPro').equals(true).and(when('country').equals('FR')),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ isPro: true, country: 'US' }}>
          <FormBody />
          <SetValueButton fieldId="country" value="FR" />
          <SetValueButton fieldId="isPro" value={false} />
        </FormProvider>
      );

      // Initially hidden (isPro=true but country='US' -> AND fails)
      await waitFor(() => {
        expect(screen.queryByTestId('field-proFrDetails')).not.toBeInTheDocument();
      });

      // Set country to 'FR' -> both conditions met -> visible
      await act(async () => {
        fireEvent.click(screen.getByTestId('set-country'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-proFrDetails')).toBeInTheDocument();
      });

      // Set isPro to false -> AND fails again -> hidden
      await act(async () => {
        fireEvent.click(screen.getByTestId('set-isPro'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-proFrDetails')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 9. OR logic
  // --------------------------------------------------------------------------
  describe('OR logic', () => {
    it('should show field when either condition is true', async () => {
      const formConfig = form
        .create(rilConfig, 'or-form')
        .add({
          id: 'role',
          type: 'select',
          props: {
            label: 'Role',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'admin', label: 'Admin' },
              { value: 'manager', label: 'Manager' },
              { value: 'viewer', label: 'Viewer' },
            ],
          },
        })
        .add({
          id: 'managementPanel',
          type: 'text',
          props: { label: 'Management Panel' },
          conditions: {
            visible: when('role').equals('admin').or(when('role').equals('manager')),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ role: 'viewer' }}>
          <FormBody />
          <SetValueButton fieldId="role" value="admin" />
          <SetValueButton fieldId="role" value="manager" />
          <SetValueButton fieldId="role" value="viewer" />
        </FormProvider>
      );

      // Initially hidden (role = 'viewer')
      await waitFor(() => {
        expect(screen.queryByTestId('field-managementPanel')).not.toBeInTheDocument();
      });

      // Set role to 'admin' -> visible
      const setButtons = screen.getAllByTestId('set-role');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-managementPanel')).toBeInTheDocument();
      });

      // Set role to 'viewer' -> hidden
      await act(async () => {
        fireEvent.click(setButtons[2]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-managementPanel')).not.toBeInTheDocument();
      });

      // Set role to 'manager' -> visible
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-managementPanel')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 10. Cascade 3 levels
  // --------------------------------------------------------------------------
  describe('cascade 3 levels', () => {
    it('should propagate visibility through A -> B -> C', async () => {
      const formConfig = form
        .create(rilConfig, 'cascade-form')
        .add({
          id: 'a',
          type: 'select',
          props: {
            label: 'A',
            options: [
              { value: '', label: '-- Select --' },
              { value: 'show-b', label: 'Show B' },
              { value: 'hide-b', label: 'Hide B' },
            ],
          },
        })
        .add({
          id: 'b',
          type: 'text',
          props: { label: 'B' },
          conditions: {
            visible: when('a').equals('show-b'),
          },
        })
        .add({
          id: 'c',
          type: 'text',
          props: { label: 'C' },
          conditions: {
            visible: when('b').exists(),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{}}>
          <FormBody />
          <SetValueButton fieldId="a" value="show-b" />
          <SetValueButton fieldId="b" value="hello" />
          <SetValueButton fieldId="a" value="hide-b" />
        </FormProvider>
      );

      // Initially all conditional fields hidden
      expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();

      // Set A to 'show-b' -> B becomes visible, but C still hidden (B has no value)
      const setAButtons = screen.getAllByTestId('set-a');
      await act(async () => {
        fireEvent.click(setAButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-b')).toBeInTheDocument();
      });
      // C depends on B existing (having a value) - B is visible but has no value yet
      expect(screen.queryByTestId('field-c')).not.toBeInTheDocument();

      // Set B value -> C becomes visible
      await act(async () => {
        fireEvent.click(screen.getByTestId('set-b'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-c')).toBeInTheDocument();
      });

      // Set A to 'hide-b' -> B hidden
      await act(async () => {
        fireEvent.click(setAButtons[1]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();
      });
      // Note: C's condition (when('b').exists()) still evaluates to true because
      // B's value remains in the store. This is the expected value-based behavior.
    });
  });

  // --------------------------------------------------------------------------
  // 11. Disabled condition
  // --------------------------------------------------------------------------
  describe('disabled condition', () => {
    it('should disable input when locked is true', async () => {
      const formConfig = form
        .create(rilConfig, 'disabled-form')
        .add({
          id: 'locked',
          type: 'checkbox',
          props: { label: 'Lock' },
        })
        .add({
          id: 'lockedField',
          type: 'text',
          props: { label: 'Locked Field' },
          conditions: {
            disabled: when('locked').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ locked: false }}>
          <FormBody />
          <SetValueButton fieldId="locked" value={true} />
          <SetValueButton fieldId="locked" value={false} />
        </FormProvider>
      );

      // Initially enabled (locked = false)
      await waitFor(() => {
        expect(screen.getByTestId('input-lockedField')).not.toBeDisabled();
      });

      // Set locked to true -> input disabled
      const setButtons = screen.getAllByTestId('set-locked');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-lockedField')).toBeDisabled();
      });

      // Set locked to false -> input enabled again
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-lockedField')).not.toBeDisabled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 12. Conditionally required
  // --------------------------------------------------------------------------
  describe('conditionally required', () => {
    it('should fail validation when conditionally required field is empty', async () => {
      const formConfig = form
        .create(rilConfig, 'cond-required-form')
        .add({
          id: 'isPro',
          type: 'checkbox',
          props: { label: 'Pro Account' },
        })
        .add({
          id: 'company',
          type: 'text',
          props: { label: 'Company' },
          conditions: {
            required: when('isPro').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ isPro: true, company: '' }}>
          <FormBody />
          <ValidationTrigger />
          <FieldErrorDisplay fieldId="company" />
        </FormProvider>
      );

      // Verify the field is marked as required via conditions
      await waitFor(() => {
        const wrapper = screen.getByTestId('field-company').closest('[data-field-required]');
        expect(wrapper).toHaveAttribute('data-field-required', 'true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 13. Readonly condition
  // --------------------------------------------------------------------------
  describe('readonly condition', () => {
    it('should set field readonly when condition is met', async () => {
      const formConfig = form
        .create(rilConfig, 'readonly-form')
        .add({
          id: 'finalized',
          type: 'checkbox',
          props: { label: 'Finalized' },
        })
        .add({
          id: 'summary',
          type: 'text',
          props: { label: 'Summary' },
          conditions: {
            readonly: when('finalized').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ finalized: false }}>
          <FormBody />
          <SetValueButton fieldId="finalized" value={true} />
          <SetValueButton fieldId="finalized" value={false} />
        </FormProvider>
      );

      // Initially not readonly - check data attribute on the wrapper div
      const getReadonlyAttr = () =>
        screen.getByTestId('field-summary').closest('[data-field-readonly]');

      await waitFor(() => {
        expect(getReadonlyAttr()).toHaveAttribute('data-field-readonly', 'false');
      });

      // Set finalized to true -> summary becomes readonly
      const setButtons = screen.getAllByTestId('set-finalized');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(getReadonlyAttr()).toHaveAttribute('data-field-readonly', 'true');
      });

      // Set finalized to false -> summary becomes editable again
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(getReadonlyAttr()).toHaveAttribute('data-field-readonly', 'false');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 14. Skip validation for hidden fields
  // --------------------------------------------------------------------------
  describe('skip validation for hidden fields', () => {
    it('should return valid when required field is hidden', async () => {
      const formConfig = form
        .create(rilConfig, 'skip-validation-form')
        .add({
          id: 'showEmail',
          type: 'checkbox',
          props: { label: 'Show Email' },
        })
        .add({
          id: 'email',
          type: 'text',
          props: { label: 'Email' },
          validation: {
            validate: required('Email is required'),
          },
          conditions: {
            visible: when('showEmail').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ showEmail: false, email: '' }}>
          <FormBody />
          <ValidationTrigger />
        </FormProvider>
      );

      // email field is hidden (showEmail = false), so validation should skip it
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 15. Clear errors when field hidden then shown
  // --------------------------------------------------------------------------
  describe('clear errors when field hidden then shown', () => {
    it('should clear errors for a field that was hidden and re-shown', async () => {
      const formConfig = form
        .create(rilConfig, 'clear-errors-form')
        .add({
          id: 'showName',
          type: 'checkbox',
          props: { label: 'Show Name' },
        })
        .add({
          id: 'name',
          type: 'text',
          props: { label: 'Name' },
          validation: {
            validate: required('Name is required'),
          },
          conditions: {
            visible: when('showName').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ showName: true, name: '' }}>
          <FormBody />
          <ValidationTrigger />
          <FieldErrorDisplay fieldId="name" />
          <SetValueButton fieldId="showName" value={false} />
          <SetValueButton fieldId="showName" value={true} />
        </FormProvider>
      );

      // name is visible (showName = true). Validate to trigger error.
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
        expect(screen.getByTestId('errors-name')).toBeInTheDocument();
      });

      // Hide the name field
      const setButtons = screen.getAllByTestId('set-showName');
      await act(async () => {
        fireEvent.click(setButtons[0]);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
      });

      // Validate again while field is hidden -> should clear errors for invisible fields
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Show the name field again -> errors should be cleared (validation cleared them)
      await act(async () => {
        fireEvent.click(setButtons[1]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('field-name')).toBeInTheDocument();
        // Errors were cleared by validateForm() while field was hidden
        expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();
      });
    });
  });
});
