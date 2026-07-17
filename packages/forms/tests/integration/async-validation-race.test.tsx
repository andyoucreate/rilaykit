import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';
import { useFieldErrors, useFieldValidationState } from '../../src/stores';

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
 * Value-keyed async validator: 'a' resolves SLOW + INVALID, 'ab' resolves
 * FAST + VALID. This models a slow earlier run finishing after a fast later
 * one — the classic stale-overwrite race.
 */
const raceSchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'race-test',
    validate: async (value: unknown) => {
      if (value === 'a') {
        await delay(100);
        return { issues: [{ message: 'invalid: a' }] };
      }
      await delay(10);
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
    .create(rilConfig, 'race-form')
    .add({
      id: 'f',
      type: 'text',
      props: { label: 'F' },
      validation: { validate: raceSchema },
    })
    .setValidation({ mode: 'onChange' })
    .build();
}

function RaceChild() {
  const errors = useFieldErrors('f');
  const validationState = useFieldValidationState('f');

  return (
    <div>
      <FormField id="f" />
      <div data-testid="error-count">{errors.length}</div>
      <div data-testid="validation-state">{validationState}</div>
    </div>
  );
}

describe('BUG 1: async validation race — stale result must not overwrite current', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('keeps the latest (valid) result when a slow earlier run resolves afterwards', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ f: '' }}>
        <RaceChild />
      </FormProvider>
    );

    const input = screen.getByTestId('input-f');

    // Two changes in the same tick: slow-invalid 'a' then fast-valid 'ab'.
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });

    // Wait past the slow run's delay so it has had a chance to (wrongly) overwrite.
    await delay(150);

    await waitFor(() => {
      expect(screen.getByTestId('validation-state')).toHaveTextContent('valid');
    });
    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
  });
});
