import type { ComponentRenderContext, FormConfiguration, ValidationResult } from '@rilaykit/core';
import { ril, when } from '@rilaykit/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { form } from '../../src/builders/form';
import { FormProvider, useForm } from '../../src/components/FormProvider';
import { useFormStoreApi } from '../../src/stores';

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

function buildForm(): FormConfiguration {
  return form
    .create(rilConfig, 'cond-form')
    .add({ id: 'a', type: 'text', props: { label: 'A' } })
    .add({
      id: 'b',
      type: 'text',
      props: { label: 'B' },
      // Conditionally required, NO base validation config.
      conditions: { required: when('a').equals('x') },
    })
    .build();
}

function LiveConditionChild() {
  const store = useFormStoreApi();
  const { validateForm } = useForm();
  const [result, setResult] = React.useState<ValidationResult | null>(null);

  return (
    <div>
      <button
        type="button"
        data-testid="set-and-validate"
        onClick={async () => {
          // Set the trigger value and validate in the SAME tick — no React flush
          // in between, so the render-derived conditions snapshot is still stale.
          store.getState()._setValue('a', 'x');
          const r = await validateForm();
          setResult(r);
        }}
      >
        Go
      </button>
      <div data-testid="valid">{result ? String(result.isValid) : 'pending'}</div>
      <div data-testid="b-required-error">
        {result ? String(result.errors.some((e) => e.code === 'CONDITIONAL_REQUIRED')) : 'pending'}
      </div>
    </div>
  );
}

describe('BUG 5: validation evaluates conditions against live store values', () => {
  beforeEach(() => {
    rilConfig = createRil();
  });

  it('flags a conditionally-required field when its trigger is set in the same tick', async () => {
    const config = buildForm();
    render(
      <FormProvider formConfig={config} defaultValues={{ a: '', b: '' }}>
        <LiveConditionChild />
      </FormProvider>
    );

    fireEvent.click(screen.getByTestId('set-and-validate'));

    await waitFor(() => {
      expect(screen.getByTestId('valid')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('b-required-error')).toHaveTextContent('true');
  });
});
