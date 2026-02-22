import { required, ril, when } from '@rilaykit/core';
import { FormBody, FormProvider, form, useFormConfigContext } from '@rilaykit/forms';
import { useFormStoreApi, useFormValues, useRepeatableKeys } from '@rilaykit/forms';
import { structureFormValues, useRepeatableField } from '@rilaykit/forms';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldErrorDisplay,
  FormStateDisplay,
  FormValuesDisplay,
  MockNumberInput,
  MockSelectInput,
  MockTextInput,
  RepeatableControls,
  SetValueButton,
  StoreInspector,
  SubmitButton,
  ValidationTrigger,
} from '../_setup/test-helpers';
import { createTestRilConfig } from '../_setup/test-ril-config';

// =================================================================
// STORE ACCESSOR (for direct store manipulation in BUG HUNT tests)
// =================================================================

let storeRef: any;

function StoreAccessor() {
  const store = useFormStoreApi();
  React.useEffect(() => {
    storeRef = store;
  }, [store]);
  return null;
}

// =================================================================
// TEST SETUP
// =================================================================

let rilConfig: ReturnType<typeof createTestRilConfig>;

describe('Repeatable Fields — E2E', () => {
  beforeEach(() => {
    rilConfig = createTestRilConfig();
    storeRef = null;
  });

  // ================================================================
  // BASIC CRUD
  // ================================================================

  describe('Basic CRUD', () => {
    it('should render default repeatable items from defaultValues array', () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add(
              { id: 'name', type: 'text', props: { label: 'Name' } },
              { id: 'qty', type: 'number', props: { label: 'Qty' } }
            )
            .defaultValue({ name: '', qty: 0 })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [
              { name: 'Widget', qty: 2 },
              { name: 'Gadget', qty: 5 },
            ],
          }}
        >
          <FormBody />
          <FormValuesDisplay />
        </FormProvider>
      );

      // Verify both items are rendered with composite keys
      expect(screen.getByTestId('input-items[k0].name')).toHaveValue('Widget');
      expect(screen.getByTestId('input-items[k0].qty')).toHaveValue(2);
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('Gadget');
      expect(screen.getByTestId('input-items[k1].qty')).toHaveValue(5);
    });

    it('should add new repeatable items via append', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .defaultValue({ name: 'New Item' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: 'First' }] }}>
          <FormBody />
          <RepeatableControls repeatableId="items" />
        </FormProvider>
      );

      // Initially 1 item
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');

      // Append a new item
      fireEvent.click(screen.getByTestId('repeatable-append-items'));

      await waitFor(() => {
        expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');
      });

      // The new item should use the default value
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('New Item');
    });

    it('should remove repeatable items', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Name' } }).defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [{ name: 'Alpha' }, { name: 'Beta' }],
          }}
        >
          <FormBody />
          <RepeatableControls repeatableId="items" />
        </FormProvider>
      );

      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');

      // Remove the first item (k0)
      fireEvent.click(screen.getByTestId('repeatable-remove-items-k0'));

      await waitFor(() => {
        expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');
      });

      // Only Beta should remain (still keyed as k1)
      expect(screen.getByTestId('input-items[k1].name')).toHaveValue('Beta');
      expect(screen.queryByTestId('input-items[k0].name')).not.toBeInTheDocument();
    });

    it('should enforce min constraint (canRemove = false when at min)', () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .min(1)
            .defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: 'Only' }] }}>
          <FormBody />
          <RepeatableControls repeatableId="items" />
        </FormProvider>
      );

      // At min (1 item with min=1), canRemove should be false
      expect(screen.getByTestId('repeatable-can-remove-items')).toHaveTextContent('false');
      expect(screen.getByTestId('repeatable-remove-items-k0')).toBeDisabled();
    });

    it('should enforce max constraint (canAdd = false when at max)', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .max(2)
            .defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [{ name: 'One' }, { name: 'Two' }],
          }}
        >
          <FormBody />
          <RepeatableControls repeatableId="items" />
        </FormProvider>
      );

      // At max (2 items with max=2), canAdd should be false
      expect(screen.getByTestId('repeatable-can-add-items')).toHaveTextContent('false');
      expect(screen.getByTestId('repeatable-append-items')).toBeDisabled();
    });

    it('should move items (reorder)', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Name' } }).defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }],
          }}
        >
          <FormBody />
          <RepeatableControls repeatableId="items" />
          <StoreAccessor />
        </FormProvider>
      );

      // Initial order: k0 (Alpha), k1 (Beta), k2 (Gamma)
      expect(storeRef.getState()._repeatableOrder.items).toEqual(['k0', 'k1', 'k2']);

      // Move second item (index 1) up to index 0
      fireEvent.click(screen.getByTestId('repeatable-move-up-items-1'));

      await waitFor(() => {
        expect(storeRef.getState()._repeatableOrder.items).toEqual(['k1', 'k0', 'k2']);
      });
    });
  });

  // ================================================================
  // VALIDATION & CONDITIONS
  // ================================================================

  describe('Validation & Conditions', () => {
    it('should validate individual item fields (required() on a repeatable field)', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({
              id: 'name',
              type: 'text',
              props: { label: 'Name' },
              validation: { validate: required('Name is required') },
            })
            .defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: '' }] }}>
          <FormBody />
          <ValidationTrigger />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      });

      // Verify the errors include the repeatable field
      const errorsText = screen.getByTestId('validation-errors').textContent!;
      const errors = JSON.parse(errorsText);
      expect(errors.some((e: any) => e.message === 'Name is required')).toBe(true);
    });

    it('should scope intra-item conditions (when type=physical affects only same item weight)', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({
              id: 'type',
              type: 'select',
              props: {
                label: 'Type',
                options: [
                  { value: '', label: 'Select...' },
                  { value: 'physical', label: 'Physical' },
                  { value: 'digital', label: 'Digital' },
                ],
              },
            })
            .add({
              id: 'weight',
              type: 'text',
              props: { label: 'Weight' },
              conditions: {
                visible: when('type').equals('physical'),
              },
            })
            .defaultValue({ type: '', weight: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [
              { type: 'physical', weight: '5kg' },
              { type: 'digital', weight: '' },
            ],
          }}
        >
          <FormBody />
        </FormProvider>
      );

      // Physical item: weight should be visible
      await waitFor(() => {
        expect(screen.getByTestId('field-items[k0].weight')).toBeInTheDocument();
      });

      // Digital item: weight should NOT be visible
      expect(screen.queryByTestId('field-items[k1].weight')).not.toBeInTheDocument();
    });

    it('should reference global fields in repeatable conditions', async () => {
      const config = form
        .create(rilConfig, 'test')
        .add({
          id: 'country',
          type: 'select',
          props: {
            label: 'Country',
            options: [
              { value: '', label: 'Select...' },
              { value: 'US', label: 'United States' },
              { value: 'FR', label: 'France' },
            ],
          },
        })
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .add({
              id: 'state',
              type: 'text',
              props: { label: 'State' },
              conditions: {
                visible: when('country').equals('US'),
              },
            })
            .defaultValue({ name: '', state: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            country: 'US',
            items: [{ name: 'HQ', state: 'CA' }],
          }}
        >
          <FormBody />
          <SetValueButton fieldId="country" value="FR" />
        </FormProvider>
      );

      // With country=US, state should be visible
      await waitFor(() => {
        expect(screen.getByTestId('field-items[k0].state')).toBeInTheDocument();
      });

      // Change country to FR
      fireEvent.click(screen.getByTestId('set-country'));

      // State should disappear
      await waitFor(() => {
        expect(screen.queryByTestId('field-items[k0].state')).not.toBeInTheDocument();
      });
    });

    it('should structure values correctly on submit (composite keys to nested arrays)', async () => {
      const onSubmit = vi.fn();
      const config = form
        .create(rilConfig, 'test')
        .add({ id: 'title', type: 'text', props: { label: 'Title' } })
        .addRepeatable('items', (r) =>
          r
            .add(
              { id: 'name', type: 'text', props: { label: 'Name' } },
              { id: 'qty', type: 'number', props: { label: 'Qty' } }
            )
            .defaultValue({ name: '', qty: 0 })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            title: 'Order #1',
            items: [
              { name: 'Widget', qty: 2 },
              { name: 'Gadget', qty: 1 },
            ],
          }}
          onSubmit={onSubmit}
        >
          <FormBody />
          <SubmitButton />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          title: 'Order #1',
          items: [
            { name: 'Widget', qty: 2 },
            { name: 'Gadget', qty: 1 },
          ],
        });
      });
    });
  });

  // ================================================================
  // MULTIPLE & DEFAULTS
  // ================================================================

  describe('Multiple & Defaults', () => {
    it('should handle multiple repeatables in one form', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Item' } }).defaultValue({ name: '' })
        )
        .addRepeatable('contacts', (r) =>
          r
            .add({ id: 'email', type: 'text', props: { label: 'Email' } })
            .defaultValue({ email: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [{ name: 'Widget' }],
            contacts: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
          }}
        >
          <FormBody />
          <RepeatableControls repeatableId="items" />
          <RepeatableControls repeatableId="contacts" />
        </FormProvider>
      );

      // Items: 1 entry
      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');
      expect(screen.getByTestId('input-items[k0].name')).toHaveValue('Widget');

      // Contacts: 2 entries
      expect(screen.getByTestId('repeatable-count-contacts')).toHaveTextContent('2');
      expect(screen.getByTestId('input-contacts[k0].email')).toHaveValue('a@b.com');
      expect(screen.getByTestId('input-contacts[k1].email')).toHaveValue('c@d.com');

      // Adding to one should not affect the other
      fireEvent.click(screen.getByTestId('repeatable-append-items'));

      await waitFor(() => {
        expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('2');
      });
      expect(screen.getByTestId('repeatable-count-contacts')).toHaveTextContent('2');
    });

    it('should apply default values to new items', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add(
              { id: 'name', type: 'text', props: { label: 'Name' } },
              { id: 'qty', type: 'number', props: { label: 'Qty' } }
            )
            .defaultValue({ name: 'Untitled', qty: 1 })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [] }}>
          <FormBody />
          <RepeatableControls repeatableId="items" />
          <StoreAccessor />
        </FormProvider>
      );

      expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('0');

      // Append a new item
      fireEvent.click(screen.getByTestId('repeatable-append-items'));

      await waitFor(() => {
        expect(screen.getByTestId('repeatable-count-items')).toHaveTextContent('1');
      });

      // Verify store values have the defaults
      const storeValues = storeRef.getState().values;
      expect(storeValues['items[k0].name']).toBe('Untitled');
      expect(storeValues['items[k0].qty']).toBe(1);
    });
  });

  // ================================================================
  // BUG HUNTS (critical)
  // ================================================================

  describe('BUG HUNTS', () => {
    it('should reflect min count validation in store isValid', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .min(2)
            .defaultValue({ name: 'Item' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: 'Only One' }] }}>
          <FormBody />
          <ValidationTrigger />
          <StoreAccessor />
        </FormProvider>
      );

      // Trigger form validation
      fireEvent.click(screen.getByTestId('validate-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-valid')).toHaveTextContent('false');
      });

      // Check that validation errors include REPEATABLE_MIN_COUNT
      const errorsText = screen.getByTestId('validation-errors').textContent!;
      const errors = JSON.parse(errorsText);
      const minCountError = errors.find((e: any) => e.code === 'REPEATABLE_MIN_COUNT');
      expect(minCountError).toBeDefined();
      expect(minCountError.path).toBe('items');
      expect(minCountError.message).toContain('2');
    });

    it('should clean up ALL state when removing an item', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({
              id: 'name',
              type: 'text',
              props: { label: 'Name' },
              validation: { validate: required('Required') },
            })
            .defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{ items: [{ name: 'Keep' }, { name: '' }] }}
        >
          <FormBody />
          <StoreAccessor />
        </FormProvider>
      );

      // Set up state on the second item (k1)
      act(() => {
        const state = storeRef.getState();
        state._setValue('items[k1].name', 'Dirty');
        state._setTouched('items[k1].name');
        state._setErrors('items[k1].name', [{ message: 'Test error', code: 'TEST' }]);
        state._setFieldConditions('items[k1].name', {
          visible: true,
          disabled: false,
          required: true,
          readonly: false,
        });
      });

      // Verify the state is set
      const stateBefore = storeRef.getState();
      expect(stateBefore.values['items[k1].name']).toBe('Dirty');
      expect(stateBefore.touched['items[k1].name']).toBe(true);
      expect(stateBefore.errors['items[k1].name']).toHaveLength(1);
      expect(stateBefore._fieldConditions['items[k1].name']).toBeDefined();

      // Remove the second item
      act(() => {
        storeRef.getState()._removeRepeatableItem('items', 'k1');
      });

      // Verify ALL state is cleaned up
      const stateAfter = storeRef.getState();
      expect(stateAfter.values['items[k1].name']).toBeUndefined();
      expect(stateAfter.errors['items[k1].name']).toBeUndefined();
      expect(stateAfter.touched['items[k1].name']).toBeUndefined();
      expect(stateAfter.validationStates['items[k1].name']).toBeUndefined();
      expect(stateAfter._fieldConditions['items[k1].name']).toBeUndefined();

      // Order should no longer contain k1
      expect(stateAfter._repeatableOrder.items).toEqual(['k0']);
    });

    it('should produce correct array after removing middle item (orphaned composite keys)', async () => {
      const onSubmit = vi.fn();
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add(
              { id: 'name', type: 'text', props: { label: 'Name' } },
              { id: 'qty', type: 'number', props: { label: 'Qty' } }
            )
            .defaultValue({ name: '', qty: 0 })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [
              { name: 'First', qty: 1 },
              { name: 'Middle', qty: 2 },
              { name: 'Last', qty: 3 },
            ],
          }}
          onSubmit={onSubmit}
        >
          <FormBody />
          <StoreAccessor />
          <SubmitButton />
        </FormProvider>
      );

      // Remove the middle item (k1)
      act(() => {
        storeRef.getState()._removeRepeatableItem('items', 'k1');
      });

      // Submit
      await act(async () => {
        fireEvent.click(screen.getByTestId('submit-btn'));
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });

      // Verify the structured output is correct: 2 items, no middle data
      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData.items).toHaveLength(2);
      expect(submittedData.items[0]).toEqual({ name: 'First', qty: 1 });
      expect(submittedData.items[1]).toEqual({ name: 'Last', qty: 3 });

      // Also verify directly with structureFormValues
      const state = storeRef.getState();
      const structured = structureFormValues(
        state.values,
        state._repeatableConfigs,
        state._repeatableOrder
      );
      expect(structured.items).toHaveLength(2);
      expect(structured.items).toEqual([
        { name: 'First', qty: 1 },
        { name: 'Last', qty: 3 },
      ]);
    });

    it('should handle rapid add/remove without state corruption', () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({ id: 'name', type: 'text', props: { label: 'Name' } })
            .defaultValue({ name: 'Auto' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ items: [] }}>
          <FormBody />
          <StoreAccessor />
        </FormProvider>
      );

      // Rapidly add 10 items
      act(() => {
        for (let i = 0; i < 10; i++) {
          storeRef.getState()._appendRepeatableItem('items');
        }
      });

      let state = storeRef.getState();
      expect(state._repeatableOrder.items).toHaveLength(10);
      expect(state._repeatableNextKey.items).toBe(10);

      // Verify each key is unique
      const keys = state._repeatableOrder.items;
      expect(new Set(keys).size).toBe(10);

      // Rapidly remove all 10
      act(() => {
        for (let i = 9; i >= 0; i--) {
          storeRef.getState()._removeRepeatableItem('items', `k${i}`);
        }
      });

      state = storeRef.getState();
      expect(state._repeatableOrder.items).toHaveLength(0);

      // Next key should still be 10 (monotonically increasing)
      expect(state._repeatableNextKey.items).toBe(10);

      // No orphaned composite keys in values
      const compositeKeys = Object.keys(state.values).filter((k) => k.startsWith('items['));
      expect(compositeKeys).toHaveLength(0);
    });

    it('should fully reset form with repeatables', () => {
      const config = form
        .create(rilConfig, 'test')
        .add({ id: 'title', type: 'text', props: { label: 'Title' } })
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text', props: { label: 'Name' } }).defaultValue({ name: '' })
        )
        .build();

      render(
        <FormProvider formConfig={config} defaultValues={{ title: 'Original' }}>
          <FormBody />
          <StoreAccessor />
        </FormProvider>
      );

      // Add items and modify values
      act(() => {
        storeRef.getState()._appendRepeatableItem('items');
        storeRef.getState()._appendRepeatableItem('items');
        storeRef.getState()._setValue('items[k0].name', 'Modified');
        storeRef.getState()._setTouched('items[k0].name');
        storeRef.getState()._setErrors('items[k0].name', [{ message: 'Error', code: 'TEST' }]);
      });

      // Verify state is dirty
      let state = storeRef.getState();
      expect(state._repeatableOrder.items).toHaveLength(2);
      expect(state.isDirty).toBe(true);

      // Reset
      act(() => {
        storeRef.getState()._reset();
      });

      state = storeRef.getState();

      // Repeatable order should be empty
      expect(state._repeatableOrder).toEqual({});

      // Next key should be reset
      expect(state._repeatableNextKey).toEqual({});

      // Composite keys should be cleaned from values
      const compositeKeys = Object.keys(state.values).filter((k) => k.startsWith('items['));
      expect(compositeKeys).toHaveLength(0);

      // Errors/touched should be empty
      expect(Object.keys(state.errors)).toHaveLength(0);
      expect(Object.keys(state.touched)).toHaveLength(0);

      // Form should not be dirty
      expect(state.isDirty).toBe(false);
      expect(state.isValid).toBe(true);
    });

    it('should not crash conditions when referencing a removed repeatable item', async () => {
      const config = form
        .create(rilConfig, 'test')
        .addRepeatable('items', (r) =>
          r
            .add({
              id: 'type',
              type: 'select',
              props: {
                label: 'Type',
                options: [
                  { value: '', label: 'Select...' },
                  { value: 'physical', label: 'Physical' },
                  { value: 'digital', label: 'Digital' },
                ],
              },
            })
            .add({
              id: 'weight',
              type: 'text',
              props: { label: 'Weight' },
              conditions: {
                visible: when('type').equals('physical'),
              },
            })
            .defaultValue({ type: '', weight: '' })
        )
        .build();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [
              { type: 'physical', weight: '5kg' },
              { type: 'digital', weight: '' },
            ],
          }}
        >
          <FormBody />
          <StoreAccessor />
        </FormProvider>
      );

      // Verify initial render works
      await waitFor(() => {
        expect(screen.getByTestId('field-items[k0].weight')).toBeInTheDocument();
      });

      // Remove first item - should not crash condition evaluation
      act(() => {
        storeRef.getState()._removeRepeatableItem('items', 'k0');
      });

      // Should not crash, and second item should still render
      await waitFor(() => {
        expect(screen.queryByTestId('field-items[k0].weight')).not.toBeInTheDocument();
        // k1 is digital, so weight should not be visible
        expect(screen.queryByTestId('field-items[k1].weight')).not.toBeInTheDocument();
        // But k1's type should still be rendered
        expect(screen.getByTestId('field-items[k1].type')).toBeInTheDocument();
      });
    });
  });
});
