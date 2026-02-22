import { ril, when } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider } from '../../src/components/FormProvider';
import { useFormStoreApi } from '../../src/stores';

// =================================================================
// MOCK COMPONENTS
// =================================================================

const MockTextInput = ({ id, value, onChange, props }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <input
      data-testid={`input-${id}`}
      value={value || ''}
      onChange={(e: any) => onChange?.(e.target.value)}
    />
  </div>
);

const MockSelectInput = ({ id, value, onChange, props }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <select
      data-testid={`input-${id}`}
      value={value || ''}
      onChange={(e: any) => onChange?.(e.target.value)}
    >
      {props?.options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// =================================================================
// HELPERS
// =================================================================

let rilConfig: any;

const TestBodyRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

function SetValueButton({ fieldId, value }: { fieldId: string; value: unknown }) {
  const store = useFormStoreApi();
  return (
    <button
      data-testid={`set-${fieldId}`}
      onClick={() => store.getState()._setValue(fieldId, value)}
    >
      Set {fieldId}
    </button>
  );
}

// =================================================================
// TESTS
// =================================================================

describe('Repeatable Fields — Conditions Integration', () => {
  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text',
        renderer: MockTextInput,
        defaultProps: { label: '' },
      })
      .addComponent('select', {
        name: 'Select',
        renderer: MockSelectInput,
        defaultProps: { label: '', options: [] },
      })
      .configure({
        bodyRenderer: TestBodyRenderer,
        rowRenderer: TestRowRenderer,
      });
  });

  describe('intra-item conditions', () => {
    it('should scope conditions within the same item', async () => {
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

      // Physical item — weight should be visible
      await waitFor(() => {
        expect(screen.getByTestId('field-items[k0].weight')).toBeInTheDocument();
      });

      // Digital item — weight should NOT be in the DOM (FormRow filters invisible fields)
      expect(screen.queryByTestId('field-items[k1].weight')).not.toBeInTheDocument();
    });
  });

  describe('global field conditions in repeatable', () => {
    it('should reference global fields from repeatable conditions', async () => {
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

      // With country = US, state should be visible
      await waitFor(() => {
        expect(screen.getByTestId('field-items[k0].state')).toBeInTheDocument();
      });

      // Change country to FR
      fireEvent.click(screen.getByTestId('set-country'));

      // State field should be removed from the DOM
      await waitFor(() => {
        expect(screen.queryByTestId('field-items[k0].state')).not.toBeInTheDocument();
      });
    });
  });
});
