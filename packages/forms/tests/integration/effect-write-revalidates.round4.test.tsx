// @ts-nocheck - generic constraints relaxed for test ergonomics
import { type ComponentRenderContext, onChange, ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { useFieldErrors, useFormValid } from '../../src/stores';

const MockText = ({ id, field }: ComponentRenderContext) => (
  <input
    data-testid={`input-${id}`}
    value={String(field?.value ?? '')}
    onChange={(e) => field?.onChange(e.target.value)}
  />
);

// city is only valid when its value is exactly 'paris'.
const citySchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) =>
      value === 'paris' ? { value } : { issues: [{ message: 'must be paris' }] },
  },
};

describe('Effect write re-validates target field (round-4, Bug 6)', () => {
  let config: ReturnType<typeof ril.create>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = ril.create().component('text', { name: 'Text', renderer: MockText });
  });

  it('clears a stale error when an effect writes a now-valid value, unblocking isValid', async () => {
    const formConfig = form
      .create(config, 'effect-revalidate')
      .add({ id: 'country', type: 'text' })
      .add({
        id: 'city',
        type: 'text',
        validation: { validate: citySchema },
        effects: [
          onChange('country', (value, { setValue }) => {
            if (value === 'france') setValue('city', 'paris');
          }),
        ],
      })
      .build();

    let validateFieldRef: ((id: string) => Promise<unknown>) | null = null;
    const Probe = () => {
      validateFieldRef = useForm().validateField;
      const valid = useFormValid();
      const cityErrors = useFieldErrors('city');
      return (
        <div>
          <div data-testid="valid">{String(valid)}</div>
          <div data-testid="city-errors">{cityErrors.length}</div>
        </div>
      );
    };

    render(
      <FormProvider formConfig={formConfig} defaultValues={{ country: '', city: 'wrong' }}>
        <FormField id="country" />
        <FormField id="city" />
        <Probe />
      </FormProvider>
    );

    // Seed the error state: city='wrong' is invalid.
    await act(async () => {
      await validateFieldRef?.('city');
    });
    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    expect(screen.getByTestId('city-errors')).toHaveTextContent('1');

    // Effect writes a NOW-VALID value to city via country change.
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: 'france' } });

    await waitFor(() => {
      expect(screen.getByTestId('city-errors')).toHaveTextContent('0');
      expect(screen.getByTestId('valid')).toHaveTextContent('true');
    });
  });
});
