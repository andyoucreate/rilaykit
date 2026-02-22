import {
  combine,
  custom,
  email,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  required,
  ril,
  when,
} from '@rilaykit/core';
import { FormBody, FormProvider, form, useFormConfigContext } from '@rilaykit/forms';
import {
  useFieldErrors,
  useFieldValidationState,
  useFormStoreApi,
  useFormValues,
} from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  FieldErrorDisplay,
  FormStateDisplay,
  FormValuesDisplay,
  MockNumberInput,
  MockTextInput,
  SetValueButton,
  SubmitButton,
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

describe('Form Validation E2E', () => {
  // --------------------------------------------------------------------------
  // 1. Validate on blur
  // --------------------------------------------------------------------------
  describe('validate on blur', () => {
    it('should show errors when an empty required field is blurred', async () => {
      const formConfig = form
        .create(rilConfig, 'blur-form')
        .add({
          id: 'name',
          type: 'text',
          props: { label: 'Name' },
          validation: {
            validate: required(),
            validateOnBlur: true,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="name" />
        </FormProvider>
      );

      // Arrange: field should be present and have no errors
      const input = screen.getByTestId('input-name');
      expect(screen.queryByTestId('errors-name')).not.toBeInTheDocument();

      // Act: focus then blur the empty field
      fireEvent.focus(input);
      fireEvent.blur(input);

      // Assert: required error should appear
      await waitFor(() => {
        expect(screen.getByTestId('errors-name')).toBeInTheDocument();
        expect(screen.getByTestId('error-name-0')).toHaveTextContent('This field is required');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. Validate on change
  // --------------------------------------------------------------------------
  describe('validate on change', () => {
    it('should show errors while typing an invalid value', async () => {
      const formConfig = form
        .create(rilConfig, 'change-form')
        .add({
          id: 'userEmail',
          type: 'text',
          props: { label: 'Email' },
          validation: {
            validate: email(),
            validateOnChange: true,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="userEmail" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-userEmail');

      // Act: type an invalid email
      fireEvent.change(input, { target: { value: 'not-an-email' } });

      // Assert: email validation error should appear
      await waitFor(() => {
        expect(screen.getByTestId('errors-userEmail')).toBeInTheDocument();
        expect(screen.getByTestId('error-userEmail-0')).toHaveTextContent(
          'Please enter a valid email address'
        );
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. Combine multiple validators
  // --------------------------------------------------------------------------
  describe('combine multiple validators', () => {
    it('should show required error on empty submit, then email error on invalid input', async () => {
      const formConfig = form
        .create(rilConfig, 'combine-form')
        .add({
          id: 'contactEmail',
          type: 'text',
          props: { label: 'Contact Email' },
          validation: {
            validate: combine(required(), email()),
          },
        })
        .build();

      const onSubmit = vi.fn();

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <FormBody />
          <FieldErrorDisplay fieldId="contactEmail" />
          <SubmitButton />
        </FormProvider>
      );

      // Act: submit with empty field
      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: required error appears (combine runs all validators)
      await waitFor(() => {
        expect(screen.getByTestId('errors-contactEmail')).toBeInTheDocument();
        expect(screen.getByTestId('error-contactEmail-0')).toHaveTextContent(
          'This field is required'
        );
      });
      expect(onSubmit).not.toHaveBeenCalled();

      // Act: type invalid non-email value and re-submit
      const input = screen.getByTestId('input-contactEmail');
      fireEvent.change(input, { target: { value: 'abc' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: email error appears (required passes, email fails)
      await waitFor(() => {
        expect(screen.getByTestId('errors-contactEmail')).toBeInTheDocument();
        expect(screen.getByTestId('error-contactEmail-0')).toHaveTextContent(
          'Please enter a valid email address'
        );
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Async validation
  // --------------------------------------------------------------------------
  describe('async validation', () => {
    it('should validate asynchronously and show errors for taken values', async () => {
      const asyncValidator = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: async (value: unknown) => {
            await new Promise((r) => setTimeout(r, 50));
            return value === 'taken' ? { issues: [{ message: 'Already taken' }] } : { value };
          },
        },
      };

      const formConfig = form
        .create(rilConfig, 'async-form')
        .add({
          id: 'username',
          type: 'text',
          props: { label: 'Username' },
          validation: {
            validate: asyncValidator,
          },
        })
        .build();

      const onSubmit = vi.fn();

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <FormBody />
          <FieldErrorDisplay fieldId="username" />
          <SubmitButton />
        </FormProvider>
      );

      // Act: set value to 'taken' and submit
      const input = screen.getByTestId('input-username');
      fireEvent.change(input, { target: { value: 'taken' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: async error appears
      await waitFor(() => {
        expect(screen.getByTestId('errors-username')).toBeInTheDocument();
        expect(screen.getByTestId('error-username-0')).toHaveTextContent('Already taken');
      });
      expect(onSubmit).not.toHaveBeenCalled();

      // Act: change to valid value and re-submit
      fireEvent.change(input, { target: { value: 'available' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: submission succeeds
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ username: 'available' }));
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. Form-level validation
  // --------------------------------------------------------------------------
  describe('form-level validation', () => {
    it('should enforce cross-field validation: email OR phone required', async () => {
      const contactSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (value: unknown) => {
            const data = value as Record<string, unknown>;
            const hasEmail = typeof data.contactEmail === 'string' && data.contactEmail.length > 0;
            const hasPhone = typeof data.contactPhone === 'string' && data.contactPhone.length > 0;

            if (!hasEmail && !hasPhone) {
              return {
                issues: [{ message: 'Either email or phone is required' }],
              };
            }
            return { value };
          },
        },
      };

      const formConfig = form
        .create(rilConfig, 'form-level-form')
        .add({ id: 'contactEmail', type: 'text', props: { label: 'Email' } })
        .add({ id: 'contactPhone', type: 'text', props: { label: 'Phone' } })
        .setValidation({ validate: contactSchema })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <ValidationTrigger />
        </FormProvider>
      );

      // Act: validate with both fields empty
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: form-level error
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
        expect(screen.getByTestId('validation-errors')).toHaveTextContent(
          'Either email or phone is required'
        );
      });

      // Act: fill email and re-validate
      const emailInput = screen.getByTestId('input-contactEmail');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: form is now valid
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 6. Error correction and resubmit
  // --------------------------------------------------------------------------
  describe('error correction and resubmit', () => {
    it('should clear errors and succeed on resubmit after correction', async () => {
      const formConfig = form
        .create(rilConfig, 'correction-form')
        .add({
          id: 'email',
          type: 'text',
          props: { label: 'Email' },
          validation: { validate: combine(required(), email()) },
        })
        .build();

      const onSubmit = vi.fn();

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <FormBody />
          <FieldErrorDisplay fieldId="email" />
          <SubmitButton />
          <FormStateDisplay />
        </FormProvider>
      );

      // Act: submit with empty field
      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: errors shown, isValid false
      await waitFor(() => {
        expect(screen.getByTestId('errors-email')).toBeInTheDocument();
        expect(screen.getByTestId('is-valid')).toHaveTextContent('false');
      });
      expect(onSubmit).not.toHaveBeenCalled();

      // Act: correct the value
      const input = screen.getByTestId('input-email');
      fireEvent.change(input, { target: { value: 'valid@email.com' } });

      // Act: re-submit
      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      // Assert: submission succeeds, errors cleared
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'valid@email.com' })
        );
      });

      await waitFor(() => {
        expect(screen.queryByTestId('errors-email')).not.toBeInTheDocument();
        expect(screen.getByTestId('is-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 7. minLength / maxLength validators
  // --------------------------------------------------------------------------
  describe('minLength / maxLength validators', () => {
    it('should reject values shorter than minLength and longer than maxLength', async () => {
      const formConfig = form
        .create(rilConfig, 'length-form')
        .add({
          id: 'code',
          type: 'text',
          props: { label: 'Code' },
          validation: {
            validate: [minLength(3), maxLength(6)],
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="code" />
          <ValidationTrigger />
        </FormProvider>
      );

      const input = screen.getByTestId('input-code');

      // Act: type 'ab' (too short) and validate
      fireEvent.change(input, { target: { value: 'ab' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: minLength error
      await waitFor(() => {
        expect(screen.getByTestId('errors-code')).toBeInTheDocument();
        expect(screen.getByTestId('error-code-0')).toHaveTextContent(
          'Must be at least 3 characters long'
        );
      });

      // Act: type 'abc' (exactly min) and validate
      fireEvent.change(input, { target: { value: 'abc' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Act: type 'abcdefg' (too long) and validate
      fireEvent.change(input, { target: { value: 'abcdefg' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: maxLength error
      await waitFor(() => {
        expect(screen.getByTestId('errors-code')).toBeInTheDocument();
        expect(screen.getByTestId('error-code-0')).toHaveTextContent(
          'Must be no more than 6 characters long'
        );
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. min / max (number) validators
  // --------------------------------------------------------------------------
  describe('min / max (number) validators', () => {
    it('should reject values outside the numeric range', async () => {
      const formConfig = form
        .create(rilConfig, 'number-form')
        .add({
          id: 'quantity',
          type: 'number',
          props: { label: 'Quantity' },
          validation: {
            validate: [min(0), max(100)],
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="quantity" />
          <ValidationTrigger />
        </FormProvider>
      );

      const input = screen.getByTestId('input-quantity');

      // Act: set -1 (below min) and validate
      fireEvent.change(input, { target: { value: '-1' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: min error
      await waitFor(() => {
        expect(screen.getByTestId('errors-quantity')).toBeInTheDocument();
        expect(screen.getByTestId('error-quantity-0')).toHaveTextContent('Must be at least 0');
      });

      // Act: set 50 (valid) and validate
      fireEvent.change(input, { target: { value: '50' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Act: set 101 (above max) and validate
      fireEvent.change(input, { target: { value: '101' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: max error
      await waitFor(() => {
        expect(screen.getByTestId('errors-quantity')).toBeInTheDocument();
        expect(screen.getByTestId('error-quantity-0')).toHaveTextContent(
          'Must be no more than 100'
        );
      });

      // Act: set boundary value 0 (exact min) and validate
      fireEvent.change(input, { target: { value: '0' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid at boundary
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Act: set boundary value 100 (exact max) and validate
      fireEvent.change(input, { target: { value: '100' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid at boundary
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 9. Pattern validator
  // --------------------------------------------------------------------------
  describe('pattern validator', () => {
    it('should reject values that do not match the regex pattern', async () => {
      const formConfig = form
        .create(rilConfig, 'pattern-form')
        .add({
          id: 'iataCode',
          type: 'text',
          props: { label: 'IATA Code' },
          validation: {
            validate: pattern(/^[A-Z]{3}$/),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="iataCode" />
          <ValidationTrigger />
        </FormProvider>
      );

      const input = screen.getByTestId('input-iataCode');

      // Act: type 'abc' (lowercase) and validate
      fireEvent.change(input, { target: { value: 'abc' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: pattern error
      await waitFor(() => {
        expect(screen.getByTestId('errors-iataCode')).toBeInTheDocument();
        expect(screen.getByTestId('error-iataCode-0')).toHaveTextContent(
          'Value does not match required pattern'
        );
      });

      // Act: type 'ABC' (valid) and validate
      fireEvent.change(input, { target: { value: 'ABC' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 10. Zod schema integration
  // --------------------------------------------------------------------------
  describe('Zod schema integration', () => {
    it('should validate using a Zod schema as Standard Schema', async () => {
      const zodEmailSchema = z.string().email('Invalid email format');

      const formConfig = form
        .create(rilConfig, 'zod-form')
        .add({
          id: 'zodEmail',
          type: 'text',
          props: { label: 'Email (Zod)' },
          validation: {
            validate: zodEmailSchema,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormBody />
          <FieldErrorDisplay fieldId="zodEmail" />
          <ValidationTrigger />
        </FormProvider>
      );

      const input = screen.getByTestId('input-zodEmail');

      // Act: type invalid email and validate
      fireEvent.change(input, { target: { value: 'not-email' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: Zod validation error
      await waitFor(() => {
        expect(screen.getByTestId('errors-zodEmail')).toBeInTheDocument();
        expect(screen.getByTestId('error-zodEmail-0')).toHaveTextContent('Invalid email format');
      });

      // Act: type valid email and validate
      fireEvent.change(input, { target: { value: 'user@example.com' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: valid
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 11. Conditional required validation
  // --------------------------------------------------------------------------
  describe('conditional required validation', () => {
    it('should add CONDITIONAL_REQUIRED error when condition is met and field is empty', async () => {
      const formConfig = form
        .create(rilConfig, 'conditional-required-form')
        .add({
          id: 'isPro',
          type: 'checkbox',
          props: { label: 'Pro account' },
        })
        .add({
          id: 'companyName',
          type: 'text',
          props: { label: 'Company Name' },
          validation: {
            // No-op validator so the field enters the validation pipeline.
            // The CONDITIONAL_REQUIRED error is added by the conditions system.
            validate: custom(() => true, ''),
          },
          conditions: {
            required: when('isPro').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ isPro: false, companyName: '' }}>
          <FormBody />
          <FieldErrorDisplay fieldId="companyName" />
          <SetValueButton fieldId="isPro" value={true} />
          <ValidationTrigger />
        </FormProvider>
      );

      // Act: validate while isPro is false (not required)
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: no error, field is not required
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Act: set isPro to true
      await act(async () => {
        fireEvent.click(screen.getByTestId('set-isPro'));
      });

      // Act: validate again with companyName still empty
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: CONDITIONAL_REQUIRED error
      await waitFor(() => {
        expect(screen.getByTestId('errors-companyName')).toBeInTheDocument();
        expect(screen.getByTestId('error-companyName-0')).toHaveTextContent(
          'This field is required'
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 12. BUG HUNT: invisible field validation
  // --------------------------------------------------------------------------
  describe('invisible field validation', () => {
    it('should skip validation and clear errors for hidden required fields', async () => {
      const formConfig = form
        .create(rilConfig, 'invisible-form')
        .add({
          id: 'show',
          type: 'checkbox',
          props: { label: 'Show field' },
        })
        .add({
          id: 'hiddenRequired',
          type: 'text',
          props: { label: 'Hidden Required' },
          validation: { validate: required() },
          conditions: {
            visible: when('show').equals(true),
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ show: true, hiddenRequired: '' }}>
          <FormBody />
          <FieldErrorDisplay fieldId="hiddenRequired" />
          <SetValueButton fieldId="show" value={false} />
          <ValidationTrigger />
        </FormProvider>
      );

      // Arrange: field is visible initially, validate to trigger errors
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: error on the visible empty required field
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
        expect(screen.getByTestId('errors-hiddenRequired')).toBeInTheDocument();
      });

      // Act: hide the field by setting show=false
      await act(async () => {
        fireEvent.click(screen.getByTestId('set-show'));
      });

      // Wait for conditions to propagate
      await waitFor(() => {
        // Field should be hidden from the DOM
        expect(screen.queryByTestId('input-hiddenRequired')).not.toBeInTheDocument();
      });

      // Act: validate again while the field is hidden
      await act(async () => {
        fireEvent.click(screen.getByTestId('validate-btn'));
      });

      // Assert: form is valid because hidden fields are skipped
      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('true');
      });

      // Assert: errors are cleared on the hidden field
      expect(screen.queryByTestId('errors-hiddenRequired')).not.toBeInTheDocument();
    });
  });
});
