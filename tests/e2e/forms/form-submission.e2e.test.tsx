import { ril, required } from '@rilaykit/core';
import { form, FormBody, FormProvider, useFormConfigContext } from '@rilaykit/forms';
import { useFormStoreApi, useFormValues, useFormSubmitState } from '@rilaykit/forms';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockTextInput,
  MockNumberInput,
  FormValuesDisplay,
  FormStateDisplay,
  SubmitButton,
  SetValueButton,
  ValidationTrigger,
  FieldErrorDisplay,
  StoreInspector,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// SETUP
// ============================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

// ============================================================================
// TESTS
// ============================================================================

describe('Form Submission — E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createTestRilConfig();
  });

  // --------------------------------------------------------------------------
  // 1. Prevent double submission
  // --------------------------------------------------------------------------

  it('should prevent double submission when clicking submit twice rapidly', async () => {
    // Arrange
    let resolveSubmit: () => void;
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveSubmit = r;
        })
    );

    const formConfig = form
      .create(rilConfig, 'double-submit-test')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ name: 'Alice' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
      </FormProvider>
    );

    // Act — click submit twice rapidly
    fireEvent.click(screen.getByTestId('submit-btn'));
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — onSubmit should only be called once
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Resolve the pending submission
    await act(async () => {
      resolveSubmit!();
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
    });

    // Confirm still only one call
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // 2. Show submitting state during async submit
  // --------------------------------------------------------------------------

  it('should transition isSubmitting true then false during async submit', async () => {
    // Arrange
    let resolveSubmit: () => void;
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveSubmit = r;
        })
    );

    const formConfig = form
      .create(rilConfig, 'submitting-state-test')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ title: 'Test' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
      </FormProvider>
    );

    // Pre-condition
    expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');

    // Act — trigger submit
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — isSubmitting should be true while async onSubmit is pending
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
    });

    // Resolve the submission
    await act(async () => {
      resolveSubmit!();
    });

    // Assert — isSubmitting should return to false
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // 3. Handle submission error gracefully
  // --------------------------------------------------------------------------

  it('should handle submission error gracefully and remain interactive', async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'));

    const formConfig = form
      .create(rilConfig, 'error-handling-test')
      .add({ id: 'email', type: 'text', props: { label: 'Email' } })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ email: 'test@example.com' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
        <FormValuesDisplay />
      </FormProvider>
    );

    // Act — submit (which will reject)
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — isSubmitting returns to false after error
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
    });

    // Assert — form values are preserved
    const values = JSON.parse(screen.getByTestId('form-values').textContent!);
    expect(values.email).toBe('test@example.com');

    // Assert — form remains interactive (can type into field)
    fireEvent.change(screen.getByTestId('input-email'), {
      target: { value: 'updated@example.com' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-email')).toHaveValue('updated@example.com');
    });

    consoleErrorSpy.mockRestore();
  });

  // --------------------------------------------------------------------------
  // 4. Validate before submitting
  // --------------------------------------------------------------------------

  it('should validate before submitting and block if invalid', async () => {
    // Arrange
    const onSubmit = vi.fn();

    const formConfig = form
      .create(rilConfig, 'validate-before-submit-test')
      .add({
        id: 'username',
        type: 'text',
        props: { label: 'Username' },
        validation: { validate: required('Username is required') },
      })
      .build();

    let storeRef: ReturnType<typeof useFormStoreApi> | null = null;

    function StoreCapture() {
      storeRef = useFormStoreApi();
      return null;
    }

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
        <FieldErrorDisplay fieldId="username" />
        <StoreCapture />
      </FormProvider>
    );

    // Act — submit with empty required field
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — error appears via reactive FieldErrorDisplay
    await waitFor(() => {
      expect(screen.getByTestId('error-username-0')).toHaveTextContent('Username is required');
    });

    // Assert — store also has the error
    const errors = storeRef!.getState().errors;
    expect(errors.username).toBeDefined();
    expect(errors.username.length).toBeGreaterThan(0);
    expect(errors.username[0].message).toBe('Username is required');

    expect(onSubmit).not.toHaveBeenCalled();

    // Assert — isSubmitting returned to false (not stuck)
    expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
  });

  // --------------------------------------------------------------------------
  // 5. Native form submit
  // --------------------------------------------------------------------------

  it('should handle native form submit event', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const formConfig = form
      .create(rilConfig, 'native-submit-test')
      .add({ id: 'note', type: 'text', props: { label: 'Note' } })
      .build();

    const { container } = render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ note: 'Hello' }}
        onSubmit={onSubmit}
      >
        <FormBody />
      </FormProvider>
    );

    // Act — trigger native form submit
    fireEvent.submit(container.querySelector('form')!);

    // Assert
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({ note: 'Hello' });
    });
  });

  // --------------------------------------------------------------------------
  // 6. Structure composite keys on submit
  // --------------------------------------------------------------------------

  it('should structure composite keys into nested arrays on submit', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const formConfig = form
      .create(rilConfig, 'composite-keys-test')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('items', (r) =>
        r
          .add({ id: 'name', type: 'text', props: { label: 'Name' } })
          .add({ id: 'qty', type: 'number', props: { label: 'Qty' } })
          .defaultValue({ name: '', qty: 0 })
      )
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ title: 'Order', items: [{ name: 'Widget', qty: 2 }] }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <StoreInspector />
      </FormProvider>
    );

    // Verify store has composite keys (flat representation)
    await waitFor(() => {
      const storeValues = JSON.parse(screen.getByTestId('store-values').textContent!);
      expect(storeValues['items[k0].name']).toBe('Widget');
      expect(storeValues['items[k0].qty']).toBe(2);
      expect(storeValues.title).toBe('Order');
    });

    // Act — submit
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — onSubmit receives structured nested data
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Order',
        items: [{ name: 'Widget', qty: 2 }],
      });
    });
  });

  // --------------------------------------------------------------------------
  // 7. BUG HUNT: submit error leaves clean state
  // --------------------------------------------------------------------------

  it('should leave clean state after submit error — no state corruption', async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network failure'));

    const formConfig = form
      .create(rilConfig, 'error-clean-state-test')
      .add({
        id: 'firstName',
        type: 'text',
        props: { label: 'First Name' },
        validation: { validate: required() },
      })
      .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ firstName: 'John', lastName: 'Doe' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
        <FormValuesDisplay />
        <StoreInspector />
      </FormProvider>
    );

    // Act — submit (onSubmit will throw)
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — wait for error to be handled
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // Assert — isSubmitting is back to false
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
    });

    // Assert — isValid remains correct (data was valid, error was in onSubmit)
    expect(screen.getByTestId('is-valid')).toHaveTextContent('true');

    // Assert — all form values are preserved
    const values = JSON.parse(screen.getByTestId('form-values').textContent!);
    expect(values.firstName).toBe('John');
    expect(values.lastName).toBe('Doe');

    // Assert — no spurious errors in the store
    const errors = JSON.parse(screen.getByTestId('store-errors').textContent!);
    const hasErrors = Object.values(errors).some(
      (fieldErrors: any) => fieldErrors && fieldErrors.length > 0
    );
    expect(hasErrors).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  // --------------------------------------------------------------------------
  // 8. BUG HUNT: submit with empty repeatable
  // --------------------------------------------------------------------------

  it('should submit with empty repeatable as empty array, not undefined', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const formConfig = form
      .create(rilConfig, 'empty-repeatable-test')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('items', (r) =>
        r
          .add({ id: 'name', type: 'text', props: { label: 'Name' } })
          .min(0)
          .defaultValue({ name: '' })
      )
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ title: 'Empty Order' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <StoreInspector />
      </FormProvider>
    );

    // Verify no items exist in repeatable order
    await waitFor(() => {
      const order = JSON.parse(screen.getByTestId('store-repeatable-order').textContent!);
      // items key should exist with empty array, or not exist (depending on init)
      const itemsOrder = order.items ?? [];
      expect(itemsOrder).toHaveLength(0);
    });

    // Act — submit with no repeatable items
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert — onSubmit receives items as empty array, NOT undefined
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.title).toBe('Empty Order');
    expect(submittedData.items).toBeDefined();
    expect(submittedData.items).toEqual([]);
    expect(submittedData.items).not.toBeUndefined();
  });
});
