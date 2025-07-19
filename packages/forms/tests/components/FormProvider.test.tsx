import type { FormConfiguration, ValidationResult } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createForm } from '../../src/builders/form';
import { FormProvider, useFormContext } from '../../src/components/FormProvider';

// Mock components
const TestComponent = () => React.createElement('div', null, 'test');
const TestFormRenderer = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'form-renderer' }, children);
const TestRowRenderer = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'row-renderer' }, children);
const TestSubmitButtonRenderer = ({ onSubmit, isSubmitting, isValid }: any) =>
  React.createElement(
    'div',
    {
      role: 'button',
      onClick: onSubmit,
      'data-testid': 'submit-button',
      'data-submitting': isSubmitting,
      'data-valid': isValid,
    },
    isSubmitting ? 'Submitting...' : 'Submit'
  );

describe('FormProvider', () => {
  let config: ril<Record<string, any>>;
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

    formConfig = createForm(config, 'test-form')
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
        const { formState } = useFormContext();
        return <div data-testid="form-state">{JSON.stringify(formState.values)}</div>;
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
        const { formState } = useFormContext();
        return <div data-testid="default-values">{JSON.stringify(formState.values)}</div>;
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
        const { submit } = useFormContext();
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
        const { setValue } = useFormContext();
        return (
          <button
            type="button"
            onClick={() => setValue('firstName', 'John')}
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

  describe('useForm Hook', () => {
    it('should throw error when used outside provider', () => {
      const TestComponent = () => {
        useFormContext();
        return null;
      };

      expect(() => render(<TestComponent />)).toThrow(
        'useFormContext must be used within a FormProvider'
      );
    });

    it('should provide form state', () => {
      const TestChild = () => {
        const { formState, isFormValid } = useFormContext();
        return (
          <div>
            <div data-testid="is-dirty">{formState.isDirty ? 'true' : 'false'}</div>
            <div data-testid="is-valid">{isFormValid() ? 'true' : 'false'}</div>
            <div data-testid="is-submitting">{formState.isSubmitting ? 'true' : 'false'}</div>
            <div data-testid="touched-count">{Object.keys(formState.touched).length}</div>
            <div data-testid="validating-count">
              {Object.values(formState.validationState).filter((s) => s === 'validating').length}
            </div>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');
      expect(screen.getByTestId('is-valid')).toHaveTextContent('true');
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      expect(screen.getByTestId('touched-count')).toHaveTextContent('0');
      expect(screen.getByTestId('validating-count')).toHaveTextContent('0');
    });

    it('should provide form config', () => {
      const TestChild = () => {
        const { formConfig: config } = useFormContext();
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
        const { formState, setValue } = useFormContext();
        return (
          <div>
            <div data-testid="first-name">{formState.values.firstName || ''}</div>
            <div data-testid="is-dirty">{formState.isDirty ? 'true' : 'false'}</div>
            <button
              type="button"
              onClick={() => setValue('firstName', 'John')}
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
      expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');

      fireEvent.click(screen.getByTestId('set-value'));

      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('John');
        expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');
      });
    });

    it('should manage field errors', async () => {
      const mockValidator = vi
        .fn()
        .mockReturnValue({ isValid: false, errors: [{ message: 'Invalid' }] });

      const formConfigWithValidation = createForm(config, 'test-form')
        .add({
          id: 'firstName',
          type: 'text',
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { formState, validateField, reset } = useFormContext();
        return (
          <div>
            <div data-testid="errors">
              {JSON.stringify(formState.errors.firstName?.[0]?.message)}
            </div>
            <button type="button" onClick={() => validateField('firstName')} data-testid="validate">
              Validate
            </button>
            <button type="button" onClick={() => reset()} data-testid="clear">
              Clear
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.queryByTestId('errors')?.textContent).toBeFalsy();

      fireEvent.click(screen.getByTestId('validate'));

      await waitFor(() => {
        expect(screen.getByTestId('errors')).toHaveTextContent('Invalid');
      });

      fireEvent.click(screen.getByTestId('clear'));

      await waitFor(() => {
        expect(screen.queryByTestId('errors')?.textContent).toBeFalsy();
      });
    });

    it('should manage touched fields', async () => {
      const TestChild = () => {
        const { formState, setFieldTouched } = useFormContext();
        return (
          <div>
            <div data-testid="touched-count">{Object.keys(formState.touched).length}</div>
            <button
              type="button"
              onClick={() => setFieldTouched('firstName', true)}
              data-testid="mark-touched"
            >
              Mark Touched
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('touched-count')).toHaveTextContent('0');

      fireEvent.click(screen.getByTestId('mark-touched'));

      await waitFor(() => {
        expect(screen.getByTestId('touched-count')).toHaveTextContent('1');
      });
    });

    it('should manage validation state', async () => {
      const mockValidator = vi.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ isValid: true, errors: [] }), 10)
          ) as Promise<ValidationResult>
      );

      const formConfigWithValidation = createForm(config, 'test-form')
        .add({
          id: 'firstName',
          type: 'text',
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { formState, validateField } = useFormContext();
        return (
          <div>
            <div data-testid="validation-state">{formState.validationState.firstName}</div>
            <button type="button" onClick={() => validateField('firstName')} data-testid="validate">
              Validate
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('validation-state').textContent).toBeFalsy();

      fireEvent.click(screen.getByTestId('validate'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-state')).toHaveTextContent('validating');
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-state')).toHaveTextContent('valid');
      });
    });

    it('should reset form state', async () => {
      const TestChild = () => {
        const { formState, setValue, reset } = useFormContext();
        return (
          <div>
            <div data-testid="first-name">{formState.values.firstName || ''}</div>
            <div data-testid="is-dirty">{formState.isDirty ? 'true' : 'false'}</div>
            <button
              type="button"
              onClick={() => setValue('firstName', 'John')}
              data-testid="set-value"
            >
              Set Value
            </button>
            <button type="button" onClick={() => reset()} data-testid="reset">
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
        expect(screen.getByTestId('is-dirty')).toHaveTextContent('true');
      });

      // Reset the form
      fireEvent.click(screen.getByTestId('reset'));
      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('');
        expect(screen.getByTestId('is-dirty')).toHaveTextContent('false');
      });
    });

    it('should reset form with new values', async () => {
      const TestChild = () => {
        const { formState, reset } = useFormContext();
        return (
          <div>
            <div data-testid="first-name">{formState.values.firstName || ''}</div>
            <button
              type="button"
              onClick={() => reset({ firstName: 'Jane' })}
              data-testid="reset-with-values"
            >
              Reset with Values
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('reset-with-values'));

      await waitFor(() => {
        expect(screen.getByTestId('first-name')).toHaveTextContent('Jane');
      });
    });
  });

  describe('Form Validation', () => {
    it('should validate field', async () => {
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: false,
        errors: [{ code: 'INVALID', message: 'Invalid value' }],
      });

      const formConfigWithValidation = createForm(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { formState, validateField } = useFormContext();
        return (
          <div>
            <div data-testid="errors">{JSON.stringify(formState.errors)}</div>
            <button
              type="button"
              onClick={() => {
                validateField('email');
              }}
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
        expect(mockValidator).toHaveBeenCalledWith('invalid-email', expect.any(Object));
        expect(screen.getByTestId('errors')).toHaveTextContent('Invalid value');
      });
    });

    it('should validate all fields', async () => {
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: true,
        errors: [],
      });

      const formConfigWithValidation = createForm(config, 'test-form-validation')
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
        const { validateForm } = useFormContext();
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
        expect(mockValidator).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('validation-result')).toHaveTextContent('true');
      });
    });
  });

  describe('Form Submission', () => {
    it('should handle successful submission', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      const TestChild = () => {
        const { formState, submit } = useFormContext();
        return (
          <div>
            <div data-testid="is-submitting">{formState.isSubmitting ? 'true' : 'false'}</div>
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

      // Should show submitting state
      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      });

      // Should return to non-submitting state
      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });

      expect(onSubmit).toHaveBeenCalledWith({});
    });

    it('should handle submission errors', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'));

      const TestChild = () => {
        const { formState, submit } = useFormContext();
        return (
          <div>
            <div data-testid="is-submitting">{formState.isSubmitting ? 'true' : 'false'}</div>
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

    it('should not submit when form is invalid', async () => {
      const onSubmit = vi.fn();
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: false,
        errors: [{ code: 'REQUIRED', message: 'Required field' }],
      });

      const formConfigWithValidation = createForm(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormContext();
        return (
          <button type="button" onClick={() => submit()} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfigWithValidation} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(mockValidator).toHaveBeenCalled();
      });

      // onSubmit should not be called because validation failed
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Form Context', () => {
    it('should provide form element via context', () => {
      const TestChild = () => {
        const { formState } = useFormContext();
        return (
          <div>
            <div data-testid="form-values">{JSON.stringify(formState.values)}</div>
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

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const mockValidator = vi.fn().mockRejectedValue(new Error('Validation error'));

      const formConfigWithValidation = createForm(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: { validators: [mockValidator] },
        })
        .build();

      const TestChild = () => {
        const { formState, validateField, setValue } = useFormContext();
        return (
          <div>
            <div data-testid="errors">{JSON.stringify(formState.errors)}</div>
            <button
              type="button"
              onClick={() => {
                setValue('email', 'test@example.com');
                validateField('email');
              }}
              data-testid="validate"
            >
              Validate
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('validate'));

      await waitFor(() => {
        expect(screen.getByTestId('errors')).toHaveTextContent('Validation error');
      });
    });
  });
});
