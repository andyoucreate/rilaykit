import type { FormConfiguration } from '@rilaykit/core';
import { required, ril } from '@rilaykit/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useFormConfigContext } from '../../src/components/FormProvider';
import { useFormStoreApi, useFormSubmitState } from '../../src/stores';

// ============================================================================
// SETUP
// ============================================================================

const TestComponent = () => React.createElement('div', null, 'test');

function createConfig() {
  return ril
    .create()
    .addComponent('text', {
      name: 'Text Input',
      renderer: TestComponent,
      defaultProps: {},
    })
    .addComponent('email', {
      name: 'Email Input',
      renderer: TestComponent,
      defaultProps: {},
    });
}

// ============================================================================
// TESTS
// ============================================================================

describe('useFormSubmissionWithStore - SubmitOptions', () => {
  let config: ReturnType<typeof createConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createConfig();
  });

  // ==========================================================================
  // FORCE
  // ==========================================================================

  describe('force option', () => {
    it('should submit without validation when force is true', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'force-test')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required('Name is required') },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: '' });
      });
    });

    it('should submit with invalid field values when force is true', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'force-invalid')
        .add({
          id: 'email',
          type: 'email',
          validation: { validate: required('Email is required') },
        })
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required('Name is required') },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ email: '', name: '' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ email: '', name: '' });
      });
    });

    it('should include all fields in submitted data when force is true', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'force-all-fields')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .add({ id: 'optional', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: '', optional: 'hello' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: '', optional: 'hello' });
      });
    });

    it('should still prevent double submission when force is true', async () => {
      let resolveSubmit: () => void;
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });
      const onSubmit = vi.fn().mockReturnValue(submitPromise);

      const formConfig = form
        .create(config, 'force-double')
        .add({ id: 'name', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const { isSubmitting } = useFormSubmitState();
        return (
          <div>
            <div data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</div>
            <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: 'test' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      // First click
      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      });

      // Second click while still submitting
      fireEvent.click(screen.getByTestId('submit'));

      // Resolve the submission
      resolveSubmit!();

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });

      // onSubmit should only have been called once
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('should handle async onSubmit errors when force is true', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'));

      const formConfig = form
        .create(config, 'force-error')
        .add({ id: 'name', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const { isSubmitting } = useFormSubmitState();
        return (
          <div>
            <div data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</div>
            <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: 'test' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });

      expect(onSubmit).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should structure repeatable values when force is true', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'force-repeatable')
        .addRepeatable('items', (r) =>
          r.add({ id: 'name', type: 'text' }).min(1).defaultValue({ name: '' })
        )
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ items: [{ name: 'Item 1' }, { name: 'Item 2' }] }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          items: [{ name: 'Item 1' }, { name: 'Item 2' }],
        });
      });
    });
  });

  // ==========================================================================
  // SKIP INVALID
  // ==========================================================================

  describe('skipInvalid option', () => {
    it('should submit and exclude invalid fields from data', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-invalid')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required('Name is required') },
        })
        .add({ id: 'optional', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: '', optional: 'hello' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData).not.toHaveProperty('name');
      expect(submittedData).toHaveProperty('optional', 'hello');
    });

    it('should include valid fields in submitted data', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-valid-fields')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required('Name is required') },
        })
        .add({
          id: 'email',
          type: 'email',
          validation: { validate: required('Email is required') },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: 'John', email: '' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData).toHaveProperty('name', 'John');
      expect(submittedData).not.toHaveProperty('email');
    });

    it('should call onSubmit even when some fields are invalid', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-partial')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .add({ id: 'bio', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: '', bio: 'A bio' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onSubmit with empty object when ALL fields are invalid', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-all-invalid')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .add({
          id: 'email',
          type: 'email',
          validation: { validate: required() },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: '', email: '' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      expect(onSubmit).toHaveBeenCalledWith({});
    });

    it('should run validation and show errors in store even with skipInvalid', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-errors-in-store')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required('Name is required') },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const store = useFormStoreApi();
        const [errors, setErrors] = React.useState<string>('{}');

        return (
          <div>
            <div data-testid="errors">{errors}</div>
            <button
              type="button"
              onClick={async () => {
                await submit({ skipInvalid: true });
                setErrors(JSON.stringify(store.getState().errors));
              }}
              data-testid="submit"
            >
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        const errorsText = screen.getByTestId('errors').textContent!;
        const parsed = JSON.parse(errorsText);
        expect(parsed.name).toBeDefined();
        expect(parsed.name.length).toBeGreaterThan(0);
      });

      expect(onSubmit).toHaveBeenCalled();
    });

    it('should handle repeatable fields with skipInvalid', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'skip-repeatable')
        .add({ id: 'title', type: 'text' })
        .addRepeatable('items', (r) =>
          r
            .add({
              id: 'name',
              type: 'text',
              validation: { validate: required('Item name required') },
            })
            .min(1)
            .defaultValue({ name: '' })
        )
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ title: 'My List', items: [{ name: '' }] }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      // title should still be there, invalid repeatable field should be excluded
      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData).toHaveProperty('title', 'My List');
    });
  });

  // ==========================================================================
  // BUILDER-LEVEL DEFAULTS
  // ==========================================================================

  describe('builder-level defaults', () => {
    it('should use skipInvalid from form config as default', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'default-skip')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .add({ id: 'bio', type: 'text' })
        .setSubmitOptions({ skipInvalid: true })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit()} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: '', bio: 'A bio' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData).not.toHaveProperty('name');
      expect(submittedData).toHaveProperty('bio', 'A bio');
    });

    it('should allow submit-time options to override builder defaults', async () => {
      const onSubmit = vi.fn();

      // Builder sets skipInvalid, but we override with force at submit time
      const formConfig = form
        .create(config, 'override-default')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .setSubmitOptions({ skipInvalid: true })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      // force should include all fields, even invalid ones
      expect(onSubmit).toHaveBeenCalledWith({ name: '' });
    });

    it('should use force from form config as default', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'default-force')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .setSubmitOptions({ force: true })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit()} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: '' });
      });
    });
  });

  // ==========================================================================
  // BACKWARD COMPATIBILITY
  // ==========================================================================

  describe('backward compatibility', () => {
    it('should still work with React.FormEvent (backward compatible)', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'compat-event')
        .add({ id: 'name', type: 'text' })
        .build();

      const { container } = render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: 'test' }} onSubmit={onSubmit}>
          <div>Content</div>
        </FormProvider>
      );

      const formElement = container.querySelector('form')!;
      fireEvent.submit(formElement);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'test' });
      });
    });

    it('should block submission on invalid form when no options passed', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'compat-block')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const [result, setResult] = React.useState<boolean | null>(null);
        return (
          <div>
            <div data-testid="result">{result === null ? 'null' : result.toString()}</div>
            <button
              type="button"
              onClick={async () => {
                const r = await submit();
                setResult(r);
              }}
              data-testid="submit"
            >
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(screen.getByTestId('result')).toHaveTextContent('false');
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should work with no arguments', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'compat-no-args')
        .add({ id: 'name', type: 'text' })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit()} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: 'value' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'value' });
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should prioritize force over skipInvalid when both are passed', async () => {
      const onSubmit = vi.fn();

      const formConfig = form
        .create(config, 'edge-both')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button
            type="button"
            onClick={() => submit({ force: true, skipInvalid: true })}
            data-testid="submit"
          >
            Submit
          </button>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        // force takes priority: all fields included, no validation
        expect(onSubmit).toHaveBeenCalledWith({ name: '' });
      });
    });

    it('should handle form-level validation errors with skipInvalid', async () => {
      const onSubmit = vi.fn();
      const { custom } = await import('@rilaykit/core');

      const formConfig = form
        .create(config, 'edge-form-level')
        .add({ id: 'name', type: 'text' })
        .add({ id: 'email', type: 'email' })
        .setValidation({
          validate: custom(() => false, 'Form-level validation failed'),
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        return (
          <button type="button" onClick={() => submit({ skipInvalid: true })} data-testid="submit">
            Submit
          </button>
        );
      };

      render(
        <FormProvider
          formConfig={formConfig}
          defaultValues={{ name: 'John', email: 'john@test.com' }}
          onSubmit={onSubmit}
        >
          <TestChild />
        </FormProvider>
      );

      fireEvent.click(screen.getByTestId('submit'));

      // skipInvalid should still submit (fields themselves are valid)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });

    it('should set isSubmitting correctly during forced submission', async () => {
      let resolveSubmit: () => void;
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });
      const onSubmit = vi.fn().mockReturnValue(submitPromise);

      const formConfig = form
        .create(config, 'edge-submitting')
        .add({
          id: 'name',
          type: 'text',
          validation: { validate: required() },
        })
        .build();

      const TestChild = () => {
        const { submit } = useFormConfigContext();
        const { isSubmitting } = useFormSubmitState();
        return (
          <div>
            <div data-testid="is-submitting">{isSubmitting ? 'true' : 'false'}</div>
            <button type="button" onClick={() => submit({ force: true })} data-testid="submit">
              Submit
            </button>
          </div>
        );
      };

      render(
        <FormProvider formConfig={formConfig} defaultValues={{ name: '' }} onSubmit={onSubmit}>
          <TestChild />
        </FormProvider>
      );

      expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');

      fireEvent.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      });

      resolveSubmit!();

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting')).toHaveTextContent('false');
      });
    });
  });
});
