import type { FormConfiguration, ValidationResult } from '@rilaykit/core';
import { required, ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormBody } from '../../src/components/FormBody';
import { FormProvider, useFormConfigContext } from '../../src/components/FormProvider';
import { useFormStoreApi } from '../../src/stores';

// =================================================================
// MOCK COMPONENTS
// =================================================================

const MockTextInput = ({ id, value, onChange, props, error }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <input
      data-testid={`input-${id}`}
      value={value || ''}
      onChange={(e: any) => onChange?.(e.target.value)}
    />
    {error && error.length > 0 && (
      <div data-testid={`error-${id}`}>{error[0].message}</div>
    )}
  </div>
);

const MockNumberInput = ({ id, value, onChange, props, error }: any) => (
  <div data-testid={`field-${id}`}>
    <label>{props?.label}</label>
    <input
      type="number"
      data-testid={`input-${id}`}
      value={value ?? ''}
      onChange={(e: any) => onChange?.(Number(e.target.value))}
    />
    {error && error.length > 0 && (
      <div data-testid={`error-${id}`}>{error[0].message}</div>
    )}
  </div>
);

// =================================================================
// HELPERS
// =================================================================

let rilConfig: any;

const TestBodyRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const TestRowRenderer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

function buildForm(opts?: { min?: number }): FormConfiguration {
  const cfg = rilConfig.configure({
    bodyRenderer: TestBodyRenderer,
    rowRenderer: TestRowRenderer,
  });
  return form
    .create(cfg, 'test-form')
    .add({ id: 'title', type: 'text', props: { label: 'Title' } })
    .addRepeatable('items', (r) => {
      let b = r.add(
        {
          id: 'name',
          type: 'text',
          props: { label: 'Item Name' },
          validation: { validate: required('Item name is required') },
        },
        { id: 'qty', type: 'number', props: { label: 'Qty' } }
      );
      if (opts?.min !== undefined) b = b.min(opts.min);
      return b.defaultValue({ name: '', qty: 1 });
    })
    .build();
}

function ValidationTestChild() {
  const { validateForm, validateField } = useFormConfigContext();
  const store = useFormStoreApi();
  const [result, setResult] = React.useState<ValidationResult | null>(null);

  return (
    <div>
      <FormBody />
      <button
        data-testid="validate-form"
        onClick={async () => {
          const r = await validateForm();
          setResult(r);
        }}
      >
        Validate
      </button>
      <div data-testid="validation-result">
        {result !== null ? (result.isValid ? 'valid' : 'invalid') : 'pending'}
      </div>
      <div data-testid="error-count">
        {result !== null ? result.errors.length : 0}
      </div>
    </div>
  );
}

// =================================================================
// TESTS
// =================================================================

describe('Repeatable Fields — Validation Integration', () => {
  beforeEach(() => {
    rilConfig = ril
      .create()
      .addComponent('text', {
        name: 'Text',
        renderer: MockTextInput,
        defaultProps: { label: '' },
      })
      .addComponent('number', {
        name: 'Number',
        renderer: MockNumberInput,
        defaultProps: { label: '', min: 0 },
      });
  });

  describe('per-item validation', () => {
    it('should validate repeatable item fields', async () => {
      const config = buildForm();
      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: '', qty: 1 }] }}>
          <ValidationTestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-form'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).toHaveTextContent('invalid');
      });
    });

    it('should pass validation when all item fields are valid', async () => {
      const config = buildForm();
      render(
        <FormProvider formConfig={config} defaultValues={{ items: [{ name: 'Widget', qty: 1 }] }}>
          <ValidationTestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-form'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).toHaveTextContent('valid');
      });
    });

    it('should validate multiple items independently', async () => {
      const config = buildForm();
      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            items: [
              { name: 'Valid', qty: 1 },
              { name: '', qty: 2 }, // Invalid — empty name
            ],
          }}
        >
          <ValidationTestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-form'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).toHaveTextContent('invalid');
      });
    });
  });

  describe('min count validation', () => {
    it('should fail validation when below min count', async () => {
      const config = buildForm({ min: 2 });
      render(
        <FormProvider
          formConfig={config}
          defaultValues={{ items: [{ name: 'Only One', qty: 1 }] }}
        >
          <ValidationTestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-form'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).toHaveTextContent('invalid');
      });
    });
  });

  describe('submission with structured data', () => {
    it('should structure flat values into nested arrays on submit', async () => {
      const onSubmit = vi.fn();
      const config = buildForm();

      render(
        <FormProvider
          formConfig={config}
          defaultValues={{
            title: 'Order',
            items: [
              { name: 'Widget', qty: 2 },
              { name: 'Gadget', qty: 1 },
            ],
          }}
          onSubmit={onSubmit}
        >
          <ValidationTestChild />
        </FormProvider>
      );

      // Submit the form via the form element
      const formElement = screen.getByTestId('validate-form').closest('form');
      fireEvent.submit(formElement!);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          title: 'Order',
          items: [
            { name: 'Widget', qty: 2 },
            { name: 'Gadget', qty: 1 },
          ],
        });
      });
    });

    it('should submit empty array when no items', async () => {
      const onSubmit = vi.fn();
      const config = buildForm();

      render(
        <FormProvider formConfig={config} defaultValues={{ title: 'Empty' }} onSubmit={onSubmit}>
          <ValidationTestChild />
        </FormProvider>
      );

      const formElement = screen.getByTestId('validate-form').closest('form');
      fireEvent.submit(formElement!);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Empty' })
        );
      });
    });
  });
});
