// @ts-nocheck
import { onChange, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';

// ---------------------------------------------------------------------------
// Mock components
// ---------------------------------------------------------------------------

const MockSelect = ({ id, props, field }: any) => (
  <div data-testid={`field-${id}`}>
    <select
      data-testid={`select-${id}`}
      value={field?.value ?? ''}
      onChange={(e) => field?.onChange(e.target.value)}
    >
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

const MockText = ({ id, props, field }: any) => (
  <div data-testid={`field-${id}`}>
    <input
      data-testid={`input-${id}`}
      value={field?.value ?? ''}
      onChange={(e) => field?.onChange(e.target.value)}
      readOnly={props.readOnly || false}
      data-readonly={String(!!props.readOnly)}
    />
  </div>
);

const MockNumber = ({ id, props, field }: any) => (
  <div data-testid={`field-${id}`}>
    <input
      data-testid={`input-${id}`}
      type="number"
      value={field?.value ?? ''}
      onChange={(e) => field?.onChange(e.target.value)}
      readOnly={props.readOnly || false}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Shared ril config
// ---------------------------------------------------------------------------

function createConfig() {
  return ril
    .create()
    .component('text', {
      name: 'Text Input',
      renderer: MockText,
    })
    .component('select', {
      name: 'Select Input',
      renderer: MockSelect,
      defaultProps: { options: [] },
    })
    .component('number', {
      name: 'Number Input',
      renderer: MockNumber,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FormField — Effects Integration', () => {
  let config: ReturnType<typeof createConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createConfig();
  });

  // =========================================================================
  // 1. setProps updates rendered component
  // =========================================================================

  describe('setProps updates rendered component', () => {
    it('should update city options when country changes', async () => {
      const franceCities = [
        { value: 'paris', label: 'Paris' },
        { value: 'lyon', label: 'Lyon' },
      ];

      const formConfig = form
        .create<any>(config, 'test-effects-setprops')
        .add({
          id: 'country',
          type: 'select',
          props: {
            options: [
              { value: 'france', label: 'France' },
              { value: 'spain', label: 'Spain' },
            ],
          },
        })
        .add({
          id: 'city',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('country', (value, { setProps }) => {
              if (value === 'france') {
                setProps('city', { options: franceCities });
              }
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="country" />
          <FormField id="city" />
        </FormProvider>
      );

      // Initially city has no options
      expect(screen.getByTestId('select-city').querySelectorAll('option')).toHaveLength(0);

      // Change country to france
      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'france' },
      });

      await waitFor(() => {
        const options = screen.getByTestId('select-city').querySelectorAll('option');
        expect(options).toHaveLength(2);
        expect(options[0]).toHaveTextContent('Paris');
        expect(options[1]).toHaveTextContent('Lyon');
      });
    });
  });

  // =========================================================================
  // 2. Cascading dropdowns — country change resets city + updates options
  // =========================================================================

  describe('Cascading dropdowns', () => {
    it('should reset city value and update options when country changes', async () => {
      const countryCities: Record<string, Array<{ value: string; label: string }>> = {
        france: [
          { value: 'paris', label: 'Paris' },
          { value: 'lyon', label: 'Lyon' },
        ],
        spain: [
          { value: 'madrid', label: 'Madrid' },
          { value: 'barcelona', label: 'Barcelona' },
        ],
      };

      const formConfig = form
        .create<any>(config, 'test-cascading')
        .add({
          id: 'country',
          type: 'select',
          props: {
            options: [
              { value: 'france', label: 'France' },
              { value: 'spain', label: 'Spain' },
            ],
          },
        })
        .add({
          id: 'city',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('country', (value, { setValue, setProps }) => {
              setValue('city', '');
              setProps('city', { options: countryCities[value as string] ?? [] });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="country" />
          <FormField id="city" />
        </FormProvider>
      );

      // Select France
      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'france' },
      });

      await waitFor(() => {
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        expect(cityOptions).toHaveLength(2);
        expect(cityOptions[0]).toHaveTextContent('Paris');
      });

      // Select a city
      fireEvent.change(screen.getByTestId('select-city'), {
        target: { value: 'paris' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('select-city')).toHaveValue('paris');
      });

      // Now switch country to Spain — city options should change to Spanish cities
      fireEvent.change(screen.getByTestId('select-country'), {
        target: { value: 'spain' },
      });

      await waitFor(() => {
        // City options should be Spanish cities
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        expect(cityOptions).toHaveLength(2);
        expect(cityOptions[0]).toHaveTextContent('Madrid');
        expect(cityOptions[1]).toHaveTextContent('Barcelona');
      });
    });
  });

  // =========================================================================
  // 3. Calculated field — price * quantity = total
  // =========================================================================

  describe('Calculated field', () => {
    it('should recompute total when price changes', async () => {
      const formConfig = form
        .create<any>(config, 'test-calculated')
        .add({
          id: 'price',
          type: 'number',
          props: {},
        })
        .add({
          id: 'quantity',
          type: 'number',
          props: {},
        })
        .add({
          id: 'total',
          type: 'number',
          props: { readOnly: true },
          effects: [
            onChange('price', (_value, { getFieldValue, setValue }) => {
              const price = Number(getFieldValue('price')) || 0;
              const quantity = Number(getFieldValue('quantity')) || 0;
              setValue('total', price * quantity);
            }),
            onChange('quantity', (_value, { getFieldValue, setValue }) => {
              const price = Number(getFieldValue('price')) || 0;
              const quantity = Number(getFieldValue('quantity')) || 0;
              setValue('total', price * quantity);
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ price: '10', quantity: '2' }}>
          <FormField id="price" />
          <FormField id="quantity" />
          <FormField id="total" />
        </FormProvider>
      );

      // Initial effects should compute total from default values (10 * 2 = 20)
      // setValue sets a number, so input type=number will have a numeric value
      await waitFor(() => {
        expect(screen.getByTestId('input-total')).toHaveValue(20);
      });

      // Change price to 25
      fireEvent.change(screen.getByTestId('input-price'), {
        target: { value: '25' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-total')).toHaveValue(50);
      });

      // Change quantity to 4
      fireEvent.change(screen.getByTestId('input-quantity'), {
        target: { value: '4' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-total')).toHaveValue(100);
      });
    });
  });

  // =========================================================================
  // 4. defaultValues trigger effects at mount
  // =========================================================================

  describe('defaultValues trigger effects at mount', () => {
    it('should run effects on mount when defaultValues are provided', async () => {
      const franceCities = [
        { value: 'paris', label: 'Paris' },
        { value: 'lyon', label: 'Lyon' },
      ];

      const formConfig = form
        .create<any>(config, 'test-default-effects')
        .add({
          id: 'country',
          type: 'select',
          props: {
            options: [
              { value: 'france', label: 'France' },
              { value: 'spain', label: 'Spain' },
            ],
          },
        })
        .add({
          id: 'city',
          type: 'select',
          props: { options: [] },
          effects: [
            onChange('country', (value, { setProps }) => {
              if (value === 'france') {
                setProps('city', { options: franceCities });
              }
            }),
          ],
        })
        .build();

      // Mount with defaultValues — effects should fire for country='france'
      render(
        <FormProvider formConfig={formConfig} defaultValues={{ country: 'france' }}>
          <FormField id="country" />
          <FormField id="city" />
        </FormProvider>
      );

      // The EffectEngine.runInitialEffects() should have processed country='france'
      await waitFor(() => {
        const cityOptions = screen.getByTestId('select-city').querySelectorAll('option');
        expect(cityOptions).toHaveLength(2);
        expect(cityOptions[0]).toHaveTextContent('Paris');
        expect(cityOptions[1]).toHaveTextContent('Lyon');
      });

      // Country should display the default value
      expect(screen.getByTestId('select-country')).toHaveValue('france');
    });
  });

  // =========================================================================
  // 5. dynamicProps override static props but not customProps
  // =========================================================================

  describe('Props precedence: fieldConfig.props < dynamicProps < customProps', () => {
    it('should let dynamicProps override static field props', async () => {
      const MockTextWithPlaceholder = ({ id, props, field }: any) => (
        <div data-testid={`field-${id}`}>
          <input
            data-testid={`input-${id}`}
            value={field?.value ?? ''}
            placeholder={props.placeholder ?? ''}
            onChange={(e) => field?.onChange(e.target.value)}
          />
        </div>
      );

      const localConfig = ril
        .create()
        .component('text', {
          name: 'Text Input',
          renderer: MockTextWithPlaceholder,
        })
        .component('select', {
          name: 'Select Input',
          renderer: MockSelect,
          defaultProps: { options: [] },
        });

      const formConfig = form
        .create<any>(localConfig, 'test-precedence')
        .add({
          id: 'toggle',
          type: 'select',
          props: {
            options: [
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ],
          },
        })
        .add({
          id: 'target',
          type: 'text',
          props: { placeholder: 'static' },
          effects: [
            onChange('toggle', (value, { setProps }) => {
              setProps('target', {
                placeholder: value === 'on' ? 'dynamic-on' : 'dynamic-off',
              });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="toggle" />
          <FormField id="target" />
        </FormProvider>
      );

      // Initially placeholder comes from fieldConfig.props
      expect(screen.getByTestId('input-target')).toHaveAttribute('placeholder', 'static');

      // Toggle to 'on' — dynamicProps should override static props
      fireEvent.change(screen.getByTestId('select-toggle'), {
        target: { value: 'on' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-target')).toHaveAttribute('placeholder', 'dynamic-on');
      });
    });

    it('should let customProps take precedence over dynamicProps', async () => {
      const MockTextWithPlaceholder = ({ id, props, field }: any) => (
        <div data-testid={`field-${id}`}>
          <input
            data-testid={`input-${id}`}
            value={field?.value ?? ''}
            placeholder={props.placeholder ?? ''}
            onChange={(e) => field?.onChange(e.target.value)}
          />
        </div>
      );

      const localConfig = ril
        .create()
        .component('text', {
          name: 'Text Input',
          renderer: MockTextWithPlaceholder,
        })
        .component('select', {
          name: 'Select Input',
          renderer: MockSelect,
          defaultProps: { options: [] },
        });

      const formConfig = form
        .create<any>(localConfig, 'test-custom-precedence')
        .add({
          id: 'toggle',
          type: 'select',
          props: {
            options: [
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ],
          },
        })
        .add({
          id: 'target',
          type: 'text',
          props: { placeholder: 'static' },
          effects: [
            onChange('toggle', (_value, { setProps }) => {
              // Effect tries to set placeholder to 'dynamic'
              setProps('target', { placeholder: 'dynamic' });
            }),
          ],
        })
        .build();

      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="toggle" />
          {/* customProps forces placeholder='custom', overriding dynamicProps */}
          <FormField id="target" overrides={{ placeholder: 'custom' }} />
        </FormProvider>
      );

      // Toggle to 'on' — dynamicProps would set placeholder='dynamic'
      fireEvent.change(screen.getByTestId('select-toggle'), {
        target: { value: 'on' },
      });

      await waitFor(() => {
        // But customProps { placeholder: 'custom' } has higher precedence
        expect(screen.getByTestId('input-target')).toHaveAttribute('placeholder', 'custom');
      });
    });

    it('should apply precedence: fieldConfig.props < dynamicProps < customProps', async () => {
      // This test verifies the full chain in a single scenario.
      // fieldConfig.props has placeholder='static'
      // Effect sets placeholder='dynamic' via setProps
      // customProps sets placeholder='custom'

      const MockTextWithPlaceholder = ({ id, props, field }: any) => (
        <div data-testid={`field-${id}`}>
          <input
            data-testid={`input-${id}`}
            value={field?.value ?? ''}
            placeholder={props.placeholder ?? ''}
            onChange={(e) => field?.onChange(e.target.value)}
          />
        </div>
      );

      const configWithPlaceholder = ril
        .create()
        .component('text', {
          name: 'Text Input',
          renderer: MockTextWithPlaceholder,
        })
        .component('select', {
          name: 'Select Input',
          renderer: MockSelect,
          defaultProps: { options: [] },
        });

      const formConfig = form
        .create<any>(configWithPlaceholder, 'test-full-precedence')
        .add({
          id: 'trigger',
          type: 'select',
          props: {
            options: [{ value: 'go', label: 'Go' }],
          },
        })
        .add({
          id: 'fieldA',
          type: 'text',
          props: { placeholder: 'static' },
          effects: [
            onChange('trigger', (_value, { setProps }) => {
              setProps('fieldA', { placeholder: 'dynamic' });
            }),
          ],
        })
        .build();

      // --- Without customProps: dynamicProps should win over static ---
      const { unmount } = render(
        <FormProvider formConfig={formConfig}>
          <FormField id="trigger" />
          <FormField id="fieldA" />
        </FormProvider>
      );

      expect(screen.getByTestId('input-fieldA')).toHaveAttribute('placeholder', 'static');

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-fieldA')).toHaveAttribute('placeholder', 'dynamic');
      });

      unmount();

      // --- With customProps: customProps should win over dynamicProps ---
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="trigger" />
          <FormField id="fieldA" overrides={{ placeholder: 'custom' }} />
        </FormProvider>
      );

      fireEvent.change(screen.getByTestId('select-trigger'), {
        target: { value: 'go' },
      });

      await waitFor(() => {
        expect(screen.getByTestId('input-fieldA')).toHaveAttribute('placeholder', 'custom');
      });
    });
  });
});
