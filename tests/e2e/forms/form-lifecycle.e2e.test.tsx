import { email, required } from '@rilaykit/core';
import { form, FormBody, FormProvider } from '@rilaykit/forms';
import { useFormStoreApi } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  FormStateDisplay,
  FormValuesDisplay,
  ResetButton,
  SetValueButton,
  SubmitButton,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

let rilConfig: ReturnType<typeof createTestRilConfig>;

// ============================================================================
// TESTS
// ============================================================================

describe('Form Lifecycle — E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createTestRilConfig();
  });

  // --------------------------------------------------------------------------
  // 1. Render all fields from builder config
  // --------------------------------------------------------------------------

  it('should render all fields defined in the builder config', () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'render-test')
      .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
      .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
      .add({ id: 'age', type: 'number', props: { label: 'Age' } })
      .build();

    // Act
    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    // Assert
    expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    expect(screen.getByTestId('field-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('field-age')).toBeInTheDocument();
    expect(screen.getByTestId('input-firstName')).toBeInTheDocument();
    expect(screen.getByTestId('input-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('input-age')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 2. Initialize with defaultValues
  // --------------------------------------------------------------------------

  it('should initialize fields with provided defaultValues', () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'defaults-test')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .add({ id: 'email', type: 'text', props: { label: 'Email' } })
      .build();

    const defaultValues = { name: 'Alice', email: 'alice@test.com' };

    // Act
    render(
      <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
        <FormBody />
        <FormValuesDisplay />
      </FormProvider>
    );

    // Assert
    expect(screen.getByTestId('input-name')).toHaveValue('Alice');
    expect(screen.getByTestId('input-email')).toHaveValue('alice@test.com');

    const values = JSON.parse(screen.getByTestId('form-values').textContent!);
    expect(values.name).toBe('Alice');
    expect(values.email).toBe('alice@test.com');
  });

  // --------------------------------------------------------------------------
  // 3. Update values on user interaction
  // --------------------------------------------------------------------------

  it('should update values when user types into fields', async () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'interaction-test')
      .add({ id: 'username', type: 'text', props: { label: 'Username' } })
      .build();

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
        <FormValuesDisplay />
      </FormProvider>
    );

    // Act
    fireEvent.change(screen.getByTestId('input-username'), {
      target: { value: 'bob42' },
    });

    // Assert
    await waitFor(() => {
      const values = JSON.parse(screen.getByTestId('form-values').textContent!);
      expect(values.username).toBe('bob42');
    });

    expect(screen.getByTestId('input-username')).toHaveValue('bob42');
  });

  // --------------------------------------------------------------------------
  // 4. Track touched state on blur
  // --------------------------------------------------------------------------

  it('should track touched state when a field is blurred', async () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'touched-test')
      .add({ id: 'city', type: 'text', props: { label: 'City' } })
      .build();

    let storeRef: ReturnType<typeof useFormStoreApi> | null = null;

    function StoreCapture() {
      storeRef = useFormStoreApi();
      return null;
    }

    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
        <StoreCapture />
      </FormProvider>
    );

    // Pre-condition: field not touched
    expect(storeRef!.getState().touched).toEqual({});

    // Act
    fireEvent.blur(screen.getByTestId('input-city'));

    // Assert
    await waitFor(() => {
      expect(storeRef!.getState().touched.city).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Validate required fields on submit attempt
  // --------------------------------------------------------------------------

  it('should validate required fields and prevent submit when invalid', async () => {
    // Arrange
    const onSubmit = vi.fn();
    const formConfig = form
      .create(rilConfig, 'required-test')
      .add({
        id: 'fullName',
        type: 'text',
        props: { label: 'Full Name' },
        validation: { validate: required('Name is required') },
      })
      .add({
        id: 'contactEmail',
        type: 'text',
        props: { label: 'Email' },
        validation: { validate: email('Invalid email') },
      })
      .build();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <SubmitButton />
        <FieldErrorDisplay fieldId="fullName" />
        <FieldErrorDisplay fieldId="contactEmail" />
      </FormProvider>
    );

    // Act - submit with empty fields
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert - onSubmit should NOT be called
    await waitFor(() => {
      expect(screen.getByTestId('errors-fullName')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 6. Submit successfully with valid data
  // --------------------------------------------------------------------------

  it('should submit successfully when all fields are valid', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const formConfig = form
      .create(rilConfig, 'submit-test')
      .add({
        id: 'title',
        type: 'text',
        props: { label: 'Title' },
        validation: { validate: required() },
      })
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ title: 'My Title' }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <SubmitButton />
        <FormStateDisplay />
      </FormProvider>
    );

    // Act
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({ title: 'My Title' });
    });

    // isSubmitting should return to false
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Fire onFieldChange callback on every change
  // --------------------------------------------------------------------------

  it('should fire onFieldChange callback for every field value change', async () => {
    // Arrange
    const onFieldChange = vi.fn();
    const formConfig = form
      .create(rilConfig, 'callback-test')
      .add({ id: 'search', type: 'text', props: { label: 'Search' } })
      .add({ id: 'category', type: 'text', props: { label: 'Category' } })
      .build();

    render(
      <FormProvider formConfig={formConfig} onFieldChange={onFieldChange}>
        <FormBody />
      </FormProvider>
    );

    // Act - change first field
    fireEvent.change(screen.getByTestId('input-search'), {
      target: { value: 'hello' },
    });

    // Assert
    await waitFor(() => {
      expect(onFieldChange).toHaveBeenCalledWith('search', 'hello', expect.any(Object));
    });

    // Act - change second field
    fireEvent.change(screen.getByTestId('input-category'), {
      target: { value: 'tech' },
    });

    await waitFor(() => {
      expect(onFieldChange).toHaveBeenCalledWith('category', 'tech', expect.any(Object));
    });

    expect(onFieldChange).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // 8. Handle multi-row layout (3 fields in same row)
  // --------------------------------------------------------------------------

  it('should render three fields in the same row when using variadic add', () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'multirow-test')
      .add(
        { id: 'city', type: 'text', props: { label: 'City' } },
        { id: 'state', type: 'text', props: { label: 'State' } },
        { id: 'zip', type: 'text', props: { label: 'ZIP' } }
      )
      .build();

    // Verify builder output: single row with 3 fields
    expect(formConfig.rows).toHaveLength(1);
    expect(formConfig.rows[0].kind).toBe('fields');
    if (formConfig.rows[0].kind === 'fields') {
      expect(formConfig.rows[0].fields).toHaveLength(3);
    }

    // Act
    render(
      <FormProvider formConfig={formConfig}>
        <FormBody />
      </FormProvider>
    );

    // Assert - all three fields are rendered
    expect(screen.getByTestId('field-city')).toBeInTheDocument();
    expect(screen.getByTestId('field-state')).toBeInTheDocument();
    expect(screen.getByTestId('field-zip')).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // 9. Reset form to default values
  // --------------------------------------------------------------------------

  it('should reset the form to default values and clear dirty state', async () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'reset-test')
      .add({ id: 'nickname', type: 'text', props: { label: 'Nickname' } })
      .build();

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ nickname: 'Original' }}>
        <FormBody />
        <FormValuesDisplay />
        <FormStateDisplay />
        <SetValueButton fieldId="nickname" value="Modified" />
        <ResetButton />
      </FormProvider>
    );

    // Pre-condition
    expect(screen.getByTestId('input-nickname')).toHaveValue('Original');
    expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');

    // Act - modify value
    fireEvent.click(screen.getByTestId('set-nickname'));

    await waitFor(() => {
      expect(screen.getByTestId('input-nickname')).toHaveValue('Modified');
      expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');
    });

    // Act - reset
    fireEvent.click(screen.getByTestId('reset-btn'));

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('input-nickname')).toHaveValue('Original');
      expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');
    });
  });

  // --------------------------------------------------------------------------
  // 10. BUG HUNT: reset with repeatables
  // --------------------------------------------------------------------------

  it('should clean composite keys and _repeatableOrder on reset with repeatables', async () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'repeatable-reset-test')
      .add({ id: 'title', type: 'text', props: { label: 'Title' } })
      .addRepeatable('items', (r) =>
        r
          .add({ id: 'name', type: 'text', props: { label: 'Name' } })
          .defaultValue({ name: '' })
      )
      .build();

    let storeRef: ReturnType<typeof useFormStoreApi> | null = null;

    function StoreCapture() {
      storeRef = useFormStoreApi();
      return null;
    }

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ title: 'Order' }}>
        <FormBody />
        <StoreCapture />
      </FormProvider>
    );

    // Act - add items and modify values directly via store
    act(() => {
      const state = storeRef!.getState();
      state._appendRepeatableItem('items');
      state._appendRepeatableItem('items');
      state._setValue('items[k0].name', 'Item A');
      state._setValue('items[k1].name', 'Item B');
    });

    // Verify items were added
    expect(storeRef!.getState().values['items[k0].name']).toBe('Item A');
    expect(storeRef!.getState().values['items[k1].name']).toBe('Item B');
    expect(storeRef!.getState()._repeatableOrder.items).toEqual(['k0', 'k1']);
    expect(storeRef!.getState().isDirty).toBe(true);

    // Act - reset form
    act(() => {
      storeRef!.getState()._reset();
    });

    // Assert - composite keys cleaned, repeatableOrder empty, values reset
    const resetState = storeRef!.getState();

    expect(resetState.values['items[k0].name']).toBeUndefined();
    expect(resetState.values['items[k1].name']).toBeUndefined();
    expect(resetState.values.title).toBe('Order');

    expect(resetState._repeatableOrder).toEqual({});
    expect(resetState._repeatableNextKey).toEqual({});

    expect(resetState.touched).toEqual({});
    expect(resetState.errors).toEqual({});
    expect(resetState.isDirty).toBe(false);
    expect(resetState.isSubmitting).toBe(false);
    expect(resetState.isValid).toBe(true);
  });
});
