import type { ComponentRenderContext, FormConfiguration, ValidationResult } from '@rilaykit/core';
import { ril, when } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { useFieldErrors, useFieldValidationState, useFormStoreApi, useFormValid } from '../../src/stores';

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Field 'b' is always invalid, but only after a macrotask — long enough for
 * field 'a' to flip and make 'b' invisible while the validation is in flight.
 */
const slowInvalidSchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'invisible-test',
    validate: async () => {
      await delay(50);
      return { issues: [{ message: 'b is invalid' }] };
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
    .create(rilConfig, 'invisible-form')
    .add({ id: 'a', type: 'text', props: { label: 'A' } })
    .add({
      id: 'b',
      type: 'text',
      props: { label: 'B' },
      validation: { validate: slowInvalidSchema, validateOnChange: true },
      conditions: { visible: when('a').equals('show') },
    })
    .build();
}

function InvisibleChild() {
  const store = useFormStoreApi();
  const { validateField } = useForm();
  const errors = useFieldErrors('b');
  const validationState = useFieldValidationState('b');
  const formValid = useFormValid();
  const [done, setDone] = React.useState(false);

  return (
    <div>
      <button
        type="button"
        data-testid="go"
        onClick={async () => {
          // Start validating b (invalid) while a='show' → b visible.
          const p: Promise<ValidationResult> = validateField('b', 'bad');
          // Flip a in the SAME tick so b becomes invisible mid-flight.
          store.getState()._setValue('a', 'hide');
          await p;
          setDone(true);
        }}
      >
        Go
      </button>
      <div data-testid="done">{String(done)}</div>
      <div data-testid="error-count">{errors.length}</div>
      <div data-testid="validation-state">{validationState}</div>
      <div data-testid="form-valid">{String(formValid)}</div>
    </div>
  );
}

describe('async validation must not write errors to a field that became invisible mid-flight', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('skips error/invalid writes when the field is hidden after the await', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ a: 'show', b: '' }}>
        <InvisibleChild />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('go'));

    await waitFor(() => {
      expect(screen.getByTestId('done')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
    expect(screen.getByTestId('validation-state')).not.toHaveTextContent('invalid');
    expect(screen.getByTestId('form-valid')).toHaveTextContent('true');
  });
});
