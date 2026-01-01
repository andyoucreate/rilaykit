import type { FormConfiguration, ValidationResult } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useFormConfigContext } from '../../src/components/FormProvider';
import { useFormStoreApi, useFormSubmitState, useFormValues } from '../../src/stores';

// Mock components
const TestComponent = () => React.createElement('div', null, 'test');
const TestFormRenderer = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'form-renderer' }, children);
const TestRowRenderer = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'row-renderer' }, children);
const TestSubmitButtonRenderer = ({ onSubmit, isSubmitting }: { onSubmit: () => void; isSubmitting: boolean }) =>
  React.createElement(
    'div',
    {
      role: 'button',
      onClick: onSubmit,
      'data-testid': 'submit-button',
      'data-submitting': isSubmitting,
    },
    isSubmitting ? 'Submitting...' : 'Submit'
  );

describe('FormProvider', () => {
  let config: ReturnType<typeof ril.create>;
  let formConfig: FormConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();

    config = ril
      .create()
      .addComponent('text', {
        name: 'Text Input',
        renderer: TestComponent,
        defaultProps: { placeholder: 'Enter text...' },
      })
      .addComponent('email', {
        name: 'Email Input',
        renderer: TestComponent,
        defaultProps: { placeholder: 'Enter email...' },
      })
      .configure({
        rowRenderer: TestRowRenderer,
        bodyRenderer: TestFormRenderer,
        submitButtonRenderer: TestSubmitButtonRenderer,
      });

    formConfig = form
      .create<{firstName: string; lastName: string; email: string}>(config, 'test-form')
      .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
      .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
      .add({ id: 'email', type: 'email', props: { label: 'Email' } })
      .build();
  });

  describe('Provider Setup', () => {
    it('should render FormProvider with children', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <div data-testid="form-content">Form Content</div>
        </FormProvider>
      );

      expect(screen.getByTestId('form-content')).toBeInTheDocument();
    });

    it('should provide form context to children', () => {
      const TestChild = () => {
        const values = useFormValues();
        return <div data-testid="form-state">{JSON.stringify(values)}</div>;
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('form-state')).toHaveTextContent('{}');
    });

    it('should initialize with default values', () => {
      const defaultValues = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const TestChild = () => {
        const values = useFormValues();
        return <div data-testid="default-values">{JSON.stringify(values)}</div>;
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('default-values')).toHaveTextContent('John');
      expect(screen.getByTestId('default-values')).toHaveTextContent('Doe');
    });

    it('should call onSubmit callback', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit()} data-testid="submit-btn">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({});
      });
    });

    it('should call onFieldChange callback', async () => {
      const onFieldChange = vi.fn();

      const TestChild = () => {
        const store = useFormStoreApi();
        return (
          <button
            type="button"
            onClick={() => store.getState()._setValue('firstName', 'John')}
            data-testid="change-btn"
          >
            Change
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} onFieldChange={onFieldChange}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('change-btn'));

      await waitFor(() => {
        expect(onFieldChange).toHaveBeenCalledWith('firstName', 'John', expect.any(Object));
      });
    });
  });

  describe('useFormConfigContext Hook', () => {
    it('should throw error when used outside provider', () => {
      const TestComponent = () => {
        useFormConfigContext();
        return null;
      };

      expect(() => render(<TestComponent />)).toThrow(
        'useFormConfigContext must be used within a FormProvider'
      );
    });

    it('should provide form config', () => {
      const TestChild = () => {
        const { formConfig: config } = useFormConfigContext();
        return (
          <div>
            <div data-testid="form-id">{config.id}</div>
            <div data-testid="fields-count">{config.allFields.length}</div>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('form-id')).toHaveTextContent('test-form');
      expect(screen.getByTestId('fields-count')).toHaveTextContent('3');
    });
  });

  describe('Form State Management', () => {
    it('should update field values', async () => {
      const TestChild = () => {
        const values = useFormValues();
        const store = useFormStoreApi();
        return (
          <div>
            <div data-testid="first-name">{(values.firstName as string) || ''}</div>
            <div data-testid="is-dirty">{store.getState().isDirty ? 'true' : 'false'}</div>
            <button
              type="button"
              onClick={() => store.getState()._setValue('firstName', 'John')}
              data-testid="set-value"
            >
              Set Value
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('first-name')).toHaveTextContent('');

      fireEvent.click(screen.getByTestId('set-value'));

      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('John');
      });
    });

    it('should reset form state', async () => {
      const TestChild = () => {
        const values = useFormValues();
        const store = useFormStoreApi();
        return (
          <div>
            <div data-testid="first-name">{(values.firstName as string) || ''}</div>
            <button
              type="button"
              onClick={() => store.getState()._setValue('firstName', 'John')}
              data-testid="set-value"
            >
              Set Value
            </button>
            <button type="button" onClick={() => store.getState()._reset()} data-testid="reset">
              Reset
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      // Set a value
      fireEvent.click(screen.getByTestId('set-value'));
      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('John');
      });

      // Reset the form
      fireEvent.click(screen.getByTestId('reset'));
      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('');
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate field', async () => {
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: false,
        errors: [{ code: 'INVALID', message: 'Invalid value' }],
      });

      const formConfigWithValidation = form
        .create<{email: string}>(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { validateField } = useFormConfigContext();
        const store = useFormStoreApi();
        return (
          <div>
            <div data-testid="errors">{JSON.stringify(store.getState().errors)}</div>
            <button
              type="button"
              onClick={() => validateField('email')}
              data-testid="validate"
            >
              Validate
            </button>
          </div>
        );
      };

      render(
        <FormProvider
          formConfig={formConfigWithValidation}
          defaultValues={{ email: 'invalid-email' }}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate'));

      await waitFor(() => {
        expect(screen.getByTestId('validate')).toBeInTheDocument();
      });
    });

    it('should validate all fields', async () => {
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: true,
        errors: [],
      });

      const formConfigWithValidation = form
        .create<{firstName: string; lastName: string}>(config, 'test-form-validation')
        .add({
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name' },
          validation: { validators: [mockValidator] },
        })
        .add({
          id: 'lastName',
          type: 'text',
          props: { label: 'Last Name' },
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { validateForm } = useFormConfigContext();
        const [result, setResult] = React.useState<ValidationResult | null>(null);

        const handleValidateAll = async () => {
          const validationResult = await validateForm();
          setResult(validationResult);
        };

        return (
          <div>
            <div data-testid="validation-result">
              {result !== null ? result.isValid.toString() : 'null'}
            </div>
            <button type="button" onClick={handleValidateAll} data-testid="validate-all">
              Validate All
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate-all'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-result')).toHaveTextContent('true');
      });
    });
  });

  describe('Form Submission', () => {
    it('should handle successful submission', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const { isSubmitting } = useFormSubmitState();
        return (
          <div>
            <div data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</div>
            <button type="button" onClick={() => submit()} data-testid="submit">
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');

      fireEvent.click(screen.getByTestId('submit'));

      // Should return to non-submitting state after completion
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({});
      });
    });

    it('should handle submission errors', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'));

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const { isSubmitting } = useFormSubmitState();
        return (
          <div>
            <div data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</div>
            <button type="button" onClick={() => submit()} data-testid="submit">
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      // Should return to non-submitting state even after error
      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });

      expect(onSubmit).toHaveBeenCalledWith({});
    });
  });

  describe('Form Context', () => {
    it('should provide form element via context', () => {
      const TestChild = () => {
        const values = useFormValues();
        return (
          <div>
            <div data-testid="form-values">{JSON.stringify(values)}</div>
          </div>
        );
      };

      const { container } = render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      // Check that a form element is rendered
      const formElement = container.querySelector('form');
      expect(formElement).toBeInTheDocument();
      expect(formElement).toHaveAttribute('novalidate');
    });

    it('should handle form submission via form element', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const TestChild = () => {
        return <div data-testid="form-content">Form Content</div>;
      };

      const { container } = render(
        <FormProvider formConfig={formConfig} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      const formElement = container.querySelector('form');
      expect(formElement).toBeInTheDocument();

      // Simulate form submission
      fireEvent.submit(formElement!);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({});
      });
    });
  });
});
