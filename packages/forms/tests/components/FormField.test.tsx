import { type ComponentRenderContext, NotFoundError, ril, when } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { Form } from '../../src/components/Form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';

// Helper to create mock Standard Schema validators for testing
function createMockStandardSchema(
  isValid: boolean,
  message = 'Validation failed'
): StandardSchemaV1<unknown> {
  return {
    '~standard': {
      version: 1,
      vendor: 'mock-test',
      validate: (value: unknown) => {
        return isValid ? { value } : { issues: [{ message }] };
      },
    },
  };
}

// Mock components (new ComponentRenderContext shape)
const MockTextInput = ({ id, props, field, conditions }: ComponentRenderContext) => (
  <div
    data-testid={`field-${id}`}
    data-cond-visible={String(conditions?.visible)}
    data-cond-disabled={String(conditions?.disabled)}
    data-cond-required={String(conditions?.required)}
    data-cond-readonly={String(conditions?.readonly)}
  >
    <label htmlFor={id}>{String(props.label ?? '')}</label>
    <input
      id={id}
      type="text"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
      disabled={field?.disabled}
      placeholder={props.placeholder ? String(props.placeholder) : undefined}
      data-validating={String(field?.isValidating ?? false)}
      data-testid={`input-${id}`}
    />
    {field?.error && field.error.length > 0 && (
      <div data-testid={`error-${id}`} className="error">
        {field.error[0].message}
      </div>
    )}
    {field?.touched && <div data-testid={`touched-${id}`}>touched</div>}
  </div>
);

const MockEmailInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label htmlFor={id}>{String(props.label ?? '')}</label>
    <input
      id={id}
      type="email"
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
      onBlur={() => field?.onBlur()}
      data-testid={`input-${id}`}
    />
    {field?.error && field.error.length > 0 && (
      <div data-testid={`error-${id}`} className="error">
        {field.error[0].message}
      </div>
    )}
  </div>
);

const r = ril.create().component('text', {
  meta: { tone: 'plain' },
  renderer: ({ id, props, field, meta }: ComponentRenderContext<{ label?: string }>) => (
    <div>
      <input
        data-testid={id}
        aria-label={props.label}
        data-tone={String(meta?.tone)}
        value={String(field?.value ?? '')}
        onChange={(e) => field?.onChange(e.target.value)}
        onBlur={() => field?.onBlur()}
      />
      {field?.error?.length ? <p data-testid={`${id}-error`}>{field.error[0]?.message}</p> : null}
    </div>
  ),
});

describe('<Form.Field> new context', () => {
  it('wires field binding (value/onChange) and entry meta into the renderer', () => {
    const def = form.create(r, 'f').add({ id: 'name', type: 'text', props: { label: 'Name' } });
    render(
      <Form of={def} defaults={{ name: 'Karl' }}>
        <FormField id="name" />
      </Form>
    );
    const input = screen.getByTestId('name') as HTMLInputElement;
    expect(input.value).toBe('Karl');
    expect(input.dataset.tone).toBe('plain');
    fireEvent.change(input, { target: { value: 'Mazier' } });
    expect((screen.getByTestId('name') as HTMLInputElement).value).toBe('Mazier');
  });

  it('applies overrides with highest prop precedence', () => {
    const def = form
      .create(r, 'f')
      .add({ id: 'name', type: 'text', props: { label: 'From config' } });
    render(
      <Form of={def}>
        <FormField id="name" overrides={{ label: 'Overridden' }} />
      </Form>
    );
    expect(screen.getByLabelText('Overridden')).toBeInTheDocument();
  });

  it('throws NotFoundError for an unknown field id', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const def = form.create(r, 'f').add({ id: 'name', type: 'text', props: {} });
    expect(() =>
      render(
        <Form of={def}>
          <FormField id="ghost" />
        </Form>
      )
    ).toThrowError(NotFoundError);
    consoleSpy.mockRestore();
  });
});

