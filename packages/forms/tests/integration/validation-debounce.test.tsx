import type { ComponentRenderContext, FormConfiguration } from '@rilaykit/core';
import { ril } from '@rilaykit/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { form } from '../../src/builders/form';
import { FormField } from '../../src/components/FormField';
import { FormProvider } from '../../src/components/FormProvider';

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

function createRil() {
  return ril.create().component('text', {
    name: 'Text',
    renderer: MockTextInput,
    defaultProps: { label: '' },
  });
}

let rilConfig: ReturnType<typeof createRil>;

// Spy validator shared per-test.
const validateSpy = vi.fn(async (value: unknown) => ({ value }));

const spySchema: StandardSchemaV1<unknown> = {
  '~standard': {
    version: 1,
    vendor: 'spy',
    validate: validateSpy,
  },
};

function buildForm(): FormConfiguration {
  return form
    .create(rilConfig, 'debounce-form')
    .add({
      id: 'f',
      type: 'text',
      props: { label: 'F' },
      validation: { validate: spySchema, debounceMs: 300 },
    })
    .build();
}

describe('BUG 2: validation.debounceMs debounces change-triggered validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    validateSpy.mockClear();
    rilConfig = createRil();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the validator at most once for 5 rapid changes within the debounce window', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ f: '' }}>
        <FormField id="f" />
      </FormProvider>
    );

    const input = screen.getByTestId('input-f');

    // 5 changes well within the 300ms window.
    for (const value of ['1', '12', '123', '1234', '12345']) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
    }

    // Fire the trailing debounced run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(validateSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
