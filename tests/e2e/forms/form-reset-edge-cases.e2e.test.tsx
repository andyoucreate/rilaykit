import { required, ril, when } from '@rilaykit/core';
import { FormBody, FormProvider, form, useFormConfigContext } from '@rilaykit/forms';
import { useFormStoreApi, useFormSubmitState, useFormValues } from '@rilaykit/forms';
import { useRepeatableField } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FormStateDisplay,
  FormValuesDisplay,
  MockNumberInput,
  MockTextInput,
  RepeatableControls,
  SetValueButton,
  StoreInspector,
  SubmitButton,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// ============================================================================
// SETUP
// ============================================================================

import type { FormConfiguration } from '@rilaykit/core';

let rilConfig: ReturnType<typeof createTestRilConfig>;

// ============================================================================
// TESTS
// ============================================================================

describe('Form Reset & Edge Cases — E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rilConfig = createTestRilConfig();
  });

  // --------------------------------------------------------------------------
  // 1. Empty form submit
  // --------------------------------------------------------------------------

  it('should submit an empty form and call onSubmit with {}', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const formConfig = form.create(rilConfig, 'empty-form').build();

    render(
      <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
        <FormBody />
        <SubmitButton />
      </FormProvider>
    );

    // Act
    fireEvent.click(screen.getByTestId('submit-btn'));

    // Assert
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({});
    });
  });

  // --------------------------------------------------------------------------
  // 2. Form clone independence
  // --------------------------------------------------------------------------

  it('should produce independent builders when cloning', () => {
    // Arrange
    const builder1 = form
      .create(rilConfig, 'original')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } });

    // Act — clone and add an extra field to the clone only
    const builder2 = builder1.clone('clone');
    builder2.add({ id: 'email', type: 'text', props: { label: 'Email' } });

    const config1 = builder1.build();
    const config2 = builder2.build();

    // Assert — original should NOT have the extra field
    expect(config1.allFields).toHaveLength(1);
    expect(config1.allFields[0].id).toBe('name');

    expect(config2.allFields).toHaveLength(2);
    expect(config2.allFields.map((f) => f.id)).toEqual(['name', 'email']);

    // IDs should differ
    expect(config1.id).toBe('original');
    expect(config2.id).toBe('clone');
  });

  // --------------------------------------------------------------------------
  // 3. toJSON / fromJSON roundtrip
  // --------------------------------------------------------------------------

  it('should roundtrip a form config through toJSON / fromJSON', () => {
    // Arrange — build a form with fields, validation, and conditions
    const original = form
      .create(rilConfig, 'roundtrip-form')
      .add({
        id: 'firstName',
        type: 'text',
        props: { label: 'First Name' },
        validation: { validate: required('First name is required') },
      })
      .add({
        id: 'lastName',
        type: 'text',
        props: { label: 'Last Name' },
        conditions: {
          visible: when('firstName').exists().build(),
        },
      })
      .add({ id: 'age', type: 'number', props: { label: 'Age' } });

    // Act — serialize then deserialize
    const json = original.toJSON();
    const restored = form.create(rilConfig, 'temp').fromJSON(json);
    const restoredConfig = restored.build();
    const originalConfig = original.build();

    // Assert — same id, same fields, same structure
    expect(restoredConfig.id).toBe(originalConfig.id);
    expect(restoredConfig.allFields).toHaveLength(originalConfig.allFields.length);

    // Field IDs match in order
    const originalFieldIds = originalConfig.allFields.map((f) => f.id);
    const restoredFieldIds = restoredConfig.allFields.map((f) => f.id);
    expect(restoredFieldIds).toEqual(originalFieldIds);

    // Row count matches
    expect(restoredConfig.rows).toHaveLength(originalConfig.rows.length);

    // Validation is preserved on the first field
    expect(restoredConfig.allFields[0].validation).toBeDefined();
    expect(restoredConfig.allFields[0].validation?.validate).toBeDefined();

    // Conditions are preserved on the second field
    expect(restoredConfig.allFields[1].conditions).toBeDefined();
    expect(restoredConfig.allFields[1].conditions?.visible).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 4. Repeatable with min=max (fixed count)
  // --------------------------------------------------------------------------

  it('should enforce fixed count when min equals max', async () => {
    // Arrange
    const formConfig = form
      .create(rilConfig, 'fixed-repeatable')
      .addRepeatable('items', (r) =>
        r
          .add({ id: 'label', type: 'text', props: { label: 'Label' } })
          .min(3)
          .max(3)
          .defaultValue({ label: '' })
      )
      .build();

    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }}
      >
        <FormBody />
        <RepeatableControls repeatableId="items" />
      </FormProvider>
    );

    // Assert — count is 3, cannot add, cannot remove
    await waitFor(() => {
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('3');
      expect(screen.getByTestId('repeatable-can-add-items')).toHaveTextContent('false');
      expect(screen.getByTestId('repeatable-can-remove-items')).toHaveTextContent('false');
    });
  });

  // --------------------------------------------------------------------------
  // 5. BUG HUNT: defaultValues with unknown keys
  // --------------------------------------------------------------------------

  it('should not crash when defaultValues contain unknown field keys', async () => {
    // Arrange
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const formConfig = form
      .create(rilConfig, 'unknown-keys')
      .add({ id: 'name', type: 'text', props: { label: 'Name' } })
      .build();

    // Act — pass extra keys that don't match any field
    render(
      <FormProvider
        formConfig={formConfig}
        defaultValues={{ name: 'John', unknownField: 'test', anotherUnknown: 123 }}
        onSubmit={onSubmit}
      >
        <FormBody />
        <FormValuesDisplay />
        <SubmitButton />
      </FormProvider>
    );

    // Assert — the known field has the correct value
    expect(screen.getByTestId('input-name')).toHaveValue('John');

    // Submit should not crash
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    // onSubmit receives values from the store (may include extra keys — that's OK)
    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.name).toBe('John');
    // Verify no crash occurred — the test reaching this point is the assertion
  });

  // --------------------------------------------------------------------------
  // 6. BUG HUNT: form ID change resets properly
  // --------------------------------------------------------------------------

  it('should reset values when formConfig.id changes', async () => {
    // Arrange
    function TestWrapper() {
      const [configId, setConfigId] = useState('form-1');
      const formConfig = form
        .create(rilConfig, configId)
        .add({ id: 'name', type: 'text', props: { label: 'Name' } })
        .build();

      return (
        <>
          <FormProvider formConfig={formConfig} defaultValues={{ name: 'default' }}>
            <FormBody />
            <FormValuesDisplay />
            <SetValueButton fieldId="name" value="modified" />
          </FormProvider>
          <button type="button" data-testid="change-config" onClick={() => setConfigId('form-2')}>
            Change
          </button>
        </>
      );
    }

    render(<TestWrapper />);

    // Pre-condition — field starts with default value
    expect(screen.getByTestId('input-name')).toHaveValue('default');

    // Act — modify the value
    fireEvent.click(screen.getByTestId('set-name'));

    await waitFor(() => {
      expect(screen.getByTestId('input-name')).toHaveValue('modified');
    });

    // Act — change the formConfig id
    fireEvent.click(screen.getByTestId('change-config'));

    // Assert — values should reset to default
    await waitFor(() => {
      const values = JSON.parse(screen.getByTestId('form-values').textContent!);
      expect(values.name).toBe('default');
    });
  });
});