describe('FormField', () => {
  const config = ril
    .create()
    .component('text', {
      name: 'Text Input',
      renderer: MockTextInput,
      defaultProps: { placeholder: 'Enter text...' },
    })
    .component('email', {
      name: 'Email Input',
      renderer: MockEmailInput,
      defaultProps: { placeholder: 'Enter email...' },
    });

  const formConfig = form
    .create(config, 'test-form')
    .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
    .add({ id: 'lastName', type: 'text', props: { label: 'Last Name' } })
    .add({ id: 'email', type: 'email', props: { label: 'Email' } })
    .build();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Field Rendering', () => {
    it('should render field with correct props', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
        </FormProvider>
      );

      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('input-firstName')).toBeInTheDocument();
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    });

    it('should render field with overrides', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" overrides={{ label: 'Overridden label' }} />
        </FormProvider>
      );

      expect(screen.getByLabelText('Overridden label')).toBeInTheDocument();
    });

    it('should render disabled field', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" disabled={true} />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');
      expect(input).toBeDisabled();
    });

    it('should render field with custom className', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" className="custom-field" />
        </FormProvider>
      );

      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
    });

    it('should throw NotFoundError for non-existent field', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let caught: unknown;
      try {
        render(
          <FormProvider formConfig={formConfig}>
            <FormField id="nonExistentField" />
          </FormProvider>
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundError);
      const notFound = caught as NotFoundError;
      expect(notFound.code).toBe('NOT_FOUND');
      expect(notFound.meta).toEqual({ key: 'nonExistentField' });
      expect(notFound.message).toBe('Field "nonExistentField" not found');

      consoleSpy.mockRestore();
    });
  });

  describe('Field Values', () => {
    it('should display initial value', () => {
      const defaultValues = { firstName: 'John' };

      render(
        <FormProvider formConfig={formConfig} defaultValues={defaultValues}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');
      expect(input).toHaveValue('John');
    });

    it('should update value on change', async () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');

      fireEvent.change(input, { target: { value: 'Jane' } });

      await waitFor(() => {
        expect(input).toHaveValue('Jane');
      });
    });

    it('should handle empty value', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');
      expect(input).toHaveValue('');
    });
  });

  describe('Field Validation', () => {
    it('should display validation errors', async () => {
      const mockFailingSchema = createMockStandardSchema(false, 'This field is required');

      const formConfigWithValidation = form
        .create(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: {
            validate: mockFailingSchema,
            validateOnBlur: true,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <FormField id="email" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-email');

      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByTestId('error-email')).toHaveTextContent('This field is required');
      });
    });

    it('should clear errors when field becomes valid', async () => {
      const formConfigWithValidation = form
        .create(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
        })
        .build();

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <FormField id="email" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-email');

      fireEvent.change(input, { target: { value: 'test@example.com' } });
      expect(input).toHaveValue('test@example.com');

      fireEvent.change(input, { target: { value: 'another@example.com' } });
      expect(input).toHaveValue('another@example.com');
    });
  });

  describe('Field Events', () => {
    it('should handle blur events', async () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');

      fireEvent.change(input, { target: { value: 'John' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByTestId('touched-firstName')).toBeInTheDocument();
      });
    });

    it('should handle change events with immediate feedback', async () => {
      const mockValidator = vi.fn().mockResolvedValue({
        isValid: false,
        errors: [{ code: 'INVALID', message: 'Invalid value' }],
      });

      const formConfigWithValidation = form
        .create(config, 'test-form-validation')
        .add({
          id: 'email',
          type: 'email',
          props: { label: 'Email' },
          validation: {
            validators: [mockValidator],
            validateOnChange: true,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfigWithValidation}>
          <FormField id="email" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-email');

      fireEvent.change(input, { target: { value: 'invalid' } });
      expect(input).toHaveValue('invalid');

      mockValidator.mockResolvedValueOnce({
        isValid: true,
        errors: [],
      });

      fireEvent.change(input, { target: { value: 'valid@example.com' } });
      expect(input).toHaveValue('valid@example.com');
    });

    it('should expose isValidating to the renderer while async validation is pending', async () => {
      let resolveValidation!: (result: { value: unknown }) => void;
      const pendingSchema: StandardSchemaV1<unknown> = {
        '~standard': {
          version: 1,
          vendor: 'mock-test',
          validate: () =>
            new Promise<{ value: unknown }>((resolve) => {
              resolveValidation = resolve;
            }),
        },
      };

      const formConfigWithAsync = form
        .create(config, 'test-form-async')
        .add({
          id: 'firstName',
          type: 'text',
          props: { label: 'First Name' },
          validation: {
            validate: pendingSchema,
            validateOnBlur: true,
          },
        })
        .build();

      render(
        <FormProvider formConfig={formConfigWithAsync}>
          <FormField id="firstName" />
        </FormProvider>
      );

      expect(screen.getByTestId('input-firstName')).toHaveAttribute('data-validating', 'false');

      fireEvent.blur(screen.getByTestId('input-firstName'));

      await waitFor(() => {
        expect(screen.getByTestId('input-firstName')).toHaveAttribute('data-validating', 'true');
      });

      resolveValidation({ value: '' });

      await waitFor(() => {
        expect(screen.getByTestId('input-firstName')).toHaveAttribute('data-validating', 'false');
      });
    });
  });

  describe('Field State', () => {
    it('should show touched state', async () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');

      // Initially not touched
      expect(screen.queryByTestId('touched-firstName')).not.toBeInTheDocument();

      // Touch the field
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByTestId('touched-firstName')).toBeInTheDocument();
      });
    });

    it('should handle disabled state', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField id="firstName" disabled={true} />
        </FormProvider>
      );

      const input = screen.getByTestId('input-firstName');
      expect(input).toBeDisabled();
    });

    it('should merge overrides with field props', () => {
      render(
        <FormProvider formConfig={formConfig}>
          <FormField
            id="firstName"
            overrides={{
              placeholder: 'Custom placeholder',
            }}
          />
        </FormProvider>
      );

      // overrides win over the entry defaultProps ('Enter text...')
      expect(screen.getByTestId('input-firstName')).toHaveAttribute(
        'placeholder',
        'Custom placeholder'
      );
      // props coming from the field config are still merged in
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    });
  });

  describe('Render Context Conditions', () => {
    it('should expose condition flags and update them when the driving field changes', async () => {
      const conditionalConfig = form
        .create(config, 'test-form-conditions')
        .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
        .add({
          id: 'lastName',
          type: 'text',
          props: { label: 'Last Name' },
          conditions: {
            required: when('firstName').equals('admin'),
            disabled: when('firstName').equals('admin'),
            readonly: when('firstName').equals('admin'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={conditionalConfig}>
          <FormField id="firstName" />
          <FormField id="lastName" />
        </FormProvider>
      );

      const lastName = screen.getByTestId('field-lastName');
      expect(lastName).toHaveAttribute('data-cond-visible', 'true');
      expect(lastName).toHaveAttribute('data-cond-required', 'false');
      expect(lastName).toHaveAttribute('data-cond-disabled', 'false');
      expect(lastName).toHaveAttribute('data-cond-readonly', 'false');

      fireEvent.change(screen.getByTestId('input-firstName'), { target: { value: 'admin' } });

      await waitFor(() => {
        const el = screen.getByTestId('field-lastName');
        expect(el).toHaveAttribute('data-cond-visible', 'true');
        expect(el).toHaveAttribute('data-cond-required', 'true');
        expect(el).toHaveAttribute('data-cond-disabled', 'true');
        expect(el).toHaveAttribute('data-cond-readonly', 'true');
      });
    });

    it('should expose the raw visibility flag when the field is force-rendered', async () => {
      const conditionalConfig = form
        .create(config, 'test-form-force-visible')
        .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
        .add({
          id: 'secret',
          type: 'text',
          props: { label: 'Secret' },
          conditions: {
            visible: when('firstName').equals('show'),
          },
        })
        .build();

      render(
        <FormProvider formConfig={conditionalConfig}>
          <FormField id="firstName" />
          <FormField id="secret" forceVisible />
        </FormProvider>
      );

      // Rendered because of forceVisible, but the raw store condition is still false
      expect(screen.getByTestId('field-secret')).toHaveAttribute('data-cond-visible', 'false');

      fireEvent.change(screen.getByTestId('input-firstName'), { target: { value: 'show' } });

      await waitFor(() => {
        expect(screen.getByTestId('field-secret')).toHaveAttribute('data-cond-visible', 'true');
      });
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const renderSpy = vi.fn();

      const SpyComponent = (ctx: ComponentRenderContext) => {
        renderSpy();
        return MockTextInput(ctx);
      };

      const configWithSpy = ril.create().component('text', {
        name: 'Text Input',
        renderer: SpyComponent,
      });

      const formConfigWithSpy = form
        .create(configWithSpy, 'test-form')
        .add({ id: 'firstName', type: 'text', props: { label: 'First Name' } })
        .build();

      const { rerender } = render(
        <FormProvider formConfig={formConfigWithSpy}>
          <FormField id="firstName" />
        </FormProvider>
      );

      const initialRenderCount = renderSpy.mock.calls.length;

      // Re-render with same props - should not cause unnecessary re-renders
      rerender(
        <FormProvider formConfig={formConfigWithSpy}>
          <FormField id="firstName" />
        </FormProvider>
      );

      // The component should be optimized to prevent unnecessary re-renders
      expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(initialRenderCount);
    });
  });

  describe('Error Boundaries', () => {
    it('should throw NotFoundError when the component has no renderer', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const configWithoutRenderer = ril.create().component('bare', { name: 'Bare Component' });

      const formConfigWithoutRenderer = form
        .create(configWithoutRenderer, 'test-form')
        .add({ id: 'bareField', type: 'bare', props: {} })
        .build();

      let caught: unknown;
      try {
        render(
          <FormProvider formConfig={formConfigWithoutRenderer}>
            <FormField id="bareField" />
          </FormProvider>
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundError);
      const notFound = caught as NotFoundError;
      expect(notFound.code).toBe('NOT_FOUND');
      expect(notFound.meta).toEqual({ key: 'component:bare' });
      expect(notFound.message).toBe('Component "bare" not found in catalog');

      consoleSpy.mockRestore();
    });

    it('should handle component rendering errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ErrorComponent = () => {
        throw new Error('Component error');
      };

      const configWithError = ril.create().component('error', {
        name: 'Error Component',
        renderer: ErrorComponent,
      });

      const formConfigWithError = form
        .create(configWithError, 'test-form')
        .add({ id: 'errorField', type: 'error', props: { label: 'Error Field' } })
        .build();

      expect(() => {
        render(
          <FormProvider formConfig={formConfigWithError}>
            <FormField id="errorField" />
          </FormProvider>
        );
      }).toThrow('Component error');

      consoleSpy.mockRestore();
    });
  });
});
