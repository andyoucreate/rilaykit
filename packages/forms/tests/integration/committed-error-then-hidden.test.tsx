import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril, when } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { useFieldErrors, useFormStoreApi, useFormValid } from '../../src/stores';

const MockTextInput = ({ id, props, field }: ComponentRenderContext) => (
  <div data-testid={`field-${id}`}>
    <label>{String(props.label ?? '')}</label>
    <input
      data-testid={`input-${id}`}
      value={String(field?.value ?? '')}
      onChange={(e) => field?.onChange(e.target.value)}
    />
  </div>
);

/**
 * Field 'b' fails validation whenever its value is empty.
 */
const requiredSchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'committed-error-hidden-test',
    validate: (value) => {
      if (value === '' || value === undefined || value === null) {
        return { issues: [{ message: 'b is required' }] };
      }
      return { value };
    },
  },
};

function createRil() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  });
}

let rilConfig: ReturnType<typeof createRil>;

function buildForm(): FormConfiguration {
  return form
    .create(rilConfig, 'committed-error-hidden-form')
    .add({ id: 'a', type: 'text', props: { label: 'A' } })
    .add({
      id: 'b',
      type: 'text',
      props: { label: 'B' },
      validation: { validate: requiredSchema },
      conditions: { visible: when('a').equals('show') },
    })
    .build();
}

function Child() {
  const store = useFormStoreApi();
  const { validateField } = useForm();
  const errors = useFieldErrors('b');
  const formValid = useFormValid();

  return (
    <div>
      <button
        type="button"
        data-testid="validate-b"
        onClick={() => {
          void validateField('b');
        }}
      >
        validate b
      </button>
      <button
        type="button"
        data-testid="hide-b"
        onClick={() => store.getState()._setValue('a', 'hide')}
      >
        hide b
      </button>
      <button
        type="button"
        data-testid="show-b"
        onClick={() => store.getState()._setValue('a', 'show')}
      >
        show b
      </button>
      <div data-testid="error-count">{errors.length}</div>
      <div data-testid="form-valid">{String(formValid)}</div>
    </div>
  );
}

describe('a field hidden AFTER committing a validation error must not wedge isValid', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('clears the committed error and frees isValid when the field becomes hidden', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ a: 'show', b: '' }}>
        <Child />
      </FormProvider>
    );

    // (1) Commit an error on the visible field b.
    fireEvent.click(screen.getByTestId('validate-b'));
    await waitFor(() => {
      expect(screen.getByTestId('error-count')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('form-valid')).toHaveTextContent('false');

    // (2) Hide b by flipping a.
    fireEvent.click(screen.getByTestId('hide-b'));

    // (3) The now-hidden field must no longer contribute to isValid, and its
    // committed error must be cleared.
    await waitFor(() => {
      expect(screen.getByTestId('form-valid')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
  });

  it('re-validates normally after the field becomes visible again', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ a: 'show', b: '' }}>
        <Child />
      </FormProvider>
    );

    // Commit an error, then hide b (clearing it).
    fireEvent.click(screen.getByTestId('validate-b'));
    await waitFor(() => {
      expect(screen.getByTestId('error-count')).toHaveTextContent('1');
    });
    fireEvent.click(screen.getByTestId('hide-b'));
    await waitFor(() => {
      expect(screen.getByTestId('form-valid')).toHaveTextContent('true');
    });

    // Re-show b — the clear must not suppress future validation.
    fireEvent.click(screen.getByTestId('show-b'));

    // Validating the re-shown empty field must make it invalid again.
    fireEvent.click(screen.getByTestId('validate-b'));
    await waitFor(() => {
      expect(screen.getByTestId('error-count')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('form-valid')).toHaveTextContent('false');
  });
});
